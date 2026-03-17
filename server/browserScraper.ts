/**
 * Browser-based scraper using Puppeteer + system Chromium
 * to bypass Cloudflare protection on RobotEvents.
 *
 * Team page tabs: Info | Rankings | Match Results | Awards
 *
 * Match Results tab: Shows matches grouped by event, with pagination.
 *   Each event section has a table with columns:
 *     Match Name | Date | Team1 | Score | Team2 | Score
 *   Followed by a small Rank/WP table.
 *   Event links in the format /RE-VIQRC-25-XXXX.html
 *
 * Awards tab: Shows awards grouped by event.
 *   Format: [RE-VIQRC-25-XXXX] Event Name
 *           Award Name | Qualifies For
 *
 * Event page structure (e.g. RE-VIQRC-25-3671.html#results-):
 *   - Default tab = "Skills": Table with columns
 *       Rank | Team | Driver Attempts | Driver Highscore | Programming Attempts | Programming Highscore | Total Highscore
 *   - "Division 1" tab: Table with columns
 *       Match | Red Team | Score | Blue Team | Score
 *     Rankings table: Rank | Team | Name | Avg. Points
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
  teamAwards,
  teams,
  InsertTeamEvent,
  InsertTeamMatch,
  InsertTeamAward,
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

export interface AwardRecord {
  eventCode: string;
  eventName: string;
  awardName: string;
  qualifiesFor: string | null;
}

// ─── Team event discovery (with pagination) ───────────────────────────────────

/**
 * Scrape the team page to get all event codes from the Match Results tab.
 * Handles pagination by clicking the "next page" button until all pages are loaded.
 * Also scrapes awards from the Awards tab.
 */
