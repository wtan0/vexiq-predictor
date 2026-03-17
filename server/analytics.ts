/**
 * Statistical analysis engine for VEX IQ team performance.
 * Computes winning odds, season trends, and world finals predictions.
 */

import { getDb } from "./db";
import { teams, teamEvents, teamMatches } from "../drizzle/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";

export interface TeamStats {
  teamNumber: string;
  teamName: string | null;
  organization: string | null;
  eventRegion: string | null;
  country: string | null;
  skillsRank: number | null;
  skillsScore: number | null;
  driverScore: number | null;
  autoScore: number | null;
  // Match stats
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  avgAllianceScore: number;
  avgOpponentScore: number;
  // Event stats
  totalEvents: number;
  avgEventRank: number | null;
  bestEventRank: number | null;
  // Composite score for world finals prediction
  compositeScore: number;
  worldFinalsOdds: number; // 0-100 percentage
  // Sync metadata
  lastSyncedAt: Date | null;
}

export interface HeadToHeadResult {
  teamA: TeamStats;
  teamB: TeamStats;
  teamAWinProbability: number; // 0-100
  teamBWinProbability: number; // 0-100
  breakdown: {
    driverSkillsAdvantage: "A" | "B" | "tie";
    autoSkillsAdvantage: "A" | "B" | "tie";
    avgTeamworkScoreAdvantage: "A" | "B" | "tie"; // Average teamwork match score
    rankAdvantage: "A" | "B" | "tie";
    totalSkillsAdvantage: "A" | "B" | "tie"; // Combined skills total
  };
  factors: {
    driverSkillsWeight: number;
    autoSkillsWeight: number;
    avgTeamworkScoreWeight: number;
    rankWeight: number;
    totalSkillsWeight: number;
  };
}

export interface SeasonProgressPoint {
  eventCode: string | null;
  eventName: string;
  eventDate: Date | null;
  driverScore: number | null;
  autoScore: number | null;
  skillsScore: number | null;
  eventRank: number | null;
  teamworkRank: number | null;
  avgTeamworkScore: number | null;
  wpApSp: string | null;
  /** Average match score across all teamwork matches at this event */
  avgMatchScore: number | null;
  /** Best (highest) match score at this event */
  bestMatchScore: number | null;
  /** Total number of teamwork matches played */
  matchTotal: number;
  /** Partner teams encountered at this event */
  partnerTeams: string[];
  /** Finalist ranking at this event (from the Finalist Ranking table) */
  finalistRank: number | null;
  /** Score achieved in the final round */
  finalistScore: number | null;
}

export interface WorldFinalsContender {
  rank: number;
  teamNumber: string;
  teamName: string | null;
  organization: string | null;
  country: string | null;
  skillsRank: number | null;
  skillsScore: number | null;
  driverScore: number | null;
  autoScore: number | null;
  winRate: number;
  totalMatches: number;
  compositeScore: number;
  winProbability: number; // 0-100
}

