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
import { syncTeamFullHistory } from "./browserScraper";
import { getDb } from "./db";
import { teams, teamAwards } from "../drizzle/schema";
import { asc, sql, eq } from "drizzle-orm";

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
  }),

  // ─── Data Sync ─────────────────────────────────────────────────────────────
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