export async function scrapeTeamPage(teamNumber: string): Promise<{
  eventCodes: string[];
  awards: AwardRecord[];
}> {
  const browser = await getBrowser();
  const page = await newPage(browser);

  try {
    const url = `${BASE_URL}/teams/VIQRC/${encodeURIComponent(teamNumber)}`;
    console.log(`[BrowserScraper] Loading team page: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await sleep(1500);

    // ── Click "Match Results" tab ────────────────────────────────────────────
    const clickedMatchResults = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const tab = links.find((a) => a.textContent?.trim() === "Match Results");
      if (tab) { (tab as HTMLAnchorElement).click(); return true; }
      return false;
    });
    if (clickedMatchResults) await sleep(1500);

    // ── Collect event codes across all pages ─────────────────────────────────
    const allEventCodes = new Set<string>();

    const collectEventCodesFromCurrentPage = async () => {
      const codes = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a[href]"));
        const found: string[] = [];
        const seen = new Set<string>();
        for (const a of links) {
          const href = (a as HTMLAnchorElement).href || "";
          const m = href.match(/\/(RE-VIQRC-25-\d+)\.html/);
          if (m && !seen.has(m[1])) {
            seen.add(m[1]);
            found.push(m[1]);
          }
        }
        return found;
      });
      codes.forEach((c) => allEventCodes.add(c));
      return codes.length;
    };

    // Collect from page 1
    await collectEventCodesFromCurrentPage();

    // Check for pagination and iterate through all pages
    // RobotEvents uses Bootstrap pagination: .pagination > .page-item > .page-link
    // The "»" button has spaces: " » " — must trim when matching
    let pageNum = 1;
    while (true) {
      const hasNextPage = await page.evaluate((currentPage: number) => {
        // Use .page-link elements for reliable selection
        const pageLinks = Array.from(document.querySelectorAll(".page-link"));

        // PRIORITY 1: Click the next numbered page link (e.g. "2" when on page 1)
        // This is safer than clicking "»" which jumps to the LAST page, not next page
        const nextPageLink = pageLinks.find((el) => {
          const text = el.textContent?.trim();
          return text === String(currentPage + 1);
        });
        if (nextPageLink) {
          const parentLi = nextPageLink.closest(".page-item");
          if (parentLi && parentLi.classList.contains("disabled")) return false;
          (nextPageLink as HTMLElement).click();
          return true;
        }

        // PRIORITY 2: Look for a "›" (single chevron = next page) button
        // Note: "»" is the LAST PAGE button — do NOT use it for sequential pagination
        const singleNextBtn = pageLinks.find((el) => {
          const text = el.textContent?.trim();
          return text === "›" || text === "Next";
        });
        if (singleNextBtn) {
          const parentLi = singleNextBtn.closest(".page-item");
          if (parentLi && parentLi.classList.contains("disabled")) return false;
          (singleNextBtn as HTMLElement).click();
          return true;
        }

        // No next page found
        return false;
      }, pageNum);

      if (!hasNextPage) break;

      pageNum++;
      await sleep(2000); // Give Vue/React time to re-render after page change
      const newCodes = await collectEventCodesFromCurrentPage();
      console.log(`[BrowserScraper] Page ${pageNum}: found ${newCodes} event codes (total so far: ${allEventCodes.size})`);

      // Safety limit
      if (pageNum >= 20) break;
    }

    console.log(`[BrowserScraper] Found ${allEventCodes.size} total events for team ${teamNumber} across ${pageNum} pages`);

    // ── Click "Awards" tab ───────────────────────────────────────────────────
    const clickedAwards = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a"));
      const tab = links.find((a) => a.textContent?.trim() === "Awards");
      if (tab) { (tab as HTMLAnchorElement).click(); return true; }
      return false;
    });

    const awards: AwardRecord[] = [];

    if (clickedAwards) {
      await sleep(1500);

      // Scrape awards across all pages
      let awardsPageNum = 1;
      while (true) {
        const pageAwards = await page.evaluate(() => {
          const results: Array<{
            eventCode: string;
            eventName: string;
            awardName: string;
            qualifiesFor: string | null;
          }> = [];

          // Awards are structured as:
          // [RE-VIQRC-25-XXXX] Event Name
          //   Award Name | Qualifies For
          // We parse the body text to extract this
          const bodyText = document.body.innerText;
          const lines = bodyText.split("\n").map((l) => l.trim()).filter(Boolean);

          let currentEventCode = "";
          let currentEventName = "";
          let i = 0;

          while (i < lines.length) {
            const line = lines[i];
            // Check if this line is an event header: [RE-VIQRC-25-XXXX] Event Name
            const eventMatch = line.match(/^\[?(RE-VIQRC-25-\d+)\]?\s+(.*)/);
            if (eventMatch) {
              currentEventCode = eventMatch[1];
              currentEventName = eventMatch[2].trim();
              i++;
              continue;
            }
            // Check if this is an award line (not a header, not "Award", not "Qualifies For")
            if (
              currentEventCode &&
              line !== "Award" &&
              line !== "Qualifies For" &&
              line !== "Award\tQualifies For" &&
              !line.startsWith("Team ") &&
              !line.startsWith("VEX ") &&
              !line.startsWith("Info") &&
              !line.startsWith("Rankings") &&
              !line.startsWith("Match Results") &&
              !line.startsWith("Awards") &&
              !line.startsWith("VEX IQ Robotics Competition") &&
              !line.startsWith("Site ") &&
              line.length > 3
            ) {
              // Check if it looks like an award name
              if (
                line.includes("Award") ||
                line.includes("Champion") ||
                line.includes("Excellence") ||
                line.includes("Design") ||
                line.includes("Build") ||
                line.includes("Innovate") ||
                line.includes("Skills")
              ) {
                // Next line might be "Qualifies For" value
                let qualifiesFor: string | null = null;
                if (i + 1 < lines.length) {
                  const nextLine = lines[i + 1];
                  if (
                    nextLine === "Event Region Championship" ||
                    nextLine === "World Championship" ||
                    nextLine.includes("Championship") ||
                    nextLine.includes("Qualifies")
                  ) {
                    qualifiesFor = nextLine;
                    i++;
                  }
                }
                results.push({
                  eventCode: currentEventCode,
                  eventName: currentEventName,
                  awardName: line,
                  qualifiesFor,
                });
              }
            }
            i++;
          }
          return results;
        });

        awards.push(...pageAwards);

        // Check for next page in awards
        // IMPORTANT: Use numbered page link first — "»" jumps to LAST page, not next
        const hasNextAwardsPage = await page.evaluate((currentPage: number) => {
          const pageLinks = Array.from(document.querySelectorAll(".page-link"));
          // Priority 1: numbered next page
          const nextPageLink = pageLinks.find((el) => {
            const text = el.textContent?.trim();
            return text === String(currentPage + 1);
          });
          if (nextPageLink) {
            const parentLi = nextPageLink.closest(".page-item");
            if (parentLi && parentLi.classList.contains("disabled")) return false;
            (nextPageLink as HTMLElement).click();
            return true;
          }
          // Priority 2: single chevron "›" (next page, not last page)
          const singleNext = pageLinks.find((el) => {
            const text = el.textContent?.trim();
            return text === "›" || text === "Next";
          });
          if (singleNext) {
            const parentLi = singleNext.closest(".page-item");
            if (parentLi && parentLi.classList.contains("disabled")) return false;
            (singleNext as HTMLElement).click();
            return true;
          }
          return false;
        }, awardsPageNum);

        if (!hasNextAwardsPage) break;
        awardsPageNum++;
        await sleep(1500);
        if (awardsPageNum >= 10) break;
      }

      console.log(`[BrowserScraper] Found ${awards.length} awards for team ${teamNumber}`);
    }

    return { eventCodes: Array.from(allEventCodes), awards };
  } catch (err) {
    console.error(`[BrowserScraper] Error getting team page for ${teamNumber}:`, err);
    return { eventCodes: [], awards: [] };
  } finally {
    await page.close();
  }
}

// Legacy wrapper for backward compatibility
export async function scrapeTeamEvents(teamNumber: string): Promise<string[]> {
  const { eventCodes } = await scrapeTeamPage(teamNumber);
  return eventCodes;
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
  awardsFound: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Use a fresh dedicated browser for this sync to avoid state corruption
  const dedicatedBrowser = await launchBrowser();
  let skillsCount = 0;
  let matchCount = 0;
  let awardsCount = 0;

  // Override getBrowser temporarily for this sync
  const originalBrowser = _browser;
  _browser = dedicatedBrowser;

  let eventCodes: string[] = [];
  let awards: AwardRecord[] = [];

  try {
    const teamPageData = await scrapeTeamPage(teamNumber);
    eventCodes = teamPageData.eventCodes;
    awards = teamPageData.awards;
  } catch (e) {
    console.error(`[BrowserScraper] Failed to get team page for ${teamNumber}:`, e);
  }

  // ── Save awards ──────────────────────────────────────────────────────────
  if (awards.length > 0) {
    // Delete existing awards for this team
    await db.delete(teamAwards).where(eq(teamAwards.teamNumber, teamNumber));

    for (const award of awards) {
      try {
        const awardRow: InsertTeamAward = {
          teamNumber,
          eventCode: award.eventCode,
          eventName: award.eventName,
          awardName: award.awardName,
          qualifiesFor: award.qualifiesFor,
        };
        await db.insert(teamAwards).values(awardRow).onDuplicateKeyUpdate({
          set: { qualifiesFor: award.qualifiesFor },
        });
        awardsCount++;
      } catch (err) {
        console.error(`[BrowserScraper] Failed to save award:`, err);
      }
    }
    console.log(`[BrowserScraper] Saved ${awardsCount} awards for ${teamNumber}`);
  }

  // ── Scrape each event ────────────────────────────────────────────────────
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

  // Stamp lastSyncedAt on the team record
  try {
    const db = await getDb();
    if (db) await db.update(teams).set({ lastSyncedAt: new Date() }).where(eq(teams.teamNumber, teamNumber));
  } catch (e) {
    console.warn(`[BrowserScraper] Could not stamp lastSyncedAt for ${teamNumber}:`, e);
  }

  console.log(
    `[BrowserScraper] Completed sync for ${teamNumber}: ${eventCodes.length} events, ${skillsCount} skills records, ${matchCount} match records, ${awardsCount} awards`
  );
  return {
    eventsFound: eventCodes.length,
    skillsRecords: skillsCount,
    matchRecords: matchCount,
    awardsFound: awardsCount,
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
