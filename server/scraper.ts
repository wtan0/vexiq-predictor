/**
 * RobotEvents data scraper for VEX IQ Elementary 2025-2026 season.
 * Fetches skills standings CSV and scrapes team match history from public pages.
 */

import axios from "axios";
import { parse as csvParse } from "csv-parse/sync";
import * as cheerio from "cheerio";
import { getDb } from "./db";
import {
  teams,
  teamEvents,
  teamMatches,
  syncLog,
  InsertTeam,
  InsertTeamEvent,
  InsertTeamMatch,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

const SKILLS_CSV_URL =
  "https://www.robotevents.com/robot-competitions/vex-iq-competition/standings/skills/download?search=&event_region=&country=*&grade_level=Elementary";

const TEAM_PAGE_BASE = "https://www.robotevents.com/teams/VIQRC";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

/** Parse the skills CSV and return structured team records */
export function parseSkillsCsv(csvText: string): InsertTeam[] {
  const records = csvParse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  return records.map((r) => ({
    teamNumber: r["Team Number"] ?? "",
    teamName: r["Team Name"] ?? null,
    organization: r["Organization"] ?? null,
    eventRegion: r["Event Region"] ?? null,
    country: r["Country / Region"] ?? null,
    skillsRank: r["Rank"] ? parseInt(r["Rank"]) : null,
    skillsScore: r["Score"] ? parseInt(r["Score"]) : null,
    driverScore: r["Driver Skills"] ? parseInt(r["Driver Skills"]) : null,
    autoScore: r["Autonomous Coding Skills"]
      ? parseInt(r["Autonomous Coding Skills"])
      : null,
    driverScoreAt: r["Highest Driver Score Timestamp"]
      ? new Date(r["Highest Driver Score Timestamp"])
      : null,
    autoScoreAt: r["Highest Autonomous Score Timestamp"]
      ? new Date(r["Highest Autonomous Score Timestamp"])
      : null,
  }));
}

/** Download and parse the skills standings CSV.
 * Falls back to a locally cached file if Cloudflare blocks the request.
 */
export async function fetchSkillsStandings(): Promise<InsertTeam[]> {
  // Try to read from the locally cached CSV first (downloaded via browser)
  const LOCAL_CSV_PATH = "/home/ubuntu/Downloads/skills-standings.csv";
  try {
    const { readFileSync } = await import("fs");
    const csvText = readFileSync(LOCAL_CSV_PATH, "utf-8");
    if (csvText && csvText.includes("Team Number")) {
      console.log("[Scraper] Using locally cached skills CSV");
      return parseSkillsCsv(csvText);
    }
  } catch {
    // Local file not available, try network
  }

  // Try network download
  const resp = await axios.get(SKILLS_CSV_URL, {
    headers: HEADERS,
    timeout: 30000,
    maxRedirects: 5,
  });
  const data = resp.data as string;
  // Cloudflare challenge page check
  if (data.includes("Just a moment") || data.includes("cf-browser-verification")) {
    throw new Error(
      "RobotEvents is protected by Cloudflare. Please download the skills CSV manually from RobotEvents and place it at " + LOCAL_CSV_PATH
    );
  }
  return parseSkillsCsv(data);
}

interface ScrapedTeamData {
  events: InsertTeamEvent[];
  matches: InsertTeamMatch[];
}

/** Parse match table rows from a RobotEvents team page */
function parseMatchesFromHtml(html: string, teamNumber: string): ScrapedTeamData {
  const $ = cheerio.load(html);
  const events: InsertTeamEvent[] = [];
  const matches: InsertTeamMatch[] = [];

  // Each event is wrapped in a section/card. Look for event headings.
  // Structure on RobotEvents: event link heading, then a table of matches,
  // then a row with Rank and WP/AP/SP summary.

  let currentEventName = "";

  // Find event sections - each event has a heading (link) followed by match rows
  const eventSections: Array<{ name: string; element: any }> = [];

  $("a[href*='/events/']").each((_i: number, el: any) => {
    const text = $(el).text().trim();
    if (text.length > 5 && !text.includes("Copyright")) {
      eventSections.push({ name: text, element: el });
    }
  });

  // Parse all table rows
  $('table').each((_ti: number, table: any) => {
    // Find the nearest preceding event link
    const prevLink = $(table).prevAll("a[href*='/events/']").first();
    if (prevLink.length) {
      currentEventName = prevLink.text().trim();
    }

    $(table)
      .find('tr')
      .each((_ri: number, row: any) => {
        const cells = $(row).find("td");
        if (cells.length < 4) return;

        const col0 = $(cells[0]).text().trim();
        const col1 = $(cells[1]).text().trim();

        // Match rows start with "TeamWork #N" or "Match #N"
        if (!col0.match(/^(TeamWork|Match)\s*#?\d/i)) return;

        const matchName = col0;
        const dateText = col1;

        // Cells: matchName | date | team1 | score1 | team2 | score2
        const team1 = cells.length > 2 ? $(cells[2]).text().trim() : "";
        const score1Raw = cells.length > 3 ? $(cells[3]).text().trim() : "0";
        const team2 = cells.length > 4 ? $(cells[4]).text().trim() : "";
        const score2Raw = cells.length > 5 ? $(cells[5]).text().trim() : "0";

        const score1 = parseInt(score1Raw) || 0;
        const score2 = parseInt(score2Raw) || 0;

        // Determine which side our team is on - bold/strong indicates our team
        const boldTeam1 = $(cells[2]).find("strong, b").text().trim();
        const boldTeam2 = cells.length > 4 ? $(cells[4]).find("strong, b").text().trim() : "";

        const isTeam1 =
          boldTeam1 === teamNumber ||
          team1 === teamNumber ||
          team1.replace(/\s/g, "") === teamNumber;
        const isTeam2 =
          boldTeam2 === teamNumber ||
          team2 === teamNumber ||
          team2.replace(/\s/g, "") === teamNumber;

        const myScore = isTeam1 ? score1 : isTeam2 ? score2 : score1;
        const oppScore = isTeam1 ? score2 : isTeam2 ? score1 : score2;
        // In VEX IQ cooperative matches, the "other" team on the same side is the partner
        // In TeamWork matches both teams cooperate against a target score
        // We treat the other team in the row as the partner
        const partnerTeam = isTeam1 ? team2 : isTeam2 ? team1 : null;

        let matchDate: Date | null = null;
        if (dateText) {
          try {
            const d = new Date(dateText);
            if (!isNaN(d.getTime())) matchDate = d;
          } catch {
            // ignore
          }
        }

        matches.push({
          teamNumber,
          eventName: currentEventName || "Unknown Event",
          matchName,
          matchDate,
          partnerTeam: partnerTeam || null,
          allianceScore: myScore,
          opponentScore: oppScore,
          // In VEX IQ cooperative, winning means beating the target/high score
          // We record whether this team's score was higher than opponent
          won: myScore > oppScore ? true : myScore < oppScore ? false : null,
        });
      });

    // Look for rank/WP row in this table
    $(table)
      .find("tr")
      .each((_ri: number, row: any) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const label = $(cells[0]).text().trim().toLowerCase();
        if (label === "rank") {
          const rankVal = parseInt($(cells[1]).text().trim()) || null;
          if (currentEventName && rankVal) {
            events.push({
              teamNumber,
              eventName: currentEventName,
              eventRank: rankVal,
              driverScore: null,
              autoScore: null,
              skillsScore: null,
              wpApSp: null,
              eventDate: null,
            });
          }
        }
        if (label === "wp / ap / sp" || label === "wp/ap/sp") {
          const wpVal = $(cells[1]).text().trim();
          // Update last event entry
          const last = events[events.length - 1];
          if (last && last.eventName === currentEventName) {
            last.wpApSp = wpVal;
          }
        }
      });
  });

  return { events, matches };
}

/** Scrape match history for a single team from RobotEvents public page */
export async function scrapeTeamMatchesDetailed(
  teamNumber: string
): Promise<ScrapedTeamData> {
  const url = `${TEAM_PAGE_BASE}/${encodeURIComponent(teamNumber)}`;
  let html: string;
  try {
    const resp = await axios.get(url, {
      headers: HEADERS,
      timeout: 20000,
    });
    html = resp.data as string;
  } catch {
    return { events: [], matches: [] };
  }

  return parseMatchesFromHtml(html, teamNumber);
}

/** Upsert teams from skills CSV into database */
export async function upsertTeamsFromCsv(teamList: InsertTeam[]): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let count = 0;
  const BATCH = 50;
  for (let i = 0; i < teamList.length; i += BATCH) {
    const batch = teamList.slice(i, i + BATCH);
    for (const team of batch) {
      if (!team.teamNumber) continue;
      await db
        .insert(teams)
        .values(team)
        .onDuplicateKeyUpdate({
          set: {
            teamName: team.teamName,
            organization: team.organization,
            eventRegion: team.eventRegion,
            country: team.country,
            skillsRank: team.skillsRank,
            skillsScore: team.skillsScore,
            driverScore: team.driverScore,
            autoScore: team.autoScore,
            driverScoreAt: team.driverScoreAt,
            autoScoreAt: team.autoScoreAt,
          },
        });
      count++;
    }
  }
  return count;
}

/** Main sync: download skills CSV and store all teams */
export async function syncSkillsData(): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, count: 0, error: "Database not available" };

  const [logEntry] = await db
    .insert(syncLog)
    .values({ syncType: "skills_csv", status: "running" })
    .$returningId();
  const logId = logEntry.id;

  try {
    const teamList = await fetchSkillsStandings();
    const count = await upsertTeamsFromCsv(teamList);

    await db
      .update(syncLog)
      .set({ status: "success", recordsProcessed: count, completedAt: new Date() })
      .where(eq(syncLog.id, logId));

    return { success: true, count };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(syncLog)
      .set({ status: "error", errorMessage: msg, completedAt: new Date() })
      .where(eq(syncLog.id, logId));
    return { success: false, count: 0, error: msg };
  }
}

/** Scrape and store match data for a specific team */
export async function syncTeamMatchData(teamNumber: string): Promise<{
  success: boolean;
  matchCount: number;
  eventCount: number;
  error?: string;
}> {
  const db = await getDb();
  if (!db) return { success: false, matchCount: 0, eventCount: 0, error: "DB unavailable" };

  try {
    const { events: evts, matches: mts } = await scrapeTeamMatchesDetailed(teamNumber);

    if (evts.length > 0) {
      await db.delete(teamEvents).where(eq(teamEvents.teamNumber, teamNumber));
      for (const ev of evts) {
        await db.insert(teamEvents).values(ev);
      }
    }

    if (mts.length > 0) {
      await db.delete(teamMatches).where(eq(teamMatches.teamNumber, teamNumber));
      for (const m of mts) {
        await db.insert(teamMatches).values(m);
      }
    }

    return { success: true, matchCount: mts.length, eventCount: evts.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, matchCount: 0, eventCount: 0, error: msg };
  }
}
