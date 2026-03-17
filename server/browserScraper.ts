/**
 * RobotEvents API-based scraper for VEX IQ Elementary 2025-2026 season.
 *
 * Replaces the previous Puppeteer/Chromium implementation with direct calls to
 * the official RobotEvents v2 REST API. This works in any environment (including
 * production deployments where Chromium is not available).
 *
 * API docs: https://www.robotevents.com/api/v2
 *
 * Key endpoints used:
 *   GET /teams?number[]=XXXX&program[]=41          → look up team ID
 *   GET /teams/{id}/events?season[]=196            → list events for 2025-2026
 *   GET /events/{id}/divisions/{div}/matches?team[]=id  → match results
 *   GET /events/{id}/divisions/{div}/rankings?team[]=id → teamwork rankings
 *   GET /events/{id}/divisions/{div}/finalistRankings?team[]=id → playoff rank
 *   GET /events/{id}/skills?team[]=id              → skills scores
 *   GET /teams/{id}/awards?season[]=196            → awards
 */

import { getDb } from "./db";
import {
  teamEvents,
  teamMatches,
  teamAwards,
  teams,
  InsertTeamEvent,
  InsertTeamMatch,
  InsertTeamAward,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE = "https://www.robotevents.com/api/v2";
const SEASON_ID = 196; // VEX IQ 2025-2026: Mix & Match
const PROGRAM_ID = 41; // VEX IQ Robotics Competition

function getApiKey(): string {
  const key = process.env.ROBOTEVENTS_API_KEY;
  if (!key) throw new Error("ROBOTEVENTS_API_KEY environment variable is not set");
  return key;
}

function apiHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    Accept: "application/json",
  };
}