/** Fetch full stats for a single team */
export async function getTeamStats(teamNumber: string): Promise<TeamStats | null> {
  const db = await getDb();
  if (!db) return null;

  const teamRows = await db
    .select()
    .from(teams)
    .where(eq(teams.teamNumber, teamNumber))
    .limit(1);

  if (teamRows.length === 0) return null;
  const team = teamRows[0];

  // Match stats
  const matchRows = await db
    .select()
    .from(teamMatches)
    .where(eq(teamMatches.teamNumber, teamNumber));

  const totalMatches = matchRows.length;
  const wins = matchRows.filter((m) => m.won === true).length;
  const losses = matchRows.filter((m) => m.won === false).length;
  const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

  const allianceScores = matchRows
    .map((m) => m.allianceScore ?? 0)
    .filter((s) => s > 0);
  const opponentScores = matchRows
    .map((m) => m.opponentScore ?? 0)
    .filter((s) => s > 0);

  const avgAllianceScore =
    allianceScores.length > 0
      ? allianceScores.reduce((a, b) => a + b, 0) / allianceScores.length
      : 0;
  const avgOpponentScore =
    opponentScores.length > 0
      ? opponentScores.reduce((a, b) => a + b, 0) / opponentScores.length
      : 0;

  // Event stats
  const eventRows = await db
    .select()
    .from(teamEvents)
    .where(eq(teamEvents.teamNumber, teamNumber));

  const totalEvents = eventRows.length;
  const ranks = eventRows.map((e) => e.eventRank).filter((r): r is number => r !== null);
  const avgEventRank = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
  const bestEventRank = ranks.length > 0 ? Math.min(...ranks) : null;

  // Finalist ranks across events (lower = better)
  const finalistRanks = eventRows.map((e) => e.finalistRank).filter((r): r is number => r !== null);
  const bestFinalistRank = finalistRanks.length > 0 ? Math.min(...finalistRanks) : null;

  // Final round scores: matches named "Match #X-Y"
  const finalRoundScores = matchRows
    .filter((m) => /^Match\s*#\d+-\d+/i.test(m.matchName ?? ""))
    .map((m) => m.allianceScore ?? 0)
    .filter((s) => s > 0);
  const avgFinalRoundScore = finalRoundScores.length > 0
    ? finalRoundScores.reduce((a, b) => a + b, 0) / finalRoundScores.length
    : 0;

  const compositeScore = computeCompositeScore({
    skillsScore: team.skillsScore,
    driverScore: team.driverScore,
    autoScore: team.autoScore,
    avgAllianceScore,
    avgFinalRoundScore,
    bestFinalistRank,
    totalMatches,
    bestEventRank,
  });

  return {
    teamNumber: team.teamNumber,
    teamName: team.teamName,
    organization: team.organization,
    eventRegion: team.eventRegion,
    country: team.country,
    skillsRank: team.skillsRank,
    skillsScore: team.skillsScore,
    driverScore: team.driverScore,
    autoScore: team.autoScore,
    totalMatches,
    wins,
    losses,
    winRate,
    avgAllianceScore,
    avgOpponentScore,
    totalEvents,
    avgEventRank,
    bestEventRank,
    compositeScore,
    worldFinalsOdds: 0, // Will be set in world finals calculation
    lastSyncedAt: team.lastSyncedAt ?? null,
  };
}

/** Compute a composite performance score (0-1000) for VEX IQ */
function computeCompositeScore(params: {
  skillsScore: number | null;
  driverScore: number | null;
  autoScore: number | null;
  avgAllianceScore: number; // Average regular teamwork match score (cooperative)
  avgFinalRoundScore: number; // Average final round (Match #X-Y) score — higher weight
  bestFinalistRank: number | null; // Best finalist rank across all events (lower = better)
  totalMatches: number;
  bestEventRank: number | null;
}): number {
  const {
    skillsScore, driverScore, autoScore,
    avgAllianceScore, avgFinalRoundScore, bestFinalistRank,
    totalMatches, bestEventRank,
  } = params;

  // VEX IQ Weights:
  // Skills score is the primary predictor.
  // Final round score (Match #X-Y) is the most important teamwork metric — it determines the event champion.
  // Regular teamwork avg is secondary.
  // Finalist rank captures playoff consistency across events.
  const W_SKILLS = 0.30;        // Total skills score (driver + auto combined)
  const W_DRIVER = 0.12;        // Driver skills component
  const W_AUTO = 0.12;          // Autonomous skills component
  const W_FINAL_SCORE = 0.22;   // Average final round (Match #X-Y) score — highest teamwork weight
  const W_AVG_SCORE = 0.12;     // Average regular teamwork match score
  const W_FINALIST_RANK = 0.07; // Best finalist rank across events (playoff consistency)
  const W_RANK = 0.05;          // Best event skills rank

  // Normalize each component to 0-1 range based on known max values for 2025-2026 season
  const MAX_SKILLS = 600;
  const MAX_DRIVER = 350;
  const MAX_AUTO = 280;
  const MAX_SCORE = 420; // Max teamwork score (regular or final)

  const skillsNorm = Math.min((skillsScore ?? 0) / MAX_SKILLS, 1);
  const driverNorm = Math.min((driverScore ?? 0) / MAX_DRIVER, 1);
  const autoNorm = Math.min((autoScore ?? 0) / MAX_AUTO, 1);
  const avgScoreNorm = Math.min(avgAllianceScore / MAX_SCORE, 1);
  // Final round score: if no final round data, fall back to avg score (don't penalize teams without data)
  const finalScoreNorm = avgFinalRoundScore > 0
    ? Math.min(avgFinalRoundScore / MAX_SCORE, 1)
    : avgScoreNorm; // fallback to regular avg if no final round data
  // Finalist rank: lower is better. Top 3 = excellent, top 10 = good.
  const finalistRankNorm = bestFinalistRank
    ? Math.max(0, 1 - (bestFinalistRank - 1) / 10)
    : 0;
  // Event rank: lower is better. Assume top 50 teams are world-class.
  const rankNorm = bestEventRank ? Math.max(0, 1 - (bestEventRank - 1) / 50) : 0;

  // Participation bonus: more matches = more reliable data (max 5%)
  const participationBonus = totalMatches > 0 ? Math.min(totalMatches / 30, 1) * 0.05 : 0;

  const score =
    (skillsNorm * W_SKILLS +
      driverNorm * W_DRIVER +
      autoNorm * W_AUTO +
      finalScoreNorm * W_FINAL_SCORE +
      avgScoreNorm * W_AVG_SCORE +
      finalistRankNorm * W_FINALIST_RANK +
      rankNorm * W_RANK +
      participationBonus) *
    1000;

  return Math.round(score);
}

/** Compute head-to-head winning probability between two teams */
export async function computeHeadToHead(
  teamNumberA: string,
  teamNumberB: string
): Promise<HeadToHeadResult | null> {
  const [statsA, statsB] = await Promise.all([
    getTeamStats(teamNumberA),
    getTeamStats(teamNumberB),
  ]);

  if (!statsA || !statsB) return null;

  // Factor weights for VEX IQ (cooperative teamwork - no win/loss)
  // Final round score (Match #X-Y) is the decisive metric for head-to-head prediction.
  const W = {
    driverSkills: 0.20,    // Driver skills score
    autoSkills: 0.15,      // Autonomous skills score
    finalRoundScore: 0.25, // Final round (Match #X-Y) score — highest weight
    avgTeamworkScore: 0.20, // Average regular teamwork match score
    rank: 0.10,            // Global skills rank
    totalSkills: 0.10,     // Combined skills total
  };

  // Compute normalized scores per factor
  const MAX_DRIVER = 350;
  const MAX_AUTO = 280;
  const MAX_SKILLS = 600;
  const MAX_SCORE = 420;

  const driverA = (statsA.driverScore ?? 0) / MAX_DRIVER;
  const driverB = (statsB.driverScore ?? 0) / MAX_DRIVER;
  const autoA = (statsA.autoScore ?? 0) / MAX_AUTO;
  const autoB = (statsB.autoScore ?? 0) / MAX_AUTO;
  const rankA = statsA.skillsRank ? Math.max(0, 1 - (statsA.skillsRank - 1) / 6636) : 0;
  const rankB = statsB.skillsRank ? Math.max(0, 1 - (statsB.skillsRank - 1) / 6636) : 0;
  const avgA = Math.min(statsA.avgAllianceScore / MAX_SCORE, 1);
  const avgB = Math.min(statsB.avgAllianceScore / MAX_SCORE, 1);
  const totalSkillsA = Math.min((statsA.skillsScore ?? 0) / MAX_SKILLS, 1);
  const totalSkillsB = Math.min((statsB.skillsScore ?? 0) / MAX_SKILLS, 1);

  // Final round scores from match records (Match #X-Y)
  const getFinalRoundAvg = async (teamNumber: string): Promise<number> => {
    const db2 = await getDb();
    if (!db2) return 0;
    const rows = await db2.select().from(teamMatches).where(eq(teamMatches.teamNumber, teamNumber));
    const scores = rows
      .filter((m) => /^Match\s*#\d+-\d+/i.test(m.matchName ?? ""))
      .map((m) => m.allianceScore ?? 0)
      .filter((s) => s > 0);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  };
  const [finalAvgA, finalAvgB] = await Promise.all([
    getFinalRoundAvg(teamNumberA),
    getFinalRoundAvg(teamNumberB),
  ]);
  // If no final round data, fall back to avg score
  const finalA = finalAvgA > 0 ? Math.min(finalAvgA / MAX_SCORE, 1) : avgA;
  const finalB = finalAvgB > 0 ? Math.min(finalAvgB / MAX_SCORE, 1) : avgB;

  // Compute raw advantage scores
  const rawA =
    driverA * W.driverSkills +
    autoA * W.autoSkills +
    finalA * W.finalRoundScore +
    avgA * W.avgTeamworkScore +
    rankA * W.rank +
    totalSkillsA * W.totalSkills;

  const rawB =
    driverB * W.driverSkills +
    autoB * W.autoSkills +
    finalB * W.finalRoundScore +
    avgB * W.avgTeamworkScore +
    rankB * W.rank +
    totalSkillsB * W.totalSkills;

  // Convert to probability using softmax-like normalization
  const total = rawA + rawB;
  const probA = total > 0 ? (rawA / total) * 100 : 50;
  const probB = total > 0 ? (rawB / total) * 100 : 50;

  const advantage = (a: number, b: number): "A" | "B" | "tie" => {
    if (Math.abs(a - b) < 0.01) return "tie";
    return a > b ? "A" : "B";
  };

  return {
    teamA: statsA,
    teamB: statsB,
    teamAWinProbability: Math.round(probA * 10) / 10,
    teamBWinProbability: Math.round(probB * 10) / 10,
    breakdown: {
      driverSkillsAdvantage: advantage(driverA, driverB),
      autoSkillsAdvantage: advantage(autoA, autoB),
      avgTeamworkScoreAdvantage: advantage(avgA, avgB),
      rankAdvantage: advantage(rankA, rankB),
      totalSkillsAdvantage: advantage(totalSkillsA, totalSkillsB),
    },
    factors: {
      driverSkillsWeight: W.driverSkills * 100,
      autoSkillsWeight: W.autoSkills * 100,
      avgTeamworkScoreWeight: W.avgTeamworkScore * 100,
      rankWeight: W.rank * 100,
      totalSkillsWeight: W.totalSkills * 100,
    },
  };
}

/** Get season progress data for a team */
export async function getSeasonProgress(
  teamNumber: string
): Promise<SeasonProgressPoint[]> {
  const db = await getDb();
  if (!db) return [];

  const eventRows = await db
    .select()
    .from(teamEvents)
    .where(eq(teamEvents.teamNumber, teamNumber))
    .orderBy(asc(teamEvents.eventDate));

  const matchRows = await db
    .select()
    .from(teamMatches)
    .where(eq(teamMatches.teamNumber, teamNumber));

  // Group matches by eventCode for accurate joining
  const matchesByEventCode: Record<string, typeof matchRows> = {};
  for (const m of matchRows) {
    const key = m.eventCode ?? m.eventName;
    if (!matchesByEventCode[key]) matchesByEventCode[key] = [];
    matchesByEventCode[key].push(m);
  }
  // Also build a map of eventCode -> eventName from match records (more accurate)
  const eventNameByCode: Record<string, string> = {};
  for (const m of matchRows) {
    if (m.eventCode && m.eventName) eventNameByCode[m.eventCode] = m.eventName;
  }

  // If we have no event records but have team skills data, create a synthetic timeline
  // based on the skills score timestamps
  if (eventRows.length === 0) {
    const teamRows = await db
      .select()
      .from(teams)
      .where(eq(teams.teamNumber, teamNumber))
      .limit(1);

    if (teamRows.length > 0) {
      const team = teamRows[0];
      const points: SeasonProgressPoint[] = [];

      if (team.driverScore || team.autoScore) {
        points.push({
          eventCode: null,
          eventName: "Best Skills Score",
          eventDate: team.driverScoreAt ?? team.autoScoreAt,
          driverScore: team.driverScore,
          autoScore: team.autoScore,
          skillsScore: team.skillsScore,
          eventRank: team.skillsRank,
          teamworkRank: null,
          avgTeamworkScore: null,
          wpApSp: null,
          avgMatchScore: null,
          bestMatchScore: null,
          matchTotal: 0,
          partnerTeams: [],
          finalistRank: null,
          finalistScore: null,
        });
      }
      return points;
    }
    return [];
  }

  return eventRows.map((ev) => {
    const key = ev.eventCode ?? ev.eventName;
    const evMatches = matchesByEventCode[key] ?? [];
    // VEX IQ teamwork: cooperative matches, track average and best scores
    const matchScores = evMatches
      .map((m) => m.allianceScore ?? 0)
      .filter((s) => s > 0);
    const avgMatchScore = matchScores.length > 0
      ? Math.round(matchScores.reduce((a, b) => a + b, 0) / matchScores.length)
      : null;
    const bestMatchScore = matchScores.length > 0 ? Math.max(...matchScores) : null;
    const partnerTeams = Array.from(new Set(
      evMatches.map((m) => m.partnerTeam).filter((t): t is string => !!t)
    ));
    // Use event name from match records if available, then from team_events, then eventCode as fallback
    const displayName = (ev.eventCode && eventNameByCode[ev.eventCode] && eventNameByCode[ev.eventCode] !== 'Unknown Event')
      ? eventNameByCode[ev.eventCode]
      : (ev.eventName && ev.eventName !== 'Unknown Event')
        ? ev.eventName
        : (ev.eventCode ?? 'Unknown Event');

    return {
      eventCode: ev.eventCode ?? null,
      eventName: displayName,
      eventDate: ev.eventDate,
      driverScore: ev.driverScore,
      autoScore: ev.autoScore,
      skillsScore: ev.skillsScore,
      eventRank: ev.eventRank,
      teamworkRank: ev.teamworkRank,
      avgTeamworkScore: ev.avgTeamworkScore,
      wpApSp: ev.wpApSp,
      avgMatchScore,
      bestMatchScore,
      matchTotal: evMatches.length,
      partnerTeams,
      finalistRank: ev.finalistRank ?? null,
      finalistScore: ev.finalistScore ?? null,
    };
  });
}

/** Get world finals contenders ranked by championship probability */
export async function getWorldFinalsContenders(
  topN: number = 50
): Promise<WorldFinalsContender[]> {
  const db = await getDb();
  if (!db) return [];

  // Get top teams by skills score
  const topTeams = await db
    .select()
    .from(teams)
    .where(sql`${teams.skillsScore} IS NOT NULL AND ${teams.skillsScore} > 0`)
    .orderBy(asc(teams.skillsRank))
    .limit(topN);

  // Get match stats for each team
  const contenders: WorldFinalsContender[] = [];

  for (const team of topTeams) {
    const matchRows = await db
      .select()
      .from(teamMatches)
      .where(eq(teamMatches.teamNumber, team.teamNumber));

    const totalMatches = matchRows.length;
    const wins = matchRows.filter((m) => m.won === true).length;
    const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

    const allianceScores = matchRows
      .map((m) => m.allianceScore ?? 0)
      .filter((s) => s > 0);
    const avgAllianceScore =
      allianceScores.length > 0
        ? allianceScores.reduce((a, b) => a + b, 0) / allianceScores.length
        : 0;

    const eventRows = await db
      .select()
      .from(teamEvents)
      .where(eq(teamEvents.teamNumber, team.teamNumber));

    const ranks = eventRows
      .map((e) => e.eventRank)
      .filter((r): r is number => r !== null);
    const bestEventRank = ranks.length > 0 ? Math.min(...ranks) : null;

    // Finalist ranks across events (lower = better)
    const finalistRanks = eventRows
      .map((e) => e.finalistRank)
      .filter((r): r is number => r !== null);
    const bestFinalistRank = finalistRanks.length > 0 ? Math.min(...finalistRanks) : null;

    // Final round scores: matches named "Match #X-Y"
    const finalRoundScores = matchRows
      .filter((m) => /^Match\s*#\d+-\d+/i.test(m.matchName ?? ""))
      .map((m) => m.allianceScore ?? 0)
      .filter((s) => s > 0);
    const avgFinalRoundScore = finalRoundScores.length > 0
      ? finalRoundScores.reduce((a, b) => a + b, 0) / finalRoundScores.length
      : 0;

    const compositeScore = computeCompositeScore({
      skillsScore: team.skillsScore,
      driverScore: team.driverScore,
      autoScore: team.autoScore,
      avgAllianceScore,
      avgFinalRoundScore,
      bestFinalistRank,
      totalMatches,
      bestEventRank,
    });

    contenders.push({
      rank: 0, // Will be set after sorting
      teamNumber: team.teamNumber,
      teamName: team.teamName,
      organization: team.organization,
      country: team.country,
      skillsRank: team.skillsRank,
      skillsScore: team.skillsScore,
      driverScore: team.driverScore,
      autoScore: team.autoScore,
      winRate: Math.round(winRate * 10) / 10,
      totalMatches,
      compositeScore,
      winProbability: 0, // Will be computed after normalization
    });
  }

  // Sort by composite score
  contenders.sort((a, b) => b.compositeScore - a.compositeScore);

  // Compute win probabilities using softmax
  const scores = contenders.map((c) => c.compositeScore);
  const totalScore = scores.reduce((a, b) => a + b, 0);

  contenders.forEach((c, i) => {
    c.rank = i + 1;
    c.winProbability =
      totalScore > 0
        ? Math.round((c.compositeScore / totalScore) * 1000 * 10) / 10
        : 0;
  });

  return contenders;
}
