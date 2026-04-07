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
import { invokeLLM } from "./_core/llm";

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

    syncMatchData: protectedProcedure
      .input(z.object({ teamNumber: z.string().min(1).max(16) }))
      .mutation(async ({ input }) => {
        return syncTeamMatchData(input.teamNumber);
      }),

    syncFullHistory: protectedProcedure
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

    syncSingleEvent: protectedProcedure
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

    syncTopTeams: protectedProcedure
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
    syncAllQualifiers: protectedProcedure.mutation(async ({ ctx: _ctx }) => {
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

  // ─── Award Potential Analysis ───────────────────────────────────────────────
  awards: router({
    analyzeAwardPotential: publicProcedure
      .input(z.object({ teamNumber: z.string().min(1).max(16) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // Gather all data in parallel
        const [stats, awardRows, progressRows] = await Promise.all([
          getTeamStats(input.teamNumber),
          db.select().from(teamAwards).where(eq(teamAwards.teamNumber, input.teamNumber)).orderBy(desc(teamAwards.createdAt)),
          db.select().from(teamEvents).where(eq(teamEvents.teamNumber, input.teamNumber)).orderBy(desc(teamEvents.eventDate)),
        ]);

        if (!stats) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });

        // Count award types
        const awardCounts: Record<string, number> = {};
        for (const a of awardRows) {
          const key = a.awardName.replace(/\s*\(VIQRC\)\s*/i, "").trim();
          awardCounts[key] = (awardCounts[key] ?? 0) + 1;
        }

        // Compute rule-based scores for each award category
        const skillsRank = stats.skillsRank ?? 999;
        const skillsScore = stats.skillsScore ?? 0;
        const driverScore = stats.driverScore ?? 0;
        const autoScore = stats.autoScore ?? 0;
        const winRate = stats.winRate ?? 0;
        const avgScore = stats.avgAllianceScore ?? 0;
        const totalEvents = stats.totalEvents ?? 0;
        const excellenceCount = (awardCounts["Excellence Award"] ?? 0) + (awardCounts["Excellence Award - Elementary School"] ?? 0);
        const designCount = awardCounts["Design Award"] ?? 0;
        const buildCount = awardCounts["Build Award"] ?? 0;
        const thinkCount = awardCounts["Think Award"] ?? 0;
        const createCount = awardCounts["Create Award"] ?? 0;
        const innovateCount = awardCounts["Innovate Award"] ?? 0;
        const teamworkChampCount = awardCounts["Teamwork Champion Award"] ?? 0;
        const skillsChampCount = awardCounts["Robot Skills Champion"] ?? 0;
        const judgedAwardCount = designCount + buildCount + thinkCount + createCount + innovateCount;

        // Normalize helpers (0-100)
        const rankScore = Math.max(0, 100 - (skillsRank - 1) * 2);
        const winRateScore = winRate;
        const avgScoreNorm = Math.min(100, (avgScore / 350) * 100);
        const skillsScoreNorm = Math.min(100, (skillsScore / 400) * 100);
        const driverNorm = Math.min(100, (driverScore / 230) * 100);
        const autoNorm = Math.min(100, (autoScore / 170) * 100);

        const categories = [
          {
            id: "excellence",
            name: "Excellence Award",
            description: "Highest honor — recognizes overall outstanding performance across all judged and performance criteria.",
            icon: "🏆",
            likelihood: Math.min(100, Math.round(
              rankScore * 0.25 + winRateScore * 0.20 + skillsScoreNorm * 0.20 +
              avgScoreNorm * 0.15 + Math.min(100, excellenceCount * 20) * 0.20
            )),
            evidence: [
              skillsRank <= 5 ? `Ranked #${skillsRank} in skills globally — top contender` : skillsRank <= 15 ? `Skills rank #${skillsRank} is competitive` : null,
              winRate >= 80 ? `${winRate.toFixed(0)}% win rate demonstrates consistent teamwork dominance` : winRate >= 60 ? `${winRate.toFixed(0)}% win rate is solid` : null,
              excellenceCount > 0 ? `Won Excellence Award ${excellenceCount}× this season` : null,
              skillsScore >= 300 ? `Skills score ${skillsScore} is world-class` : null,
            ].filter(Boolean) as string[],
          },
          {
            id: "teamworkChampion",
            name: "Teamwork Champion",
            description: "Awarded to the team with the highest combined teamwork match score in the finals.",
            icon: "🤝",
            likelihood: Math.min(100, Math.round(
              winRateScore * 0.35 + avgScoreNorm * 0.35 + Math.min(100, teamworkChampCount * 20) * 0.30
            )),
            evidence: [
              winRate >= 80 ? `${winRate.toFixed(0)}% win rate — dominant in teamwork matches` : winRate >= 60 ? `${winRate.toFixed(0)}% win rate is above average` : null,
              avgScore >= 250 ? `Average match score ${avgScore.toFixed(0)} is excellent` : avgScore >= 180 ? `Average match score ${avgScore.toFixed(0)} is competitive` : null,
              teamworkChampCount > 0 ? `Won Teamwork Champion ${teamworkChampCount}× this season` : null,
            ].filter(Boolean) as string[],
          },
          {
            id: "robotSkillsChampion",
            name: "Robot Skills Champion",
            description: "Awarded to the team with the highest combined driver + programming skills score.",
            icon: "🤖",
            likelihood: Math.min(100, Math.round(
              skillsScoreNorm * 0.40 + driverNorm * 0.25 + autoNorm * 0.25 + Math.min(100, skillsChampCount * 25) * 0.10
            )),
            evidence: [
              skillsRank <= 3 ? `#${skillsRank} in global skills rankings — elite level` : skillsRank <= 10 ? `Top-10 skills rank (#${skillsRank})` : null,
              skillsScore >= 350 ? `Combined skills score ${skillsScore} is near-perfect` : skillsScore >= 280 ? `Skills score ${skillsScore} is very strong` : null,
              driverScore >= 200 ? `Driver skills score ${driverScore} is exceptional` : null,
              autoScore >= 140 ? `Programming skills score ${autoScore} is exceptional` : null,
              skillsChampCount > 0 ? `Won Robot Skills Champion ${skillsChampCount}× this season` : null,
            ].filter(Boolean) as string[],
          },
          {
            id: "design",
            name: "Design Award",
            description: "Recognizes a team that demonstrates an organized and efficient design process.",
            icon: "📐",
            likelihood: Math.min(100, Math.round(
              Math.min(100, designCount * 30) * 0.50 + Math.min(100, judgedAwardCount * 15) * 0.30 + (totalEvents >= 5 ? 20 : totalEvents * 4) * 0.20
            )),
            evidence: [
              designCount > 0 ? `Won Design Award ${designCount}× this season` : null,
              judgedAwardCount >= 3 ? `Won ${judgedAwardCount} judged awards total — strong engineering notebook` : null,
              totalEvents >= 6 ? `Competed at ${totalEvents} events — extensive documentation opportunity` : null,
            ].filter(Boolean) as string[],
          },
          {
            id: "think",
            name: "Think Award",
            description: "Recognizes a team that best reflects the VEX IQ spirit of scientific thinking.",
            icon: "🧠",
            likelihood: Math.min(100, Math.round(
              Math.min(100, thinkCount * 30) * 0.50 + autoNorm * 0.25 + Math.min(100, judgedAwardCount * 15) * 0.25
            )),
            evidence: [
              thinkCount > 0 ? `Won Think Award ${thinkCount}× this season` : null,
              autoScore >= 120 ? `Programming skills score ${autoScore} shows strong autonomous capability` : null,
              judgedAwardCount >= 2 ? `${judgedAwardCount} judged awards indicate strong documentation` : null,
            ].filter(Boolean) as string[],
          },
          {
            id: "build",
            name: "Build Award",
            description: "Recognizes a team for the quality and creativity of their robot construction.",
            icon: "🔧",
            likelihood: Math.min(100, Math.round(
              Math.min(100, buildCount * 30) * 0.50 + skillsScoreNorm * 0.25 + Math.min(100, judgedAwardCount * 15) * 0.25
            )),
            evidence: [
              buildCount > 0 ? `Won Build Award ${buildCount}× this season` : null,
              skillsScore >= 280 ? `High skills score ${skillsScore} reflects a well-built robot` : null,
              judgedAwardCount >= 2 ? `${judgedAwardCount} judged awards suggest strong robot quality` : null,
            ].filter(Boolean) as string[],
          },
          {
            id: "create",
            name: "Create Award",
            description: "Recognizes a team that demonstrates creativity and innovation in their robot design.",
            icon: "✨",
            likelihood: Math.min(100, Math.round(
              Math.min(100, createCount * 30) * 0.50 + Math.min(100, judgedAwardCount * 15) * 0.30 + (totalEvents >= 4 ? 20 : totalEvents * 5) * 0.20
            )),
            evidence: [
              createCount > 0 ? `Won Create Award ${createCount}× this season` : null,
              judgedAwardCount >= 3 ? `${judgedAwardCount} judged awards reflect creative problem-solving` : null,
            ].filter(Boolean) as string[],
          },
        ];

        // Sort by likelihood descending
        categories.sort((a, b) => b.likelihood - a.likelihood);

        // Build a summary prompt for LLM narrative
        const topAward = categories[0];
        const awardSummary = awardRows.slice(0, 8).map(a => `${a.awardName} @ ${a.eventName}`).join("; ");
        const llmPrompt = `You are a VEX IQ robotics expert. Analyze this team's award potential for the upcoming World Championship.

Team: ${stats.teamNumber} (${stats.teamName ?? "Unknown"}) from ${stats.organization ?? "Unknown"}, ${stats.country ?? "Unknown"}
Skills Rank: #${skillsRank} | Skills Score: ${skillsScore} (Driver: ${driverScore}, Auto: ${autoScore})
Win Rate: ${winRate.toFixed(1)}% over ${stats.totalMatches} matches | Avg Match Score: ${avgScore.toFixed(0)}
Season Awards: ${awardSummary || "None recorded"}

Top predicted award: ${topAward.name} (${topAward.likelihood}% likelihood)

Write a 2-3 sentence strategic assessment of this team's strongest award potential at Worlds. Be specific, data-driven, and encouraging. Focus on their most distinctive competitive advantage.`;

        let narrative = "";
        try {
          const llmResult = await invokeLLM({
            messages: [
              { role: "system", content: "You are a concise VEX IQ robotics analyst. Respond in 2-3 sentences only." },
              { role: "user", content: llmPrompt },
            ],
          });
          narrative = (llmResult as any)?.choices?.[0]?.message?.content ?? "";
        } catch {
          narrative = "";
        }

        return {
          teamNumber: stats.teamNumber,
          teamName: stats.teamName,
          categories,
          narrative,
          awardHistory: awardRows.map(a => ({
            awardName: a.awardName,
            eventName: a.eventName,
            qualifiesFor: a.qualifiesFor,
          })),
          stats: {
            skillsRank,
            skillsScore,
            driverScore,
            autoScore,
            winRate,
            avgAllianceScore: avgScore,
            totalEvents,
          },
        };
      }),
  }),

  // ─── Data Syncc ──────────────────────────────────────────────────────────
  sync: router({
    status: publicProcedure.query(async () => {
      const [logs, count] = await Promise.all([getLastSyncStatus(), getTeamCount()]);
      return { logs, teamCount: count };
    }),

    triggerSkillsSync: protectedProcedure.mutation(async ({ ctx: _ctx }) => {
      // Run in background, return immediately
      syncSkillsData().catch((e) =>
        console.error("[Sync] Skills sync error:", e)
      );
      return { started: true, message: "Skills data sync started in background" };
    }),

    runSkillsSync: protectedProcedure.mutation(async ({ ctx: _ctx }) => {
      // Run synchronously and return result
      return syncSkillsData();
    }),
  }),
});

export type AppRouter = typeof appRouter;