// ─── Generic paginated fetch ──────────────────────────────────────────────────

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const resp = await fetch(nextUrl, { headers: apiHeaders() });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`RobotEvents API error ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = (await resp.json()) as { data: T[]; meta?: { next_page_url?: string | null } };
    results.push(...(data.data ?? []));
    nextUrl = data.meta?.next_page_url ?? null;
  }

  return results;
}

// ─── Team lookup ──────────────────────────────────────────────────────────────

interface ApiTeam {
  id: number;
  number: string;
  team_name: string;
  grade: string;
}

/** Look up the numeric team ID for a given team number (e.g. "478M") */
async function getTeamId(teamNumber: string): Promise<number | null> {
  const url = `${BASE}/teams?number[]=${encodeURIComponent(teamNumber)}&program[]=${PROGRAM_ID}&per_page=5`;
  const teams = await fetchAllPages<ApiTeam>(url);
  const match = teams.find(
    (t) => t.number === teamNumber && t.grade?.toLowerCase().includes("elementary")
  ) ?? teams.find((t) => t.number === teamNumber);
  return match?.id ?? null;
}

// ─── Event types ──────────────────────────────────────────────────────────────

interface ApiEvent {
  id: number;
  sku: string;
  name: string;
  start: string;
  end: string;
  divisions: Array<{ id: number; name: string }>;
}

interface ApiMatch {
  id: number;
  name: string;
  scheduled: string | null;
  started: string | null;
  scored: boolean;
  alliances: Array<{
    color: "red" | "blue";
    score: number;
    teams: Array<{ team: { id: number; name: string } }>;
  }>;
}

interface ApiRanking {
  rank: number;
  team: { id: number; name: string };
  average_points: number | null;
  high_score: number | null;
}

interface ApiSkill {
  event: { id: number; name: string; code: string };
  type: "driver" | "programming";
  rank: number;
  score: number;
  attempts: number;
}

interface ApiAward {
  id: number;
  event: { id: number; name: string; code: string };
  title: string;
  qualifications: string[];
}

// ─── Public types (kept compatible with old interface) ────────────────────────

export interface EventSkillsData {
  eventCode: string;
  eventName: string;
  eventDate: Date | null;
  teamRank: number | null;
  driverAttempts: number | null;
  driverScore: number | null;
  autoAttempts: number | null;
  autoScore: number | null;
  skillsScore: number | null;
}

export interface MatchRecord {
  matchName: string;
  matchDate: Date | null;
  redTeam: string;
  redScore: number;
  blueTeam: string;
  blueScore: number;
}

export interface EventMatchData {
  eventCode: string;
  eventName: string;
  eventDate: Date | null;
  matches: MatchRecord[];
  teamworkRank: number | null;
  avgTeamworkScore: number | null;
  finalistRank: number | null;
  finalistScore: number | null;
}

export interface AwardRecord {
  eventCode: string;
  eventName: string;
  awardName: string;
  qualifiesFor: string | null;
}

// ─── Core API helpers ─────────────────────────────────────────────────────────

/** Fetch all events for a team in the 2025-2026 season */
async function fetchTeamEvents(teamId: number): Promise<ApiEvent[]> {
  const url = `${BASE}/teams/${teamId}/events?season[]=${SEASON_ID}&per_page=250`;
  return fetchAllPages<ApiEvent>(url);
}

/** Fetch all matches for a team at a specific event/division */
async function fetchEventMatches(
  eventId: number,
  divId: number,
  teamId: number
): Promise<ApiMatch[]> {
  const url = `${BASE}/events/${eventId}/divisions/${divId}/matches?team[]=${teamId}&per_page=250`;
  return fetchAllPages<ApiMatch>(url);
}

/** Fetch teamwork rankings for a team at a specific event/division */
async function fetchTeamworkRanking(
  eventId: number,
  divId: number,
  teamId: number
): Promise<ApiRanking | null> {
  const url = `${BASE}/events/${eventId}/divisions/${divId}/rankings?team[]=${teamId}&per_page=10`;
  const rows = await fetchAllPages<ApiRanking>(url);
  return rows[0] ?? null;
}

/** Fetch finalist (playoff) ranking for a team at a specific event/division */
async function fetchFinalistRanking(
  eventId: number,
  divId: number,
  teamId: number
): Promise<ApiRanking | null> {
  const url = `${BASE}/events/${eventId}/divisions/${divId}/finalistRankings?team[]=${teamId}&per_page=10`;
  const rows = await fetchAllPages<ApiRanking>(url);
  return rows[0] ?? null;
}

/** Fetch skills records for a team in the 2025-2026 season */
async function fetchTeamSkills(teamId: number): Promise<ApiSkill[]> {
  const url = `${BASE}/teams/${teamId}/skills?season[]=${SEASON_ID}&per_page=250`;
  return fetchAllPages<ApiSkill>(url);
}

/** Fetch awards for a team in the 2025-2026 season */
async function fetchTeamAwards(teamId: number): Promise<ApiAward[]> {
  const url = `${BASE}/teams/${teamId}/awards?season[]=${SEASON_ID}&per_page=250`;
  return fetchAllPages<ApiAward>(url);
}

// ─── Team page data (event codes + awards) ────────────────────────────────────

/**
 * Replaces the old Puppeteer-based scrapeTeamPage.
 * Returns event codes (SKUs) and awards for a team.
 */
export async function scrapeTeamPage(teamNumber: string): Promise<{
  eventCodes: string[];
  awards: AwardRecord[];
}> {
  const teamId = await getTeamId(teamNumber);
  if (!teamId) {
    console.warn(`[ApiScraper] Team ${teamNumber} not found in RobotEvents API`);
    return { eventCodes: [], awards: [] };
  }

  const [events, apiAwards] = await Promise.all([
    fetchTeamEvents(teamId),
    fetchTeamAwards(teamId),
  ]);

  const eventCodes = events.map((e) => e.sku);

  const awards: AwardRecord[] = apiAwards.map((a) => {
    // qualifications is an array of strings like ["World Championship", "Event Region Championship"]
    const qualifiesFor = a.qualifications?.length > 0 ? a.qualifications.join(", ") : null;
    return {
      eventCode: a.event.code,
      eventName: a.event.name,
      awardName: a.title,
      qualifiesFor,
    };
  });

  console.log(
    `[ApiScraper] Team ${teamNumber} (id=${teamId}): ${eventCodes.length} events, ${awards.length} awards`
  );

  return { eventCodes, awards };
}

/** Legacy wrapper for backward compatibility */
export async function scrapeTeamEvents(teamNumber: string): Promise<string[]> {
  const { eventCodes } = await scrapeTeamPage(teamNumber);
  return eventCodes;
}

// ─── Event data scraper ───────────────────────────────────────────────────────

/**
 * Replaces the old Puppeteer-based scrapeEventData.
 * Fetches skills, matches, rankings, and finalist rankings for one event.
 */
export async function scrapeEventData(
  eventCode: string,
  teamNumber: string
): Promise<{ skills: EventSkillsData | null; matches: EventMatchData | null }> {
  // Look up team ID
  const teamId = await getTeamId(teamNumber);
  if (!teamId) return { skills: null, matches: null };

  // Find the event by SKU in the team's event list
  const events = await fetchTeamEvents(teamId);
  const event = events.find((e) => e.sku === eventCode);
  if (!event) {
    console.warn(`[ApiScraper] Event ${eventCode} not found for team ${teamNumber}`);
    return { skills: null, matches: null };
  }

  const eventDate = event.start ? new Date(event.start) : null;
  const divId = event.divisions?.[0]?.id ?? 1;

  // Fetch skills for this event
  const allSkills = await fetchTeamSkills(teamId);
  const eventSkills = allSkills.filter((s) => s.event.code === eventCode);
  const driverSkill = eventSkills.find((s) => s.type === "driver");
  const autoSkill = eventSkills.find((s) => s.type === "programming");

  let skills: EventSkillsData | null = null;
  if (driverSkill || autoSkill) {
    const driverScore = driverSkill?.score ?? 0;
    const autoScore = autoSkill?.score ?? 0;
    skills = {
      eventCode,
      eventName: event.name,
      eventDate,
      teamRank: driverSkill?.rank ?? autoSkill?.rank ?? null,
      driverAttempts: driverSkill?.attempts ?? null,
      driverScore: driverScore > 0 ? driverScore : null,
      autoAttempts: autoSkill?.attempts ?? null,
      autoScore: autoScore > 0 ? autoScore : null,
      skillsScore: driverScore + autoScore > 0 ? driverScore + autoScore : null,
    };
  }

  // Fetch matches, rankings, and finalist rankings in parallel
  const [apiMatches, twRanking, finalistRanking] = await Promise.all([
    fetchEventMatches(event.id, divId, teamId),
    fetchTeamworkRanking(event.id, divId, teamId),
    fetchFinalistRanking(event.id, divId, teamId),
  ]);

  // Convert API match format to our MatchRecord format
  const matchRecords: MatchRecord[] = apiMatches.map((m) => {
    const redAlliance = m.alliances.find((a) => a.color === "red");
    const blueAlliance = m.alliances.find((a) => a.color === "blue");
    const redTeam = redAlliance?.teams?.[0]?.team?.name ?? "";
    const blueTeam = blueAlliance?.teams?.[0]?.team?.name ?? "";
    const redScore = redAlliance?.score ?? 0;
    const blueScore = blueAlliance?.score ?? 0;
    const matchDate = m.started
      ? new Date(m.started)
      : m.scheduled
      ? new Date(m.scheduled)
      : eventDate;

    return {
      matchName: m.name,
      matchDate,
      redTeam,
      redScore,
      blueTeam,
      blueScore,
    };
  });

  const matchesResult: EventMatchData = {
    eventCode,
    eventName: event.name,
    eventDate,
    matches: matchRecords,
    teamworkRank: twRanking?.rank ?? null,
    avgTeamworkScore: twRanking?.average_points ?? null,
    finalistRank: finalistRanking?.rank ?? null,
    finalistScore: finalistRanking?.high_score ?? null,
  };

  console.log(
    `[ApiScraper] Event ${eventCode}: ` +
      `skills=${skills ? `driver=${skills.driverScore} auto=${skills.autoScore} total=${skills.skillsScore}` : "none"}, ` +
      `matches=${matchRecords.length}, twRank=${twRanking?.rank ?? "n/a"}, ` +
      `finalistRank=${finalistRanking?.rank ?? "n/a"}`
  );

  return { skills, matches: matchesResult };
}

// ─── Progress event types ───────────────────────────────────────────────────

export type SyncProgressEvent =
  | { type: "start"; total: number; teamNumber: string }
  | { type: "event"; current: number; total: number; eventName: string; eventCode: string; matchCount: number; hasSkills: boolean }
  | { type: "awards"; count: number }
  | { type: "done"; eventsFound: number; skillsRecords: number; matchRecords: number; awardsFound: number }
  | { type: "error"; message: string };

export type ProgressCallback = (event: SyncProgressEvent) => void;

// ─── Full team history sync ───────────────────────────────────────────────────

export async function syncTeamFullHistory(
  teamNumber: string,
  onProgress?: ProgressCallback
): Promise<{
  eventsFound: number;
  skillsRecords: number;
  matchRecords: number;
  awardsFound: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Look up team ID once
  const teamId = await getTeamId(teamNumber);
  if (!teamId) {
    onProgress?.({ type: "error", message: `Team ${teamNumber} not found in RobotEvents API` });
    throw new Error(`Team ${teamNumber} not found in RobotEvents API`);
  }

  let skillsCount = 0;
  let matchCount = 0;
  let awardsCount = 0;

  // ── Fetch events and awards in parallel ──────────────────────────────────
  onProgress?.({ type: "start", total: 0, teamNumber });
  const [events, apiAwards, allSkills] = await Promise.all([
    fetchTeamEvents(teamId),
    fetchTeamAwards(teamId),
    fetchTeamSkills(teamId),
  ]);

  // Emit start with known total
  onProgress?.({ type: "start", total: events.length, teamNumber });

  // ── Save awards ──────────────────────────────────────────────────────────
  if (apiAwards.length > 0) {
    await db.delete(teamAwards).where(eq(teamAwards.teamNumber, teamNumber));

    for (const award of apiAwards) {
      const qualifiesFor = award.qualifications?.length > 0
        ? award.qualifications.join(", ")
        : null;
      try {
        const awardRow: InsertTeamAward = {
          teamNumber,
          eventCode: award.event.code,
          eventName: award.event.name,
          awardName: award.title,
          qualifiesFor,
        };
        await db.insert(teamAwards).values(awardRow).onDuplicateKeyUpdate({
          set: { qualifiesFor },
        });
        awardsCount++;
      } catch (err) {
        console.error(`[ApiScraper] Failed to save award:`, err);
      }
    }
    console.log(`[ApiScraper] Saved ${awardsCount} awards for ${teamNumber}`);
    onProgress?.({ type: "awards", count: awardsCount });
  }

  // ── Scrape each event ────────────────────────────────────────────────────
  let eventIndex = 0;
  for (const event of events) {
    eventIndex++;
    try {
      const eventCode = event.sku;
      const eventDate = event.start ? new Date(event.start) : null;
      const divId = event.divisions?.[0]?.id ?? 1;

      // Skills for this event
      const eventSkills = allSkills.filter((s) => s.event.code === eventCode);
      const driverSkill = eventSkills.find((s) => s.type === "driver");
      const autoSkill = eventSkills.find((s) => s.type === "programming");
      const driverScore = driverSkill?.score ?? 0;
      const autoScore = autoSkill?.score ?? 0;
      const skillsScore = driverScore + autoScore > 0 ? driverScore + autoScore : null;

      // Matches, rankings, finalist in parallel
      const [apiMatches, twRanking, finalistRanking] = await Promise.all([
        fetchEventMatches(event.id, divId, teamId),
        fetchTeamworkRanking(event.id, divId, teamId),
        fetchFinalistRanking(event.id, divId, teamId),
      ]);

      // Upsert team_events row
      const eventRow: InsertTeamEvent = {
        teamNumber,
        eventCode,
        eventName: event.name,
        eventDate,
        eventRank: driverSkill?.rank ?? autoSkill?.rank ?? null,
        driverScore: driverScore > 0 ? driverScore : null,
        autoScore: autoScore > 0 ? autoScore : null,
        skillsScore,
        teamworkRank: twRanking?.rank ?? null,
        avgTeamworkScore: twRanking?.average_points ?? null,
        finalistRank: finalistRanking?.rank ?? null,
        finalistScore: finalistRanking?.high_score ?? null,
        wpApSp: null,
      };

      await db
        .insert(teamEvents)
        .values(eventRow)
        .onDuplicateKeyUpdate({
          set: {
            eventName: eventRow.eventName,
            eventDate: eventRow.eventDate,
            eventRank: eventRow.eventRank,
            driverScore: eventRow.driverScore,
            autoScore: eventRow.autoScore,
            skillsScore: eventRow.skillsScore,
            teamworkRank: eventRow.teamworkRank,
            avgTeamworkScore: eventRow.avgTeamworkScore,
            finalistRank: eventRow.finalistRank,
            finalistScore: eventRow.finalistScore,
          },
        });

      if (skillsScore) skillsCount++;

      // Insert match records
      if (apiMatches.length > 0) {
        await db
          .delete(teamMatches)
          .where(
            and(
              eq(teamMatches.teamNumber, teamNumber),
              eq(teamMatches.eventCode, eventCode)
            )
          );

        for (const m of apiMatches) {
          const redAlliance = m.alliances.find((a) => a.color === "red");
          const blueAlliance = m.alliances.find((a) => a.color === "blue");
          const redTeam = redAlliance?.teams?.[0]?.team?.name ?? "";
          const blueTeam = blueAlliance?.teams?.[0]?.team?.name ?? "";
          const redScore = redAlliance?.score ?? 0;
          const blueScore = blueAlliance?.score ?? 0;

          const isRed = redTeam === teamNumber;
          const isBlue = blueTeam === teamNumber;
          if (!isRed && !isBlue) continue;

          const partnerTeam = isRed ? blueTeam : redTeam;
          const allianceScore = isRed ? redScore : blueScore;

          const matchDate = m.started
            ? new Date(m.started)
            : m.scheduled
            ? new Date(m.scheduled)
            : eventDate;

          const matchRow: InsertTeamMatch = {
            teamNumber,
            eventCode,
            eventName: event.name,
            matchName: m.name,
            matchDate,
            partnerTeam: partnerTeam || null,
            allianceScore,
            opponentScore: null,
            won: null,
            tied: null,
          };

          await db.insert(teamMatches).values(matchRow);
          matchCount++;
        }
      }

      console.log(
        `[ApiScraper] Event ${eventCode}: ${apiMatches.length} matches, ` +
          `twRank=${twRanking?.rank ?? "n/a"}, finalistRank=${finalistRanking?.rank ?? "n/a"}`
      );
      onProgress?.({
        type: "event",
        current: eventIndex,
        total: events.length,
        eventName: event.name,
        eventCode,
        matchCount: apiMatches.length,
        hasSkills: !!skillsScore,
      });
    } catch (err) {
      console.error(`[ApiScraper] Failed to sync event ${event.sku}:`, err);
    }
  }

  // Stamp lastSyncedAt
  try {
    await db
      .update(teams)
      .set({ lastSyncedAt: new Date() })
      .where(eq(teams.teamNumber, teamNumber));
  } catch (e) {
    console.warn(`[ApiScraper] Could not stamp lastSyncedAt for ${teamNumber}:`, e);
  }

  console.log(
    `[ApiScraper] Completed sync for ${teamNumber}: ${events.length} events, ` +
      `${skillsCount} skills records, ${matchCount} match records, ${awardsCount} awards`
  );

  onProgress?.({
    type: "done",
    eventsFound: events.length,
    skillsRecords: skillsCount,
    matchRecords: matchCount,
    awardsFound: awardsCount,
  });

  return {
    eventsFound: events.length,
    skillsRecords: skillsCount,
    matchRecords: matchCount,
    awardsFound: awardsCount,
  };
}

// ─── Date helpers (kept for any legacy callers) ───────────────────────────────

export function parseEventDate(dateText: string): Date | null {
  if (!dateText) return null;
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const parts = dateText.split("-");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = months[parts[1]];
  const year = parseInt(parts[2]);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day);
}
