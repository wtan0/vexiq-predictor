/**
 * Browser-based scraper using Puppeteer + system Chromium
 * to bypass Cloudflare protection on RobotEvents.
 *
 * Page structure for event results (e.g. RE-VIQRC-25-3671.html#results-):
 *   - Default tab = "Skills": Table[1] has columns
 *       Rank | Team | Driver Attempts | Driver Highscore | Programming Attempts | Programming Highscore | Total Highscore
 *   - "Division 1" tab: Table[1] has columns
 *       Match | Red Team | Score | Blue Team | Score
 *     Table[3] has columns: Rank | Team | Name | Avg. Points  (teamwork rankings)
 */

// Use puppeteer-extra with stealth plugin to bypass Cloudflare bot detection
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const puppeteerExtra = _require("puppeteer-extra");
const StealthPlugin = _require("puppeteer-extra-plugin-stealth");
puppeteerExtra.use(StealthPlugin());

import type { Browser, Page } from "puppeteer-core";
import { getDb } from "./db";
import {
  teamEvents,
  teamMatches,
  InsertTeamEvent,
  InsertTeamMatch,
} from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const BASE_URL = "https://www.robotevents.com";
const CHROMIUM_PATH = "/usr/bin/chromium-browser";

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && (_browser as any).connected) return _browser;
  _browser = await launchBrowser();
  return _browser;
}

async function launchBrowser(): Promise<Browser> {
  return puppeteerExtra.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
    ],
  }) as Promise<Browser>;
}

async function newPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );
  await page.setViewport({ width: 1280, height: 800 });
  return page;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

// ─── Team event discovery ─────────────────────────────────────────────────────

