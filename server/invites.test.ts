import { describe, it, expect } from "vitest";

// Unit tests for invite token logic (pure functions, no DB required)

function generateFakeToken(length = 64): string {
  // Simulate a 32-byte hex token
  return Array.from({ length }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

function getInviteUrl(origin: string, token: string): string {
  return `${origin}/invite/${token}`;
}

function isTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt < new Date();
}

function validateInviteStatus(
  status: "active" | "revoked",
  expiresAt: Date | null | undefined
): { valid: boolean; reason?: string } {
  if (status === "revoked") return { valid: false, reason: "revoked" };
  if (isTokenExpired(expiresAt)) return { valid: false, reason: "expired" };
  return { valid: true };
}

describe("Invite token generation", () => {
  it("generates a 64-character hex token", () => {
    const token = generateFakeToken(64);
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateFakeToken(64)));
    expect(tokens.size).toBe(100);
  });
});

describe("Invite URL construction", () => {
  it("builds a correct invite URL", () => {
    const url = getInviteUrl("https://example.manus.space", "abc123");
    expect(url).toBe("https://example.manus.space/invite/abc123");
  });

  it("works with localhost origin", () => {
    const url = getInviteUrl("http://localhost:3000", "deadbeef");
    expect(url).toBe("http://localhost:3000/invite/deadbeef");
  });
});

describe("Invite status validation", () => {
  it("returns valid for active non-expired invite", () => {
    const result = validateInviteStatus("active", null);
    expect(result.valid).toBe(true);
  });

  it("returns invalid for revoked invite", () => {
    const result = validateInviteStatus("revoked", null);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("revoked");
  });

  it("returns invalid for expired invite", () => {
    const pastDate = new Date(Date.now() - 1000);
    const result = validateInviteStatus("active", pastDate);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("expired");
  });

  it("returns valid for invite with future expiry", () => {
    const futureDate = new Date(Date.now() + 86_400_000); // +1 day
    const result = validateInviteStatus("active", futureDate);
    expect(result.valid).toBe(true);
  });

  it("null expiresAt means never expires", () => {
    expect(isTokenExpired(null)).toBe(false);
    expect(isTokenExpired(undefined)).toBe(false);
  });
});

describe("Expiry calculation", () => {
  it("calculates correct expiry from days", () => {
    const days = 7;
    const before = Date.now();
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    const after = Date.now();
    const expected = days * 86_400_000;
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(expected - 10);
    expect(expiresAt.getTime() - after).toBeLessThanOrEqual(expected + 10);
  });
});
