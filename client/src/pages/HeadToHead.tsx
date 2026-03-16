import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import {
  Swords, Search, Loader2, Trophy, Zap, Target, TrendingUp,
  BarChart3, Users, ArrowRight, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Legend, Tooltip
} from "recharts";

interface TeamSearchBoxProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  color: string;
}

function TeamSearchBox({ label, value, onChange, color }: TeamSearchBoxProps) {
  const [query, setQuery] = useState(value);
  const [debouncedQuery, setDebouncedQuery] = useState(value);
  const [, navigate] = useLocation();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results } = trpc.teams.search.useQuery(
    { query: debouncedQuery, limit: 8 },
    { enabled: debouncedQuery.trim().length >= 1 && debouncedQuery !== value }
  );

  return (
    <div className="relative">
      <label className={`text-xs font-semibold uppercase tracking-wider mb-2 block ${color}`}>
        {label}
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Team number or name..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value !== value) onChange("");
          }}
          className="pl-9 bg-card border-border"
        />
      </div>
      {results && results.length > 0 && query !== value && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          {results.map((team) => (
            <button
              key={team.teamNumber}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary text-left transition-colors"
              onClick={() => {
                onChange(team.teamNumber);
                setQuery(team.teamNumber);
                setDebouncedQuery(team.teamNumber);
              }}
            >
              <div>
                <span className="font-semibold text-sm">{team.teamNumber}</span>
                {team.teamName && (
                  <span className="text-muted-foreground text-sm ml-2">· {team.teamName}</span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">Rank #{team.skillsRank ?? "—"}</span>
            </button>
          ))}
        </div>
      )}
      {value && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          <span className="text-green-400">✓</span> Selected: <strong>{value}</strong>
        </p>
      )}
    </div>
  );
}

function OddsBar({ probA, probB, nameA, nameB }: { probA: number; probB: number; nameA: string; nameB: string }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-red-400">{nameA}</span>
        <span className="text-blue-400">{nameB}</span>
      </div>
      <div className="flex h-8 rounded-full overflow-hidden border border-border">
        <div
          className="flex items-center justify-center text-xs font-bold text-white transition-all duration-700"
          style={{
            width: `${probA}%`,
            background: "linear-gradient(90deg, oklch(0.55 0.22 25), oklch(0.65 0.22 25))",
          }}
        >
          {probA >= 20 ? `${probA.toFixed(1)}%` : ""}
        </div>
        <div
          className="flex items-center justify-center text-xs font-bold text-white transition-all duration-700"
          style={{
            width: `${probB}%`,
            background: "linear-gradient(90deg, oklch(0.45 0.18 240), oklch(0.55 0.18 240))",
          }}
        >
          {probB >= 20 ? `${probB.toFixed(1)}%` : ""}
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{probA.toFixed(1)}% win probability</span>
        <span>{probB.toFixed(1)}% win probability</span>
      </div>
    </div>
  );
}

