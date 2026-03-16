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

  const compositeScore = computeCompositeScore({
    skillsScore: team.skillsScore,
    driverScore: team.driverScore,
    autoScore: team.autoScore,
    avgAllianceScore,
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
  };
}

/** Compute a composite performance score (0-1000) for VEX IQ */
function computeCompositeScore(params: {
  skillsScore: number | null;
  driverScore: number | null;
  autoScore: number | null;
  avgAllianceScore: number; // Average teamwork match score (cooperative)
  totalMatches: number;
  bestEventRank: number | null;
}): number {
  const { skillsScore, driverScore, autoScore, avgAllianceScore, totalMatches, bestEventRank } = params;

  // VEX IQ Weights: Skills score is the primary predictor.
  // Teamwork (avg match score) is secondary since VEX IQ is cooperative.
  // No win/loss rate - replaced by avg teamwork score.
  const W_SKILLS = 0.35;     // Total skills score (driver + auto combined)
  const W_DRIVER = 0.15;     // Driver skills component
  const W_AUTO = 0.15;       // Autonomous skills component
  const W_AVG_SCORE = 0.25;  // Average teamwork match score (cooperative)
  const W_RANK = 0.10;       // Best event rank

  // Normalize each component to 0-1 range based on known max values for 2025-2026 season
  const MAX_SKILLS = 600;
  const MAX_DRIVER = 350;
  const MAX_AUTO = 280;
  const MAX_AVG_SCORE = 350; // Max avg teamwork match score

  const skillsNorm = Math.min((skillsScore ?? 0) / MAX_SKILLS, 1);
  const driverNorm = Math.min((driverScore ?? 0) / MAX_DRIVER, 1);
  const autoNorm = Math.min((autoScore ?? 0) / MAX_AUTO, 1);
  const avgScoreNorm = Math.min(avgAllianceScore / MAX_AVG_SCORE, 1);
  // Rank: lower is better. Assume top 50 teams are world-class.
  const rankNorm = bestEventRank ? Math.max(0, 1 - (bestEventRank - 1) / 50) : 0;

  // Participation bonus: more matches = more reliable data (max 5%)
  const participationBonus = totalMatches > 0 ? Math.min(totalMatches / 30, 1) * 0.05 : 0;

  const score =
    (skillsNorm * W_SKILLS +
      driverNorm * W_DRIVER +
      autoNorm * W_AUTO +
      avgScoreNorm * W_AVG_SCORE +
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
  const W = {
    driverSkills: 0.25,   // Driver skills score
    autoSkills: 0.20,     // Autonomous skills score
    avgTeamworkScore: 0.30, // Average teamwork match score (most important for cooperation)
    rank: 0.15,           // Global skills rank
    totalSkills: 0.10,    // Combined skills total
  };

  // Compute normalized scores per factor
  const MAX_DRIVER = 350;
  const MAX_AUTO = 280;
  const MAX_SKILLS = 600;

  const driverA = (statsA.driverScore ?? 0) / MAX_DRIVER;
  const driverB = (statsB.driverScore ?? 0) / MAX_DRIVER;
  const autoA = (statsA.autoScore ?? 0) / MAX_AUTO;
  const autoB = (statsB.autoScore ?? 0) / MAX_AUTO;
  const rankA = statsA.skillsRank ? Math.max(0, 1 - (statsA.skillsRank - 1) / 6636) : 0;
  const rankB = statsB.skillsRank ? Math.max(0, 1 - (statsB.skillsRank - 1) / 6636) : 0;
  const MAX_AVG = 350;
  const avgA = Math.min(statsA.avgAllianceScore / MAX_AVG, 1);
  const avgB = Math.min(statsB.avgAllianceScore / MAX_AVG, 1);
  const totalSkillsA = Math.min((statsA.skillsScore ?? 0) / MAX_SKILLS, 1);
  const totalSkillsB = Math.min((statsB.skillsScore ?? 0) / MAX_SKILLS, 1);

  // Compute raw advantage scores
  const rawA =
    driverA * W.driverSkills +
    autoA * W.autoSkills +
    avgA * W.avgTeamworkScore +
    rankA * W.rank +
    totalSkillsA * W.totalSkills;

  const rawB =
    driverB * W.driverSkills +
    autoB * W.autoSkills +
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

    const compositeScore = computeCompositeScore({
      skillsScore: team.skillsScore,
      driverScore: team.driverScore,
      autoScore: team.autoScore,
      avgAllianceScore,
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