export async function scrapeTeamEvents(teamNumber: string): Promise<string[]> {
  const browser = await getBrowser();
  const page = await newPage(browser);

  try {
    const url = `${BASE_URL}/teams/VIQRC/${encodeURIComponent(teamNumber)}`;
    console.log(`[BrowserScraper] Loading team page: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await sleep(1000);

    // Click "Match Results" tab to reveal the event list
    const clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const tab = links.find((a) => a.textContent?.trim() === "Match Results");
      if (tab) { (tab as HTMLAnchorElement).click(); return true; }
      return false;
    });
    if (clicked) await sleep(1500);

    // Extract event codes from links like /RE-VIQRC-25-XXXX.html
    const eventCodes = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href]"));
      const codes: string[] = [];
      const seen = new Set<string>();
      for (const a of links) {
        const href = (a as HTMLAnchorElement).href || "";
        const m = href.match(/\/(RE-VIQRC-25-\d+)\.html/);
        if (m && !seen.has(m[1])) {
          seen.add(m[1]);
          codes.push(m[1]);
        }
      }
      return codes;
    });

    console.log(`[BrowserScraper] Found ${eventCodes.length} events for team ${teamNumber}`);
    return eventCodes;
  } catch (err) {
    console.error(`[BrowserScraper] Error getting events for ${teamNumber}:`, err);
    return [];
  } finally {
    await page.close();
  }
}

// ─── Event data scraper ───────────────────────────────────────────────────────

/**
 * Scrape one event page for a specific team.
 *
 * Strategy:
 *  1. Navigate to #results- (Skills tab is active by default).
 *  2. Extract skills data from Table[1] immediately — no click needed.
 *  3. Click "Division 1" tab, wait for render.
 *  4. Extract match results from Table[1] and teamwork rank from Table[3].
 */
export async function scrapeEventData(
  eventCode: string,
  teamNumber: string
): Promise<{ skills: EventSkillsData | null; matches: EventMatchData | null }> {
  const browser = await getBrowser();
  const page = await newPage(browser);

  try {
    const url = `${BASE_URL}/robot-competitions/vex-iq-competition/${eventCode}.html#results-`;
    console.log(`[BrowserScraper] Loading event page: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await sleep(2000);
    // Debug: check what the page contains
    const debugInfo = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll("table"));
      return {
        title: document.title,
        tableCount: tables.length,
        tableHeaders: tables.map((t, i) => ({
          i,
          headers: Array.from(t.querySelectorAll("th")).map(th => th.textContent?.trim() || ""),
          rows: t.querySelectorAll("tbody tr").length,
        })),
      };
    });
    console.log(`[BrowserScraper] Page debug for ${eventCode}:`, JSON.stringify(debugInfo));
    // ── Meta: event name + date ──────────────────────────────────────────────
    const eventMeta = await page.evaluate(() => {
      // Use page title: "Event Name : Robot Events" → strip " : Robot Events"
      const rawTitle = document.title || "";
      const titleParts = rawTitle.split(" : ");
      // Remove the last part if it's "Robot Events"
      const eventName = (titleParts.length > 1 && titleParts[titleParts.length - 1].trim() === "Robot Events")
        ? titleParts.slice(0, -1).join(" : ").trim()
        : (rawTitle || document.querySelector("h1")?.textContent?.trim() || "Unknown Event");
      const allText = document.body.innerText;
      const dateMatch = allText.match(/Date\s+(\d{1,2}-[A-Za-z]+-\d{4})/);
      return { eventName: eventName || "Unknown Event", dateText: dateMatch?.[1] || "" };
    });

    // ── STEP 1: Skills tab is already active — extract skills table ──────────
    // Table[1] = Skills: Rank | Team | Driver Attempts | Driver Highscore |
    //                    Programming Attempts | Programming Highscore | Total Highscore
    const skillsRow = await page.evaluate((team: string) => {
      const tables = Array.from(document.querySelectorAll("table"));
      for (const t of tables) {
        const headers = Array.from(t.querySelectorAll("th")).map(
          (th) => th.textContent?.trim() || ""
        );
        const isSkillsTable =
          headers.some((h) => h.includes("Driver") && h.includes("Highscore")) ||
          headers.some((h) => h.includes("Programming") && h.includes("Highscore")) ||
          headers.some((h) => h.includes("Total") && h.includes("Highscore"));
        if (!isSkillsTable) continue;
        const rows = Array.from(t.querySelectorAll("tbody tr"));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td")).map(
            (td) => td.textContent?.trim() || ""
          );
          // cells: [rank, teamNum, driverAttempts, driverHS, progAttempts, progHS, totalHS]
          if (cells[1] === team) return cells;
        }
      }
      return null;
    }, teamNumber);

    // ── STEP 2: Click "Division 1" tab ───────────────────────────────────────
    const div1Clicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const div1 = links.find((a) => a.textContent?.trim() === "Division 1");
      if (div1) {
        (div1 as HTMLAnchorElement).click();
        return true;
      }
      return false;
    });

    if (div1Clicked) await sleep(1800);

    // ── STEP 3: Extract match results + teamwork rank ────────────────────────
    // After clicking Division 1:
    //   Table[1] = Matches: Match | Red Team | Score | Blue Team | Score
    //   Table[3] = Teamwork rankings: Rank | Team | Name | Avg. Points
    const divisionData = await page.evaluate((team: string) => {
      const tables = Array.from(document.querySelectorAll("table"));

      // --- Match results ---
      const matches: Array<{
        matchName: string;
        matchDateText: string;
        redTeam: string;
        redScore: number;
        blueTeam: string;
        blueScore: number;
      }> = [];

      for (const t of tables) {
        const headers = Array.from(t.querySelectorAll("th")).map(
          (th) => th.textContent?.trim() || ""
        );
        if (
          headers.length >= 5 &&
          headers[0] === "Match" &&
          headers[1] === "Red Team" &&
          headers[3] === "Blue Team"
        ) {
          const rows = Array.from(t.querySelectorAll("tbody tr"));
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll("td"));
            if (cells.length < 5) continue;
            const matchCell = (cells[0] as HTMLElement).innerText?.trim() || "";
            if (
              !matchCell.toLowerCase().includes("teamwork") &&
              !matchCell.toLowerCase().includes("match")
            )
              continue;
            const lines = matchCell
              .split("\n")
              .map((l: string) => l.trim())
              .filter(Boolean);
            matches.push({
              matchName: lines[0] || matchCell,
              matchDateText: lines[1] || "",
              redTeam: cells[1]?.textContent?.trim() || "",
              redScore: parseInt(cells[2]?.textContent?.trim() || "0") || 0,
              blueTeam: cells[3]?.textContent?.trim() || "",
              blueScore: parseInt(cells[4]?.textContent?.trim() || "0") || 0,
            });
          }
          break;
        }
      }

      // --- Teamwork rankings (Avg. Points) ---
      let teamworkRank: number | null = null;
      let avgTeamworkScore: number | null = null;

      for (const t of tables) {
        const headers = Array.from(t.querySelectorAll("th")).map(
          (th) => th.textContent?.trim() || ""
        );
        if (headers.some((h) => h.includes("Avg"))) {
          const rows = Array.from(t.querySelectorAll("tbody tr"));
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll("td")).map(
              (td) => td.textContent?.trim() || ""
            );
            if (cells[1] === team) {
              teamworkRank = parseInt(cells[0]) || null;
              avgTeamworkScore = parseFloat(cells[3]) || null;
              break;
            }
          }
          break;
        }
      }

      return { matches, teamworkRank, avgTeamworkScore };
    }, teamNumber);

    // ── Parse dates ──────────────────────────────────────────────────────────
    const eventDate = parseEventDate(eventMeta.dateText);

    // ── Build skills result ──────────────────────────────────────────────────
    let skills: EventSkillsData | null = null;
    if (skillsRow) {
      skills = {
        eventCode,
        eventName: eventMeta.eventName,
        eventDate,
        teamRank: parseInt(skillsRow[0]) || null,
        driverAttempts: parseInt(skillsRow[2]) || null,
        driverScore: parseInt(skillsRow[3]) || null,
        autoAttempts: parseInt(skillsRow[4]) || null,
        autoScore: parseInt(skillsRow[5]) || null,
        skillsScore: parseInt(skillsRow[6]) || null,
      };
    }

    // ── Build match result ───────────────────────────────────────────────────
    const parsedMatches: MatchRecord[] = divisionData.matches.map((m) => ({
      matchName: m.matchName,
      matchDate: parseMatchDate(m.matchDateText, eventDate),
      redTeam: m.redTeam,
      redScore: m.redScore,
      blueTeam: m.blueTeam,
      blueScore: m.blueScore,
    }));

    const matchesResult: EventMatchData = {
      eventCode,
      eventName: eventMeta.eventName,
      eventDate,
      matches: parsedMatches,
      teamworkRank: divisionData.teamworkRank,
      avgTeamworkScore: divisionData.avgTeamworkScore,
    };

    console.log(
      `[BrowserScraper] Event ${eventCode}: ` +
        `skills=${skills ? `rank#${skills.teamRank} driver=${skills.driverScore} auto=${skills.autoScore} total=${skills.skillsScore}` : "not found"}, ` +
        `matches=${parsedMatches.length}, teamworkRank=${divisionData.teamworkRank}`
    );

    return { skills, matches: matchesResult };
  } catch (err) {
    console.error(
      `[BrowserScraper] Error scraping event ${eventCode} for ${teamNumber}:`,
      err
    );
    return { skills: null, matches: null };
  } finally {
    await page.close();
  }
}

// ─── Full team history sync ───────────────────────────────────────────────────
export async function syncTeamFullHistory(teamNumber: string): Promise<{
  eventsFound: number;
  skillsRecords: number;
  matchRecords: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Use a fresh dedicated browser for this sync to avoid state corruption
  const dedicatedBrowser = await launchBrowser();
  let skillsCount = 0;
  let matchCount = 0;

  // Override getBrowser temporarily for this sync
  const originalBrowser = _browser;
  _browser = dedicatedBrowser;

  let eventCodes: string[] = [];
  try {
    eventCodes = await scrapeTeamEvents(teamNumber);
  } catch (e) {
    console.error(`[BrowserScraper] Failed to get events for ${teamNumber}:`, e);
  }

  for (const eventCode of eventCodes) {
    try {
      const { skills, matches } = await scrapeEventData(eventCode, teamNumber);

      // Upsert team_events row
      const eventRow: InsertTeamEvent = {
        teamNumber,
        eventCode,
        eventName: skills?.eventName || matches?.eventName || eventCode,
        eventDate: skills?.eventDate || matches?.eventDate || null,
        eventRank: skills?.teamRank ?? null,
        driverScore: skills?.driverScore ?? null,
        autoScore: skills?.autoScore ?? null,
        skillsScore: skills?.skillsScore ?? null,
        teamworkRank: matches?.teamworkRank ?? null,
        avgTeamworkScore: matches?.avgTeamworkScore ?? null,
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
          },
        });

      if (skills) skillsCount++;

      // Insert match records
      if (matches && matches.matches.length > 0) {
        // Delete existing match records for this event/team to avoid duplicates
        await db
          .delete(teamMatches)
          .where(
            and(
              eq(teamMatches.teamNumber, teamNumber),
              eq(teamMatches.eventCode, eventCode)
            )
          );

        for (const m of matches.matches) {
          // In VEX IQ, teamwork matches are COOPERATIVE - two teams partner together.
          // Both teams in the match get the same score (it's not Red vs Blue competition).
          // redTeam and blueTeam are the two partner teams; redScore and blueScore are the same score.
          const isRed = m.redTeam === teamNumber;
          const isBlue = m.blueTeam === teamNumber;
          if (!isRed && !isBlue) continue; // team not in this match

          const partnerTeam = isRed ? m.blueTeam : m.redTeam;
          // In VEX IQ, both scores should be the same (cooperative match score)
          // Use the score from the team's side
          const allianceScore = isRed ? m.redScore : m.blueScore;
          // For VEX IQ, there's no opponent score - use the same score
          // won/tied are not meaningful for VEX IQ teamwork - use null
          const matchRow: InsertTeamMatch = {
            teamNumber,
            eventCode,
            eventName: matches.eventName,
            matchName: m.matchName,
            matchDate: m.matchDate,
            partnerTeam,
            allianceScore,
            opponentScore: null,  // VEX IQ is cooperative, no opponent
            won: null,            // Not applicable for VEX IQ teamwork
            tied: null,           // Not applicable for VEX IQ teamwork
          };

          await db.insert(teamMatches).values(matchRow);
          matchCount++;
        }
      }
    } catch (err) {
      console.error(`[BrowserScraper] Failed to sync event ${eventCode}:`, err);
    }
  }

  // Restore original browser and close the dedicated one
  try {
    await dedicatedBrowser.close();
  } catch (e) {
    console.warn("[BrowserScraper] Error closing dedicated browser:", e);
  }
  _browser = originalBrowser;

  console.log(
    `[BrowserScraper] Completed sync for ${teamNumber}: ${eventCodes.length} events, ${skillsCount} skills records, ${matchCount} match records`
  );
  return {
    eventsFound: eventCodes.length,
    skillsRecords: skillsCount,
    matchRecords: matchCount,
  };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseEventDate(dateText: string): Date | null {
  if (!dateText) return null;
  // Format: "7-Mar-2026" or "4-Oct-2025"
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

function parseMatchDate(matchDateText: string, fallback: Date | null): Date | null {
  if (!matchDateText) return fallback;
  // Format: "Mar 7th at 7:30 PM" or "Oct 4th at 2:57 PM"
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const m = matchDateText.match(/([A-Za-z]+)\s+(\d+)/);
  if (!m) return fallback;
  const month = months[m[1]];
  const day = parseInt(m[2]);
  if (month === undefined || isNaN(day)) return fallback;
  const year = fallback ? fallback.getFullYear() : new Date().getFullYear();
  return new Date(year, month, day);
}
