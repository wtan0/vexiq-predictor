import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { searchTeams, getLastSyncStatus, getTeamCount } from "./db";
import {
  getTeamStats,
  computeHeadToHead,
  getSeasonProgress,
  getWorldFinalsContenders,
} from "./analytics";
import { syncSkillsData, syncTeamMatchData } from "./scraper";
import { syncTeamFullHistory, scrapeEventData } from "./browserScraper";
import { teamMatches, teamEvents, teamSyncJobs, teamAwards, teams, invitations, inviteUses, users } from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { asc, sql, eq, and, desc } from "drizzle-orm";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Team Search ───────────────────────────────────────────────────────────
  teams: router({
    search: publicProcedure
      .input(z.object({ query: z.string().min(1).max(64), limit: z.number().min(1).max(50).default(20) }))
      .query(async ({ input }) => {
        return searchTeams(input.query, input.limit);
      }),

    detail: publicProcedure
      .input(z.object({ teamNumber: z.string().min(1).max(16) }))
      .query(async ({ input }) => {
        const stats = await getTeamStats(input.teamNumber);
        return stats;
      }),

    seasonProgress: publicProcedure
      .input(z.object({ teamNumber: z.string().min(1).max(16) }))
      .query(async ({ input }) => {
        return getSeasonProgress(input.teamNumber);
      }),

    syncMatchData: publicProcedure
      .input(z.object({ teamNumber: z.string().min(1).max(16) }))
      .mutation(async ({ input }) => {
        return syncTeamMatchData(input.teamNumber);
      }),

    syncFullHistory: publicProcedure
      .input(z.object({ teamNumber: z.string().min(1).max(16) }))
      .mutation(async ({ input }) => {
        return syncTeamFullHistory(input.teamNumber);
      }),

    awards: publicProcedure
      .input(z.object({ teamNumber: z.string().min(1).max(16) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const rows = await db
          .select()
          .from(teamAwards)
          .where(eq(teamAwards.teamNumber, input.teamNumber))
          .orderBy(teamAwards.eventCode);
        return rows;
      }),

    syncSingleEvent: publicProcedure
      .input(z.object({
        teamNumber: z.string().min(1).max(16),
        eventCode: z.string().min(1).max(32),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { skills, matches } = await scrapeEventData(input.eventCode, input.teamNumber);
        // Upsert team_events row
        if (skills || matches) {
          const eventRow = {
            teamNumber: input.teamNumber,
            eventCode: input.eventCode,
            eventName: skills?.eventName || matches?.eventName || input.eventCode,
            eventDate: skills?.eventDate || matches?.eventDate || null,
            eventRank: skills?.teamRank ?? null,
            driverScore: skills?.driverScore ?? null,
            autoScore: skills?.autoScore ?? null,
            skillsScore: skills?.skillsScore ?? null,
            teamworkRank: matches?.teamworkRank ?? null,
            avgTeamworkScore: matches?.avgTeamworkScore ?? null,
            wpApSp: null,
          };
          await db.insert(teamEvents).values(eventRow).onDuplicateKeyUpdate({
            set: {
              eventName: eventRow.eventName,
              eventDate: eventRow.eventDate,
              eventRank: eventRow.eventRank,
              driverScore: eventRow.driverScore,
              autoScore: eventRow.autoScore,
              skillsScore: eventRow.skillsScore,
              teamworkRank: eventRow.teamworkRank,
              avgTeamworkScore: eventRow.avgTeamworkScore,
            },
          });
        }
        // Replace match records for this event
        let matchCount = 0;
        if (matches && matches.matches.length > 0) {
          await db.delete(teamMatches).where(
            and(eq(teamMatches.teamNumber, input.teamNumber), eq(teamMatches.eventCode, input.eventCode))
          );
          for (const m of matches.matches) {
            const isRed = m.redTeam === input.teamNumber;
            const isBlue = m.blueTeam === input.teamNumber;
            if (!isRed && !isBlue) continue;
            const partnerTeam = isRed ? m.blueTeam : m.redTeam;
            const allianceScore = isRed ? m.redScore : m.blueScore;
            await db.insert(teamMatches).values({
              teamNumber: input.teamNumber,
              eventCode: input.eventCode,
              eventName: matches.eventName,
              matchName: m.matchName,
              matchDate: m.matchDate,
              partnerTeam,
              allianceScore,
              opponentScore: null,
              won: null,
              tied: null,
            });
            matchCount++;
          }
        }
        return {
          eventCode: input.eventCode,
          skillsFound: !!skills,
          matchCount,
          teamworkRank: matches?.teamworkRank ?? null,
        };
      }),

    eventMatches: publicProcedure
      .input(z.object({
        teamNumber: z.string().min(1).max(16),
        eventCode: z.string().min(1).max(32),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db
          .select()
          .from(teamMatches)
          .where(
            and(
              eq(teamMatches.teamNumber, input.teamNumber),
              eq(teamMatches.eventCode, input.eventCode)
            )
          )
          .orderBy(teamMatches.matchDate);
      }),

    syncTopTeams: publicProcedure
      .input(z.object({ count: z.number().min(1).max(20).default(5) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) return { synced: 0, failed: 0, teams: [] };

        // Get top teams by skills rank
        const topTeams = await db
          .select({ teamNumber: teams.teamNumber, skillsRank: teams.skillsRank })
          .from(teams)
          .where(sql`${teams.skillsScore} IS NOT NULL AND ${teams.skillsScore} > 0`)
          .orderBy(asc(teams.skillsRank))
          .limit(input.count);

        let synced = 0;
        let failed = 0;
        const results: { teamNumber: string; status: string; events?: number }[] = [];

        for (const team of topTeams) {
          try {
            const result = await syncTeamFullHistory(team.teamNumber);
            synced++;
            results.push({ teamNumber: team.teamNumber, status: "ok", events: result.eventsFound });
          } catch (e: any) {
            failed++;
            results.push({ teamNumber: team.teamNumber, status: `error: ${e.message}` });
          }
        }

        return { synced, failed, teams: results };
      }),
  }),

  // ─── Head-to-Head Comparison ───────────────────────────────────────────────
  comparison: router({
    headToHead: publicProcedure
      .input(
        z.object({
          teamA: z.string().min(1).max(16),
          teamB: z.string().min(1).max(16),
        })
      )
      .query(async ({ input }) => {
        return computeHeadToHead(input.teamA, input.teamB);
      }),
  }),

  // ─── World Finals Predictor ────────────────────────────────────────────────
  worldFinals: router({
    contenders: publicProcedure
      .input(z.object({ topN: z.number().min(10).max(200).default(50) }))
      .query(async ({ input }) => {
        return getWorldFinalsContenders(input.topN);
      }),

    // Returns the set of team numbers that have a confirmed World Championship qualifier award
    qualifierTeams: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .selectDistinct({ teamNumber: teamAwards.teamNumber })
        .from(teamAwards)
        .where(sql`${teamAwards.qualifiesFor} LIKE '%World%'`);
      return rows.map((r) => r.teamNumber);
    }),

    // Returns per-team sync job status for all qualifier teams
    syncProgress: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      // Get all qualifier team numbers
      const qualRows = await db
        .selectDistinct({ teamNumber: teamAwards.teamNumber })
        .from(teamAwards)
        .where(sql`${teamAwards.qualifiesFor} LIKE '%World%'`);
      const qualTeams = qualRows.map((r) => r.teamNumber);
      if (qualTeams.length === 0) return [];

      // Get sync job rows for those teams
      const jobRows = await db
        .select()
        .from(teamSyncJobs)
        .where(sql`${teamSyncJobs.teamNumber} IN (${sql.join(qualTeams.map((t) => sql`${t}`), sql`, `)})`);

      const jobMap = new Map(jobRows.map((j) => [j.teamNumber, j]));

      return qualTeams.map((teamNumber) => {
        const job = jobMap.get(teamNumber);
        return {
          teamNumber,
          status: job?.status ?? "pending",
          eventsFound: job?.eventsFound ?? 0,
          matchRecords: job?.matchRecords ?? 0,
          awardsFound: job?.awardsFound ?? 0,
          errorMessage: job?.errorMessage ?? null,
          startedAt: job?.startedAt ?? null,
          completedAt: job?.completedAt ?? null,
        };
      });
    }),

    // Kick off background scrape for all World qualifier teams
    // Returns immediately; poll syncProgress for updates
    syncAllQualifiers: publicProcedure.mutation(async () => {
      const db = await getDb();
      if (!db) return { started: false, message: "DB unavailable" };

      // Get all qualifier team numbers
      const qualRows = await db
        .selectDistinct({ teamNumber: teamAwards.teamNumber })
        .from(teamAwards)
        .where(sql`${teamAwards.qualifiesFor} LIKE '%World%'`);
      const qualTeams = qualRows.map((r) => r.teamNumber);

      if (qualTeams.length === 0) {
        return { started: false, message: "No World qualifier teams found. Sync skills data first." };
      }

      // Mark all as pending (upsert)
      for (const teamNumber of qualTeams) {
        await db
          .insert(teamSyncJobs)
          .values({ teamNumber, status: "pending" })
          .onDuplicateKeyUpdate({ set: { status: "pending", errorMessage: null } });
      }

      // Run in background — do NOT await
      (async () => {
        for (const teamNumber of qualTeams) {
          try {
            // Mark as running
            await db
              .update(teamSyncJobs)
              .set({ status: "running", startedAt: new Date(), errorMessage: null })
              .where(eq(teamSyncJobs.teamNumber, teamNumber));

            const result = await syncTeamFullHistory(teamNumber);

            await db
              .update(teamSyncJobs)
              .set({
                status: "done",
                eventsFound: result.eventsFound,
                matchRecords: result.matchRecords,
                awardsFound: (result as any).awardsFound ?? 0,
                completedAt: new Date(),
              })
              .where(eq(teamSyncJobs.teamNumber, teamNumber));

            console.log(`[QualifierSync] Done: ${teamNumber} — ${result.eventsFound} events, ${result.matchRecords} matches`);
          } catch (err: any) {
            await db
              .update(teamSyncJobs)
              .set({
                status: "error",
                errorMessage: err?.message ?? "Unknown error",
                completedAt: new Date(),
              })
              .where(eq(teamSyncJobs.teamNumber, teamNumber));
            console.error(`[QualifierSync] Error for ${teamNumber}:`, err?.message);
          }
        }
        console.log(`[QualifierSync] All ${qualTeams.length} qualifier teams processed.`);
      })().catch((e) => console.error("[QualifierSync] Fatal:", e));

      return {
        started: true,
        teamCount: qualTeams.length,
        message: `Started background sync for ${qualTeams.length} World qualifier teams.`,
      };
    }),
  }),

  // ─── Invite System ──────────────────────────────────────────────────────────
  invites: router({
    /** Create a new invite link (protected — must be logged in) */
    create: protectedProcedure
      .input(z.object({
        label: z.string().max(128).optional(),
        expiresInDays: z.number().int().min(1).max(365).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { randomBytes } = await import("crypto");
        const token = randomBytes(32).toString("hex");
        const expiresAt = input.expiresInDays
          ? new Date(Date.now() + input.expiresInDays * 86_400_000)
          : undefined;
        await db.insert(invitations).values({
          token,
          label: input.label ?? null,
          createdByOpenId: ctx.user.openId,
          createdByName: ctx.user.name ?? null,
          status: "active",
          useCount: 0,
          expiresAt,
        });
        return { token };
      }),

    /** List all invites created by the current user */
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(invitations)
        .where(eq(invitations.createdByOpenId, ctx.user.openId))
        .orderBy(desc(invitations.createdAt));
      return rows;
    }),

    /** Revoke an invite (only the creator can revoke) */
    revoke: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db
          .update(invitations)
          .set({ status: "revoked" })
          .where(
            and(
              eq(invitations.token, input.token),
              eq(invitations.createdByOpenId, ctx.user.openId)
            )
          );
        return { success: true };
      }),

    /** Validate an invite token (public — used on the accept page before login) */
    validate: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { valid: false as const, reason: "not_found" as const };
        const [inv] = await db
          .select()
          .from(invitations)
          .where(eq(invitations.token, input.token))
          .limit(1);
        if (!inv) return { valid: false as const, reason: "not_found" as const };
        if (inv.status === "revoked") return { valid: false as const, reason: "revoked" as const };
        if (inv.expiresAt && inv.expiresAt < new Date()) return { valid: false as const, reason: "expired" as const };
        return {
          valid: true as const,
          label: inv.label,
          createdByName: inv.createdByName,
          useCount: inv.useCount,
        };
      }),

    /** Accept an invite (protected — user must be logged in first) */
    accept: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const [inv] = await db
          .select()
          .from(invitations)
          .where(eq(invitations.token, input.token))
          .limit(1);
        if (!inv) throw new Error("Invite not found");
        if (inv.status === "revoked") throw new Error("This invite has been revoked");
        if (inv.expiresAt && inv.expiresAt < new Date()) throw new Error("This invite has expired");
        // Record use (ignore duplicate — idempotent)
        try {
          await db.insert(inviteUses).values({
            invitationId: inv.id,
            acceptedByOpenId: ctx.user.openId,
            acceptedByName: ctx.user.name ?? null,
          });
          await db
            .update(invitations)
            .set({ useCount: sql`${invitations.useCount} + 1` })
            .where(eq(invitations.id, inv.id));
        } catch {
          // Duplicate use — already accepted, that's fine
        }
        return { success: true, createdByName: inv.createdByName };
      }),

    /** List users who accepted a specific invite (creator only) */
    acceptedBy: protectedProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) return [];
        // Verify the caller owns this invite
        const [inv] = await db
          .select({ id: invitations.id })
          .from(invitations)
          .where(
            and(
              eq(invitations.token, input.token),
              eq(invitations.createdByOpenId, ctx.user.openId)
            )
          )
          .limit(1);
        if (!inv) return [];
        const uses = await db
          .select()
          .from(inviteUses)
          .where(eq(inviteUses.invitationId, inv.id))
          .orderBy(desc(inviteUses.acceptedAt));
        return uses.map((u) => ({
          openId: u.acceptedByOpenId,
          name: u.acceptedByName,
          acceptedAt: u.acceptedAt,
        }));
      }),
  }),

  // ─── Admin ───────────────────────────────────────────────────────────────────
  admin: router({
    /** List all users with join date and invite source (admin only) */
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      // Get all users
      const allUsers = await db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt));
      // Get all invite uses to map openId → invite label/token
      const allUses = await db
        .select({
          acceptedByOpenId: inviteUses.acceptedByOpenId,
          invitationId: inviteUses.invitationId,
          acceptedAt: inviteUses.acceptedAt,
        })
        .from(inviteUses);
      // Get all invitations for label lookup
      const allInvites = await db
        .select({ id: invitations.id, label: invitations.label, token: invitations.token, createdByName: invitations.createdByName })
        .from(invitations);
      const inviteMap = new Map(allInvites.map((i) => [i.id, i]));
      const useMap = new Map(allUses.map((u) => [u.acceptedByOpenId, u]));
      return allUsers.map((u) => {
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
    }),

    /** Promote or demote a user's role (admin only) */
    setRole: protectedProcedure
      .input(z.object({
        openId: z.string(),
        role: z.enum(["user", "admin"]),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
        if (input.openId === ctx.user.openId) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot change your own role" });
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        await db
          .update(users)
          .set({ role: input.role })
          .where(eq(users.openId, input.openId));
        return { success: true };
      }),
  }),

  // ─── Data Syncc ──────────────────────────────────────────────────────────
  sync: router({
    status: publicProcedure.query(async () => {
      const [logs, count] = await Promise.all([getLastSyncStatus(), getTeamCount()]);
      return { logs, teamCount: count };
    }),

    triggerSkillsSync: publicProcedure.mutation(async () => {
      // Run in background, return immediately
      syncSkillsData().catch((e) =>
        console.error("[Sync] Skills sync error:", e)
      );
      return { started: true, message: "Skills data sync started in background" };
    }),

    runSkillsSync: publicProcedure.mutation(async () => {
      // Run synchronously and return result
      return syncSkillsData();
    }),
  }),
});

export type AppRouter = typeof appRouter;
