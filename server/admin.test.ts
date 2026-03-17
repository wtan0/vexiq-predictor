import { describe, it, expect } from "vitest";

// Unit tests for admin user management logic (pure functions, no DB required)

type Role = "admin" | "user";

interface UserRecord {
  openId: string;
  name: string | null;
  role: Role;
  createdAt: Date;
}

/** Simulate role validation logic from the setRole procedure */
function validateRoleChange(
  callerOpenId: string,
  targetOpenId: string,
  callerRole: Role,
  newRole: Role
): { allowed: boolean; reason?: string } {
  if (callerRole !== "admin") return { allowed: false, reason: "FORBIDDEN" };
  if (callerOpenId === targetOpenId) return { allowed: false, reason: "Cannot change your own role" };
  if (newRole !== "admin" && newRole !== "user") return { allowed: false, reason: "Invalid role" };
  return { allowed: true };
}

/** Simulate the listUsers enrichment — join users with invite uses */
function enrichUsersWithInviteSource(
  users: UserRecord[],
  inviteUses: { acceptedByOpenId: string; invitationId: number; acceptedAt: Date }[],
  invitations: { id: number; label: string | null; token: string; createdByName: string | null }[]
) {
  const inviteMap = new Map(invitations.map((i) => [i.id, i]));
  const useMap = new Map(inviteUses.map((u) => [u.acceptedByOpenId, u]));
  return users.map((u) => {
    const use = useMap.get(u.openId);
    const invite = use ? inviteMap.get(use.invitationId) : undefined;
    return {
      ...u,
      inviteLabel: invite?.label ?? null,
      inviteToken: invite?.token ?? null,
      invitedBy: invite?.createdByName ?? null,
      inviteAcceptedAt: use?.acceptedAt ?? null,
    };
  });
}

describe("Admin role change validation", () => {
  it("allows admin to promote a user", () => {
    const result = validateRoleChange("admin1", "user1", "admin", "admin");
    expect(result.allowed).toBe(true);
  });

  it("allows admin to demote another admin", () => {
    const result = validateRoleChange("admin1", "admin2", "admin", "user");
    expect(result.allowed).toBe(true);
  });

  it("forbids non-admin from changing roles", () => {
    const result = validateRoleChange("user1", "user2", "user", "admin");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("FORBIDDEN");
  });

  it("forbids admin from changing their own role", () => {
    const result = validateRoleChange("admin1", "admin1", "admin", "user");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/own role/i);
  });
});

describe("User list invite source enrichment", () => {
  const users: UserRecord[] = [
    { openId: "u1", name: "Alice", role: "admin", createdAt: new Date("2025-01-01") },
    { openId: "u2", name: "Bob", role: "user", createdAt: new Date("2025-02-01") },
    { openId: "u3", name: "Carol", role: "user", createdAt: new Date("2025-03-01") },
  ];

  const invitations = [
    { id: 10, label: "Coach invite", token: "tok123", createdByName: "Alice" },
  ];

  const inviteUses = [
    { acceptedByOpenId: "u2", invitationId: 10, acceptedAt: new Date("2025-02-01") },
  ];

  it("enriches user who accepted an invite with invite source", () => {
    const result = enrichUsersWithInviteSource(users, inviteUses, invitations);
    const bob = result.find((u) => u.openId === "u2")!;
    expect(bob.inviteLabel).toBe("Coach invite");
    expect(bob.inviteToken).toBe("tok123");
    expect(bob.invitedBy).toBe("Alice");
    expect(bob.inviteAcceptedAt).toBeInstanceOf(Date);
  });

  it("sets null invite fields for users who signed up directly", () => {
    const result = enrichUsersWithInviteSource(users, inviteUses, invitations);
    const carol = result.find((u) => u.openId === "u3")!;
    expect(carol.inviteLabel).toBeNull();
    expect(carol.inviteToken).toBeNull();
    expect(carol.invitedBy).toBeNull();
    expect(carol.inviteAcceptedAt).toBeNull();
  });

  it("preserves all original user fields", () => {
    const result = enrichUsersWithInviteSource(users, inviteUses, invitations);
    const alice = result.find((u) => u.openId === "u1")!;
    expect(alice.name).toBe("Alice");
    expect(alice.role).toBe("admin");
  });

  it("handles empty invite uses gracefully", () => {
    const result = enrichUsersWithInviteSource(users, [], invitations);
    result.forEach((u) => {
      expect(u.inviteToken).toBeNull();
      expect(u.invitedBy).toBeNull();
    });
  });
});

describe("Accepted-by list filtering", () => {
  it("returns only uses for the correct invitation", () => {
    const allUses = [
      { invitationId: 10, acceptedByOpenId: "u2", acceptedByName: "Bob", acceptedAt: new Date() },
      { invitationId: 11, acceptedByOpenId: "u3", acceptedByName: "Carol", acceptedAt: new Date() },
    ];
    const filtered = allUses.filter((u) => u.invitationId === 10);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].acceptedByName).toBe("Bob");
  });

  it("returns empty array when no one has accepted", () => {
    const allUses: { invitationId: number; acceptedByOpenId: string; acceptedByName: string; acceptedAt: Date }[] = [];
    const filtered = allUses.filter((u: any) => u.invitationId === 99);
    expect(filtered).toHaveLength(0);
  });
});