export default function HeadToHead() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const [teamA, setTeamA] = useState(params.get("teamA") ?? "");
  const [teamB, setTeamB] = useState(params.get("teamB") ?? "");
  const [, navigate] = useLocation();

  const canCompare = teamA.trim().length >= 2 && teamB.trim().length >= 2;

  const { data: result, isLoading } = trpc.comparison.headToHead.useQuery(
    { teamA: teamA.trim(), teamB: teamB.trim() },
    { enabled: canCompare }
  );

  const advantageLabel = (adv: "A" | "B" | "tie") => {
    if (adv === "A") return { text: result?.teamA.teamNumber ?? "A", cls: "text-red-400" };
    if (adv === "B") return { text: result?.teamB.teamNumber ?? "B", cls: "text-blue-400" };
    return { text: "Tie", cls: "text-muted-foreground" };
  };

  const radarData = result
    ? [
        {
          subject: "Driver Skills",
          A: result.teamA.driverScore ?? 0,
          B: result.teamB.driverScore ?? 0,
          fullMark: 350,
        },
        {
          subject: "Auto Skills",
          A: result.teamA.autoScore ?? 0,
          B: result.teamB.autoScore ?? 0,
          fullMark: 280,
        },
        {
          subject: "Avg TW Score",
          A: result.teamA.avgAllianceScore,
          B: result.teamB.avgAllianceScore,
          fullMark: 350,
        },
        {
          subject: "Total Skills",
          A: result.teamA.skillsScore ?? 0,
          B: result.teamB.skillsScore ?? 0,
          fullMark: 600,
        },
        {
          subject: "Composite",
          A: result.teamA.compositeScore / 10,
          B: result.teamB.compositeScore / 10,
          fullMark: 100,
        },
      ]
    : [];

  const breakdownItems = result
    ? [
        {
          label: "Driver Skills",
          icon: Zap,
          adv: result.breakdown.driverSkillsAdvantage,
          valA: result.teamA.driverScore ?? "—",
          valB: result.teamB.driverScore ?? "—",
          weight: result.factors.driverSkillsWeight,
        },
        {
          label: "Auto Skills",
          icon: Target,
          adv: result.breakdown.autoSkillsAdvantage,
          valA: result.teamA.autoScore ?? "—",
          valB: result.teamB.autoScore ?? "—",
          weight: result.factors.autoSkillsWeight,
        },
        {
          label: "Avg Teamwork Score",
          icon: TrendingUp,
          adv: result.breakdown.avgTeamworkScoreAdvantage,
          valA: result.teamA.avgAllianceScore > 0 ? result.teamA.avgAllianceScore.toFixed(1) : "—",
          valB: result.teamB.avgAllianceScore > 0 ? result.teamB.avgAllianceScore.toFixed(1) : "—",
          weight: result.factors.avgTeamworkScoreWeight,
        },
        {
          label: "Skills Rank",
          icon: Trophy,
          adv: result.breakdown.rankAdvantage,
          valA: result.teamA.skillsRank ? `#${result.teamA.skillsRank}` : "—",
          valB: result.teamB.skillsRank ? `#${result.teamB.skillsRank}` : "—",
          weight: result.factors.rankWeight,
        },
        {
          label: "Total Skills",
          icon: BarChart3,
          adv: result.breakdown.totalSkillsAdvantage,
          valA: result.teamA.skillsScore ?? "—",
          valB: result.teamB.skillsScore ?? "—",
          weight: result.factors.totalSkillsWeight,
        },
      ]
    : [];

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm">
        <p className="font-semibold mb-1">{payload[0]?.payload?.subject}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.dataKey === "A" ? teamA : teamB}:</span>
            <span className="font-medium">{Number(p.value).toFixed(1)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen py-10">
      <div className="container max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Swords className="h-8 w-8 text-primary" />
            Head-to-Head Comparison
          </h1>
          <p className="text-muted-foreground">
            Compare two VEX IQ Elementary teams and calculate winning probability based on 2025-2026 season data.
          </p>
        </div>

        {/* Team Selection */}
        <Card className="bg-card border-border mb-8">
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <TeamSearchBox
                label="Team A"
                value={teamA}
                onChange={setTeamA}
                color="text-red-400"
              />
              <div className="hidden md:flex items-end justify-center pb-2">
                <div className="text-2xl font-bold text-muted-foreground">VS</div>
              </div>
              <TeamSearchBox
                label="Team B"
                value={teamB}
                onChange={setTeamB}
                color="text-blue-400"
              />
            </div>
          </CardContent>
        </Card>

        {/* Loading */}
        {isLoading && canCompare && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* No result */}
        {!isLoading && canCompare && !result && (
          <div className="text-center py-16 text-muted-foreground">
            <p>One or both teams not found in the database.</p>
            <p className="text-sm mt-2">Make sure data is synced from RobotEvents.</p>
          </div>
        )}

        {/* Prompt */}
        {!canCompare && (
          <div className="text-center py-16 text-muted-foreground">
            <Swords className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg">Select two teams to compare</p>
            <p className="text-sm mt-2">Search and select Team A and Team B above to see the head-to-head analysis.</p>
          </div>
        )}

        {/* Results */}
        {result && !isLoading && (
          <div className="space-y-6">
            {/* Win Probability */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  Winning Probability
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <OddsBar
                  probA={result.teamAWinProbability}
                  probB={result.teamBWinProbability}
                  nameA={result.teamA.teamNumber}
                  nameB={result.teamB.teamNumber}
                />

                {/* Winner callout */}
                <div className={`rounded-xl p-4 border ${
                  result.teamAWinProbability > result.teamBWinProbability
                    ? "bg-red-400/10 border-red-400/30"
                    : result.teamBWinProbability > result.teamAWinProbability
                    ? "bg-blue-400/10 border-blue-400/30"
                    : "bg-muted border-border"
                }`}>
                  <div className="flex items-center gap-3">
                    <Trophy className="h-5 w-5 text-amber-400 flex-shrink-0" />
                    <div>
                      {result.teamAWinProbability === result.teamBWinProbability ? (
                        <p className="font-semibold">Even match — too close to call</p>
                      ) : (
                        <>
                          <p className="font-semibold">
                            <span className={result.teamAWinProbability > result.teamBWinProbability ? "text-red-400" : "text-blue-400"}>
                              {result.teamAWinProbability > result.teamBWinProbability
                                ? result.teamA.teamNumber
                                : result.teamB.teamNumber}
                            </span>{" "}
                            is predicted to win
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {Math.max(result.teamAWinProbability, result.teamBWinProbability).toFixed(1)}% win probability based on season performance
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Radar Chart + Breakdown */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Radar */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Performance Radar</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="oklch(0.22 0.02 240)" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: "oklch(0.60 0.015 240)", fontSize: 11 }}
                      />
                      <Radar
                        name={result.teamA.teamNumber}
                        dataKey="A"
                        stroke="oklch(0.60 0.22 25)"
                        fill="oklch(0.60 0.22 25)"
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                      <Radar
                        name={result.teamB.teamNumber}
                        dataKey="B"
                        stroke="oklch(0.55 0.18 240)"
                        fill="oklch(0.55 0.18 240)"
                        fillOpacity={0.25}
                        strokeWidth={2}
                      />
                      <Legend wrapperStyle={{ color: "oklch(0.60 0.015 240)", fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Factor Breakdown */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Factor Analysis</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {breakdownItems.map(({ label, icon: Icon, adv, valA, valB, weight }) => {
                    const { text, cls } = advantageLabel(adv);
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-muted-foreground">{label}</span>
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                adv === "A"
                                  ? "border-red-400/40 text-red-400 bg-red-400/10"
                                  : adv === "B"
                                  ? "border-blue-400/40 text-blue-400 bg-blue-400/10"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {text} leads
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-red-400 font-medium">{valA}</span>
                            <span className="text-muted-foreground">({weight}% weight)</span>
                            <span className="text-blue-400 font-medium">{valB}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* Team Cards */}
            <div className="grid md:grid-cols-2 gap-6">
              {[
                { team: result.teamA, color: "border-red-400/30 bg-red-400/5", label: "Team A", labelColor: "text-red-400" },
                { team: result.teamB, color: "border-blue-400/30 bg-blue-400/5", label: "Team B", labelColor: "text-blue-400" },
              ].map(({ team, color, label, labelColor }) => (
                <Card key={team.teamNumber} className={`border ${color}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${labelColor}`}>{label}</p>
                        <h3 className="text-xl font-bold">{team.teamNumber}</h3>
                        {team.teamName && <p className="text-muted-foreground text-sm">{team.teamName}</p>}
                        {team.organization && <p className="text-muted-foreground text-xs">{team.organization}</p>}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/team/${team.teamNumber}`)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {[
                        { label: "Skills", value: team.skillsScore ?? "—" },
                        { label: "Driver", value: team.driverScore ?? "—" },
                        { label: "Auto", value: team.autoScore ?? "—" },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-background/50 rounded-lg p-2">
                          <div className="text-xs text-muted-foreground">{label}</div>
                          <div className="font-bold text-foreground">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Rank: <span className="text-foreground font-medium">#{team.skillsRank ?? "—"}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Avg TW Score: <span className="text-foreground font-medium">
                          {team.avgAllianceScore > 0 ? Math.round(team.avgAllianceScore) : "—"}
                        </span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
