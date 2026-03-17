/**
 * Cron-style background jobs for VEX IQ Championship Predictor.
 *
 * Jobs:
 *  1. Nightly qualifier sync — runs at 3:00 AM server time every day,
 *     re-scrapes all World Championship qualifier teams from RobotEvents.
 *  2. Startup pre-scrape — on first boot, if any qualifier teams have never
 *     been synced (lastSyncedAt IS NULL), kick off a background sync for them.
 */

import { getDb } from "./db";
import { teamAwards, teamSyncJobs, teams } from "../drizzle/schema";
import { syncTeamFullHistory } from "./browserScraper";
import { eq, isNull, sql } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getQualifierTeamNumbers(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .selectDistinct({ teamNumber: teamAwards.teamNumber })
    .from(teamAwards)
    .where(sql`${teamAwards.qualifiesFor} LIKE '%World%'`);
  return rows.map((r) => r.teamNumber);
}

/**
 * Run a full sync for a list of team numbers, updating teamSyncJobs rows.
 * Runs sequentially to avoid overwhelming RobotEvents.
 */
async function runSyncForTeams(teamNumbers: string[], label: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn(`[Cron:${label}] DB unavailable, skipping.`);
    return;
  }

  console.log(`[Cron:${label}] Starting sync for ${teamNumbers.length} teams.`);

  for (const teamNumber of teamNumbers) {
    try {
      // Mark as running
      await db
        .insert(teamSyncJobs)
        .values({ teamNumber, status: "running", startedAt: new Date(), errorMessage: null })
        .onDuplicateKeyUpdate({
          set: { status: "running", startedAt: new Date(), errorMessage: null },
        });

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

      console.log(
        `[Cron:${label}] ✓ ${teamNumber} — ${result.eventsFound} events, ${result.matchRecords} matches`
      );
    } catch (err: any) {
      await db
        .update(teamSyncJobs)
        .set({
          status: "error",
          errorMessage: err?.message ?? "Unknown error",
          completedAt: new Date(),
        })
        .where(eq(teamSyncJobs.teamNumber, teamNumber));
      console.error(`[Cron:${label}] ✗ ${teamNumber}: ${err?.message}`);
    }
  }

  console.log(`[Cron:${label}] Completed sync for ${teamNumbers.length} teams.`);
}

// ─── Nightly sync ─────────────────────────────────────────────────────────────

let _nightlyTimer: ReturnType<typeof setTimeout> | null = null;

function msUntilNextRun(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) {
    // Already past today's run time — schedule for tomorrow
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

async function runNightlySync(): Promise<void> {
  console.log("[Cron:NightlySync] Starting nightly qualifier sync...");
  const qualTeams = await getQualifierTeamNumbers();
  if (qualTeams.length === 0) {
    console.log("[Cron:NightlySync] No qualifier teams found, skipping.");
  } else {
    await runSyncForTeams(qualTeams, "NightlySync");
  }
  // Schedule the next run in 24 hours
  scheduleNightlySync();
}

export function scheduleNightlySync(): void {
  if (_nightlyTimer) clearTimeout(_nightlyTimer);
  const ms = msUntilNextRun(3, 0); // 3:00 AM
  const nextRun = new Date(Date.now() + ms);
  console.log(`[Cron:NightlySync] Next run scheduled at ${nextRun.toLocaleString()} (in ${Math.round(ms / 60000)} min)`);
  _nightlyTimer = setTimeout(() => {
    runNightlySync().catch((e) => console.error("[Cron:NightlySync] Fatal:", e));
  }, ms);
}

// ─── Startup pre-scrape ───────────────────────────────────────────────────────

/**
 * On startup: find all World qualifier teams that have never been synced
 * (lastSyncedAt IS NULL) and kick off a background sync for them.
 *
 * Waits 30 seconds after server start before beginning, to allow the DB
 * connection to stabilise and avoid blocking the initial request.
 */
export function scheduleStartupPrescrape(): void {
  setTimeout(async () => {
    try {
      const db = await getDb();
      if (!db) {
        console.log("[Cron:Startup] DB unavailable, skipping pre-scrape.");
        return;
      }

      // Get all qualifier team numbers
      const qualTeams = await getQualifierTeamNumbers();
      if (qualTeams.length === 0) {
        console.log("[Cron:Startup] No qualifier teams found yet — run Skills Sync first.");
        return;
      }

      // Find which ones have never been synced
      const syncedRows = await db
        .select({ teamNumber: teams.teamNumber })
        .from(teams)
        .where(sql`${teams.teamNumber} IN (${sql.join(qualTeams.map((t) => sql`${t}`), sql`, `)}) AND ${teams.lastSyncedAt} IS NOT NULL`);

      const syncedSet = new Set(syncedRows.map((r) => r.teamNumber));
      const unsyncedTeams = qualTeams.filter((t) => !syncedSet.has(t));

      if (unsyncedTeams.length === 0) {
        console.log(`[Cron:Startup] All ${qualTeams.length} qualifier teams already synced. Skipping.`);
        return;
      }

      console.log(
        `[Cron:Startup] Found ${unsyncedTeams.length} unsynced qualifier teams out of ${qualTeams.length}. Starting background pre-scrape...`
      );

      // Run in background — do NOT await
      runSyncForTeams(unsyncedTeams, "Startup").catch((e) =>
        console.error("[Cron:Startup] Fatal:", e)
      );
    } catch (e) {
      console.error("[Cron:Startup] Error during startup pre-scrape:", e);
    }
  }, 30_000); // 30-second delay after server start
}
