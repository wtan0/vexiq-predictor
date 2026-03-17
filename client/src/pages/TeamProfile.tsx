import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Award } from "lucide-react";
import {
  Trophy, MapPin, Building2, TrendingUp, Swords, ArrowLeft,
  RefreshCw, Loader2, Target, Zap, Users, BarChart3,
  Calendar, ChevronDown, ChevronUp, History, Star,
  CheckCircle2, XCircle, MinusCircle, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ComposedChart
} from "recharts";

const CHART_GRID = "oklch(0.22 0.02 240)";
const CHART_TICK = { fill: "oklch(0.60 0.015 240)", fontSize: 11 };

/** Returns a human-readable relative time string like "2 hours ago" or "3 days ago" */
function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

// ─── EventHistoryTable sub-component ─────────────────────────────────────────
interface EventHistoryTableProps {
  progress: Array<{
    eventCode: string | null;
    eventName: string;
    eventDate: Date | null;
    driverScore: number | null;
    autoScore: number | null;
    skillsScore: number | null;
    eventRank: number | null;
    teamworkRank: number | null;
    avgMatchScore: number | null;
    bestMatchScore: number | null;
    matchTotal: number;
    partnerTeams: string[];
    wpApSp: string | null;
    avgTeamworkScore: number | null;
  }>;
  teamNumber: string;
  navigate: (path: string) => void;
  onRefresh: () => void;
}

function EventHistoryTable({ progress, teamNumber, navigate, onRefresh }: EventHistoryTableProps) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [resyncingEvent, setResyncingEvent] = useState<string | null>(null);

  const syncSingle = trpc.teams.syncSingleEvent.useMutation({
    onSuccess: (data) => {
      toast.success(`Re-synced ${data.eventCode}: ${data.matchCount} matches`, {
        description: data.skillsFound ? "Skills + match data updated." : "Match data updated.",
      });
      setResyncingEvent(null);
      onRefresh();
    },
    onError: (e) => {
      toast.error(`Re-sync failed: ${e.message}`);
      setResyncingEvent(null);
    },
  });

  // Fetch matches for expanded event
  const { data: expandedMatches, isLoading: matchesLoading } = trpc.teams.eventMatches.useQuery(
    { teamNumber, eventCode: expandedEvent ?? "" },
    { enabled: !!expandedEvent }
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4 text-amber-400" />
          Event-by-Event History
          <span className="text-xs text-muted-foreground font-normal ml-1">
            (click a row to expand matches)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium w-6"></th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Event</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Date</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Driver</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Auto</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Total</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Skills Rank</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">TW Rank</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Avg Match</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium">Best Match</th>
                <th className="text-left px-3 py-3 text-muted-foreground font-medium">Partners</th>
                <th className="text-center px-3 py-3 text-muted-foreground font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {progress.map((p, i) => {
                const total = p.skillsScore ?? ((p.driverScore ?? 0) + (p.autoScore ?? 0));
                const prevTotal = i > 0
                  ? (progress[i - 1].skillsScore ?? ((progress[i - 1].driverScore ?? 0) + (progress[i - 1].autoScore ?? 0)))
                  : null;
                const improved = prevTotal !== null && total > prevTotal;
                const declined = prevTotal !== null && total < prevTotal;
                const isExpanded = expandedEvent === p.eventCode;
                const isResyncing = resyncingEvent === p.eventCode;
                const sparkGradId = `sparkGrad-${p.eventCode ?? i}`;

                return (
                  <React.Fragment key={p.eventCode ?? `event-${i}`}>
                    <tr
                      className={`border-b border-border/50 hover:bg-secondary/20 transition-colors cursor-pointer ${
                        isExpanded ? "bg-secondary/30" : ""
                      }`}
                      onClick={() => p.eventCode && setExpandedEvent(isExpanded ? null : p.eventCode)}
                    >
                      <td className="px-2 py-3 text-center">
                        {p.eventCode ? (
                          isExpanded
                            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {improved && <TrendingUp className="h-3 w-3 text-green-400 flex-shrink-0" />}
                          {declined && <TrendingUp className="h-3 w-3 text-red-400 flex-shrink-0 rotate-180" />}
                          <span className="text-foreground font-medium truncate max-w-[180px]" title={p.eventName}>
                            {p.eventName}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center text-muted-foreground text-xs">
                        {p.eventDate ? new Date(p.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-cyan-400 font-mono font-medium">{p.driverScore ?? "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-purple-400 font-mono font-medium">{p.autoScore ?? "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`font-mono font-bold ${improved ? "text-green-400" : declined ? "text-red-400" : "text-foreground"}`}>
                          {total > 0 ? total : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {p.eventRank ? (
                          <Badge variant="outline" className={`text-xs font-mono ${p.eventRank <= 3 ? "border-amber-400/50 text-amber-400" : "border-border text-muted-foreground"}`}>
                            #{p.eventRank}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {p.teamworkRank ? (
                          <Badge variant="outline" className={`text-xs font-mono ${p.teamworkRank <= 3 ? "border-green-400/50 text-green-400" : "border-border text-muted-foreground"}`}>
                            #{p.teamworkRank}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {p.matchTotal > 0 ? (
                          <div className="flex flex-col items-center gap-0.5 text-xs">
                            <span className="text-green-400 font-medium">{p.avgMatchScore ?? '—'}</span>
                            <span className="text-muted-foreground">{p.matchTotal} matches</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {p.bestMatchScore ? (
                          <span className="text-amber-400 font-mono font-medium text-xs">{p.bestMatchScore}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {p.partnerTeams && p.partnerTeams.length > 0 ? (
                          <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                            {p.partnerTeams.slice(0, 3).map((pt) => (
                              <Badge
                                key={pt}
                                variant="outline"
                                className="text-xs border-border/60 text-muted-foreground hover:text-foreground cursor-pointer"
                                onClick={() => navigate(`/teams/${pt}`)}
                              >
                                {pt}
                              </Badge>
                            ))}
                            {p.partnerTeams.length > 3 && (
                              <Badge variant="outline" className="text-xs border-border/40 text-muted-foreground/60">
                                +{p.partnerTeams.length - 3}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {p.eventCode && (
                          <button
                            title="Re-sync this event from RobotEvents"
                            disabled={isResyncing || syncSingle.isPending}
                            onClick={() => {
                              setResyncingEvent(p.eventCode!);
                              syncSingle.mutate({ teamNumber, eventCode: p.eventCode! });
                            }}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                          >
                            {isResyncing
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* Expanded match detail rows */}
                    {isExpanded && (
                      <tr key={`expand-${i}`} className="border-b border-border/30 bg-background/40">
                        <td colSpan={12} className="px-6 py-3">
                          {matchesLoading ? (
                            <div className="flex items-center gap-2 py-2 text-muted-foreground text-xs">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading matches…
                            </div>
                          ) : expandedMatches && expandedMatches.length > 0 ? (() => {
                              // Detect final round: the highest-numbered TeamWork match
                              const matchNums = expandedMatches
                                .map(m => { const n = m.matchName?.match(/#(\d+)/); return n ? parseInt(n[1]) : 0; })
                                .filter(n => n > 0);
                              const finalMatchNum = matchNums.length > 0 ? Math.max(...matchNums) : null;
                              const isFinalMatch = (matchName: string | null) => {
                                if (!finalMatchNum || !matchName) return false;
                                const n = matchName.match(/#(\d+)/);
                                return n ? parseInt(n[1]) === finalMatchNum : false;
                              };
                              return (
                            <div className="space-y-3">
                              {/* Sparkline chart */}
                              {expandedMatches.some((m) => (m.allianceScore ?? 0) > 0) && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                    <TrendingUp className="h-3 w-3" /> Match Score Trend
                                    {finalMatchNum && <span className="ml-2 text-amber-400/80">(★ = Final Round #{finalMatchNum})</span>}
                                  </p>
                                  <ResponsiveContainer width="100%" height={72}>
                                    <AreaChart
                                      data={expandedMatches
                                        .filter((m) => (m.allianceScore ?? 0) > 0)
                                        .map((m, idx) => ({ idx: idx + 1, score: m.allianceScore ?? 0, name: m.matchName, isFinal: isFinalMatch(m.matchName) }))}
                                      margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                                    >
                                      <defs>
                                        <linearGradient id={sparkGradId} x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="oklch(0.72 0.19 142)" stopOpacity={0.35} />
                                          <stop offset="95%" stopColor="oklch(0.72 0.19 142)" stopOpacity={0} />
                                        </linearGradient>
                                      </defs>
                                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                                      <XAxis dataKey="idx" tick={CHART_TICK} tickLine={false} axisLine={false} />
                                      <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} width={32}
                                        domain={["auto", "auto"]} />
                                      <Tooltip
                                        contentStyle={{ background: "oklch(0.16 0.02 240)", border: "1px solid oklch(0.28 0.02 240)", borderRadius: 6, fontSize: 11 }}
                                        formatter={(val: number) => [`${val}`, "Score"]}
                                        labelFormatter={(label, payload) => payload?.[0]?.payload?.name ?? `Match ${label}`}
                                      />
                                      <Area
                                        type="monotone"
                                        dataKey="score"
                                        stroke="oklch(0.72 0.19 142)"
                                        strokeWidth={2}
                                        fill={`url(#${sparkGradId})`}
                                        dot={{ r: 3, fill: "oklch(0.72 0.19 142)", strokeWidth: 0 }}
                                        activeDot={{ r: 5, fill: "oklch(0.85 0.19 142)" }}
                                      />
                                    </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                              )}
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground/70">
                                    <th className="text-left py-1.5 pr-4 font-medium">Match</th>
                                    <th className="text-left py-1.5 pr-4 font-medium">Date</th>
                                    <th className="text-left py-1.5 pr-4 font-medium">Partner</th>
                                    <th className="text-center py-1.5 pr-4 font-medium">Score</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedMatches.map((m) => {
                                    const isFinal = isFinalMatch(m.matchName);
                                    return (
                                    <tr key={m.id} className={`border-t border-border/20 hover:bg-secondary/10 ${isFinal ? "bg-amber-400/5 border-amber-400/20" : ""}`}>
                                      <td className="py-1.5 pr-4 font-mono">
                                        <span className={isFinal ? "text-amber-400 font-bold" : "text-foreground/80"}>
                                          {isFinal && "★ "}{m.matchName}
                                        </span>
                                        {isFinal && <span className="ml-1 text-amber-400/60 text-[10px]">Final</span>}
                                      </td>
                                      <td className="py-1.5 pr-4 text-muted-foreground">
                                        {m.matchDate ? new Date(m.matchDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                                      </td>
                                      <td className="py-1.5 pr-4">
                                        {m.partnerTeam ? (
                                          <button
                                            className="text-primary hover:underline font-mono"
                                            onClick={() => navigate(`/teams/${m.partnerTeam}`)}
                                          >
                                            {m.partnerTeam}
                                          </button>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-4 text-center">
                                        <span className={`font-mono font-bold ${
                                          (m.allianceScore ?? 0) >= 300 ? "text-amber-400" :
                                          (m.allianceScore ?? 0) >= 200 ? "text-green-400" :
                                          (m.allianceScore ?? 0) > 0 ? "text-foreground" : "text-muted-foreground"
                                        }`}>
                                          {m.allianceScore ?? "—"}
                                        </span>
                                      </td>
                                    </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            </div>
                              );
                            })() : (
                            <p className="text-muted-foreground text-xs py-2">
                              No match records stored for this event. Click <RefreshCw className="h-3 w-3 inline" /> to fetch from RobotEvents.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TeamProfile() {
  const { teamNumber } = useParams<{ teamNumber: string }>();
  const [, navigate] = useLocation();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.teams.detail.useQuery(
    { teamNumber: teamNumber ?? "" },
    { enabled: !!teamNumber }
  );

  const { data: progress, isLoading: progressLoading, refetch: refetchProgress } = trpc.teams.seasonProgress.useQuery(
    { teamNumber: teamNumber ?? "" },
    { enabled: !!teamNumber }
  );

  const { data: awards, refetch: refetchAwards } = trpc.teams.awards.useQuery(
    { teamNumber: teamNumber ?? "" },
    { enabled: !!teamNumber }
  );

  const syncFull = trpc.teams.syncFullHistory.useMutation({
    onSuccess: (data) => {
      const awardsMsg = (data as any).awardsFound > 0 ? `, ${(data as any).awardsFound} awards` : "";
      toast.success(
        `Loaded ${data.eventsFound} events, ${data.matchRecords} matches${awardsMsg} for ${teamNumber}`,
        { description: "Season history updated. Charts refreshed." }
      );
      refetchStats();
      refetchProgress();
      refetchAwards();
    },
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });

  if (statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground text-lg">Team {teamNumber} not found.</p>
        <Button variant="outline" onClick={() => navigate("/teams")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Search
        </Button>
      </div>
    );
  }

  const hasEventData = (progress ?? []).length > 1 ||
    ((progress ?? []).length === 1 && (progress![0].driverScore ?? 0) > 0);

  const chartData = (progress ?? []).map((p, i) => ({
    name: p.eventName.length > 18 ? p.eventName.slice(0, 18) + "…" : p.eventName,
    fullName: p.eventName,
    driver: p.driverScore ?? 0,
    auto: p.autoScore ?? 0,
    total: p.skillsScore ?? ((p.driverScore ?? 0) + (p.autoScore ?? 0)),
    rank: p.eventRank,
    avgScore: p.avgMatchScore ?? 0,
    bestScore: p.bestMatchScore ?? 0,
    total_matches: p.matchTotal,
    date: p.eventDate ? new Date(p.eventDate).toLocaleDateString() : `Event ${i + 1}`,
    wpApSp: p.wpApSp,
  }));

  // Compute qualifier badges from awards
  const worldQualifier = awards?.some((a) => a.qualifiesFor?.includes("World"));
  const regionQualifier = !worldQualifier && awards?.some((a) => a.qualifiesFor?.includes("Region"));
  const worldQualEvents = awards?.filter((a) => a.qualifiesFor?.includes("World")).map((a) => a.eventName) ?? [];

  const statCards = [
    {
      label: "Global Rank",
      value: stats.skillsRank ? `#${stats.skillsRank}` : "—",
      icon: Trophy,
      color: "text-amber-400",
      bg: "bg-amber-400/10",
    },
    {
      label: "Skills Score",
      value: stats.skillsScore ?? "—",
      icon: Target,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Driver Skills",
      value: stats.driverScore ?? "—",
      icon: Zap,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      label: "Auto Skills",
      value: stats.autoScore ?? "—",
      icon: BarChart3,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
    },
    {
      label: "Avg Match Score",
      value: stats.avgAllianceScore > 0 ? Math.round(stats.avgAllianceScore) : "—",
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Total Matches",
      value: stats.totalMatches > 0 ? stats.totalMatches : "—",
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm max-w-[220px]">
        <p className="font-semibold text-foreground mb-2 text-xs leading-tight">
          {payload[0]?.payload?.fullName || label}
        </p>
        {payload[0]?.payload?.date && (
          <p className="text-xs text-muted-foreground mb-2">{payload[0].payload.date}</p>
        )}
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground capitalize text-xs">{p.name ?? p.dataKey}:</span>
            <span className="font-medium text-foreground text-xs ml-auto">{p.value}</span>
          </div>
        ))}
        {payload[0]?.payload?.rank && (
          <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
            Event Rank: #{payload[0].payload.rank}
          </div>
        )}
      </div>
    );
  };

  // Compute consistency score: std deviation of total scores
  const scores = chartData.map((d) => d.total).filter((s) => s > 0);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const variance = scores.length > 1
    ? scores.reduce((acc, s) => acc + Math.pow(s - avgScore, 2), 0) / scores.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const consistencyPct = avgScore > 0 ? Math.max(0, Math.round(100 - (stdDev / avgScore) * 100)) : 0;

  // Trend: is the team improving?
  const trend = scores.length >= 2
    ? scores[scores.length - 1] > scores[0] ? "improving" : scores[scores.length - 1] < scores[0] ? "declining" : "stable"
    : "unknown";

  return (
    <div className="min-h-screen py-10">
      <div className="container max-w-5xl mx-auto">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/teams")}
          className="mb-6 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Search
        </Button>

        {/* Team Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-3xl font-bold">{stats.teamNumber}</h1>
              {stats.teamName && (
                <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-base px-3 py-1">
                  {stats.teamName}
                </Badge>
              )}
              {worldQualifier && (
                <Badge
                  className="bg-amber-500/20 text-amber-300 border border-amber-500/50 px-3 py-1 text-sm font-semibold animate-pulse"
                  title={`World Championship qualifier via: ${worldQualEvents.join(", ")}`}
                >
                  <Star className="h-3.5 w-3.5 mr-1.5 fill-amber-400 text-amber-400" />
                  World Qualifier
                </Badge>
              )}
              {regionQualifier && (
                <Badge
                  className="bg-blue-500/20 text-blue-300 border border-blue-500/50 px-3 py-1 text-sm font-semibold"
                  title="Region Championship qualifier"
                >
                  <Star className="h-3.5 w-3.5 mr-1.5 fill-blue-400 text-blue-400" />
                  Region Qualifier
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {stats.organization && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {stats.organization}
                </span>
              )}
              {stats.country && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {stats.eventRegion ? `${stats.eventRegion}, ` : ""}{stats.country}
                </span>
              )}
              {stats.lastSyncedAt ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground/70" title={new Date(stats.lastSyncedAt).toLocaleString()}>
                  <RefreshCw className="h-3 w-3" />
                  Synced {formatTimeAgo(new Date(stats.lastSyncedAt))}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-amber-400/70">
                  <AlertCircle className="h-3 w-3" />
                  Never synced — click Load History
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncFull.mutate({ teamNumber: teamNumber! })}
              disabled={syncFull.isPending}
              className="border-border hover:bg-secondary"
              title="Fetch full event history from RobotEvents (uses browser scraper)"
            >
              {syncFull.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Fetching History…</>
              ) : (
                <><History className="h-4 w-4 mr-2" /> Load History</>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => navigate(`/compare?teamA=${teamNumber}`)}
              className="bg-primary hover:bg-primary/90"
            >
              <Swords className="h-4 w-4 mr-2" />
              Compare
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold text-foreground">{value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sync prompt if no event data */}
        {syncFull.isPending && (
          <Card className="bg-card border-border mb-6">
            <CardContent className="py-8 text-center">
              <Loader2 className="h-10 w-10 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-foreground font-medium mb-1">Fetching season history from RobotEvents…</p>
              <p className="text-sm text-muted-foreground">
                This may take 30–90 seconds as we scrape each event page. Please wait.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Season Progress Charts */}
        {progressLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasEventData ? (
          <div className="space-y-6">
            {/* Consistency & Trend Banner */}
            {scores.length >= 2 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Events Tracked</p>
                    <p className="text-2xl font-bold text-foreground">{chartData.length}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Avg Skills Score</p>
                    <p className="text-2xl font-bold text-cyan-400">{Math.round(avgScore)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Consistency</p>
                    <p className={`text-2xl font-bold ${consistencyPct >= 80 ? "text-green-400" : consistencyPct >= 60 ? "text-amber-400" : "text-red-400"}`}>
                      {consistencyPct}%
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Season Trend</p>
                    <p className={`text-lg font-bold capitalize ${trend === "improving" ? "text-green-400" : trend === "declining" ? "text-red-400" : "text-amber-400"}`}>
                      {trend === "improving" ? "📈 Improving" : trend === "declining" ? "📉 Declining" : "➡️ Stable"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Skills Score Over Time - Area Chart */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Skills Score Progression — Full Season
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 70 }}>
                    <defs>
                      <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.60 0.22 25)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.60 0.22 25)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradDriver" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.18 200)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="oklch(0.65 0.18 200)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradAuto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.65 0.18 280)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="oklch(0.65 0.18 280)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis
                      dataKey="name"
                      tick={CHART_TICK}
                      angle={-40}
                      textAnchor="end"
                      height={80}
                      interval={0}
                    />
                    <YAxis tick={CHART_TICK} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ color: "oklch(0.60 0.015 240)", fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Total Skills"
                      stroke="oklch(0.60 0.22 25)"
                      strokeWidth={2.5}
                      fill="url(#gradTotal)"
                      dot={{ fill: "oklch(0.60 0.22 25)", r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="driver"
                      name="Driver Skills"
                      stroke="oklch(0.65 0.18 200)"
                      strokeWidth={2}
                      fill="url(#gradDriver)"
                      dot={{ fill: "oklch(0.65 0.18 200)", r: 3 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="auto"
                      name="Auto Skills"
                      stroke="oklch(0.65 0.18 280)"
                      strokeWidth={2}
                      fill="url(#gradAuto)"
                      dot={{ fill: "oklch(0.65 0.18 280)", r: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Driver vs Auto Breakdown */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  Driver vs Autonomous Skills — Per Event
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                    <XAxis
                      dataKey="name"
                      tick={CHART_TICK}
                      angle={-40}
                      textAnchor="end"
                      height={80}
                      interval={0}
                    />
                    <YAxis tick={CHART_TICK} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ color: "oklch(0.60 0.015 240)", fontSize: 12 }} />
                    <Bar dataKey="driver" name="Driver Skills" fill="oklch(0.65 0.18 200)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="auto" name="Auto Skills" fill="oklch(0.65 0.18 280)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Teamwork Match Scores by Event */}
            {chartData.some((d) => d.total_matches > 0) && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-green-400" />
                    Teamwork Match Scores — Per Event
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 70 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis
                        dataKey="name"
                        tick={CHART_TICK}
                        angle={-40}
                        textAnchor="end"
                        height={80}
                        interval={0}
                      />
                      <YAxis tick={CHART_TICK} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ color: "oklch(0.60 0.015 240)", fontSize: 12 }} />
                      <Bar dataKey="bestScore" name="Best Match Score" fill="oklch(0.70 0.18 140)" radius={[3, 3, 0, 0]} opacity={0.6} />
                      <Line
                        type="monotone"
                        dataKey="avgScore"
                        name="Avg Match Score"
                        stroke="oklch(0.65 0.22 140)"
                        strokeWidth={2.5}
                        dot={{ fill: "oklch(0.65 0.22 140)", r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Event-by-Event History Table */}
            <EventHistoryTable
              progress={progress ?? []}
              teamNumber={teamNumber!}
              navigate={navigate}
              onRefresh={() => { refetchStats(); refetchProgress(); }}
            />
          </div>
        ) : !syncFull.isPending ? (
          <Card className="bg-card border-border">
            <CardContent className="py-16 text-center">
              <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-foreground font-medium mb-2">No season history loaded yet</p>
              <p className="text-sm text-muted-foreground mb-2 max-w-md mx-auto">
                Click <strong>Load History</strong> to fetch this team's complete 2025-2026 season data from RobotEvents —
                including per-event skills scores, teamwork match results, and rankings.
              </p>
              <p className="text-xs text-muted-foreground mb-6 max-w-md mx-auto">
                This uses a browser-based scraper to bypass Cloudflare. It may take 30–90 seconds depending on how many events the team attended.
              </p>
              <Button
                onClick={() => syncFull.mutate({ teamNumber: teamNumber! })}
                disabled={syncFull.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                <History className="h-4 w-4 mr-2" />
                Load Season History
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* ── Awards Section ─────────────────────────────────────────────── */}
        {awards && awards.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-400" />
                Awards & Honors
                <Badge variant="secondary" className="ml-auto text-xs">{awards.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {/* Group awards by event */}
                {Object.entries(
                  awards.reduce((acc, a) => {
                    const key = a.eventCode;
                    if (!acc[key]) acc[key] = { eventName: a.eventName, awards: [] };
                    acc[key].awards.push(a);
                    return acc;
                  }, {} as Record<string, { eventName: string; awards: typeof awards }>)
                ).map(([eventCode, group]) => (
                  <div key={eventCode} className="rounded-lg border border-border/50 bg-background/30 p-3">
                    <p className="text-xs text-muted-foreground font-medium mb-2 truncate">{group.eventName}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.awards.map((a, i) => {
                        const isWorld = a.qualifiesFor?.includes("World");
                        const isRegion = a.qualifiesFor?.includes("Region");
                        return (
                          <div key={i} className="flex items-center gap-1.5">
                            <Badge
                              className={`text-xs font-medium ${
                                isWorld
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40 border"
                                  : isRegion
                                  ? "bg-blue-500/20 text-blue-300 border-blue-500/40 border"
                                  : "bg-muted text-muted-foreground border-border border"
                              }`}
                            >
                              <Trophy className="h-3 w-3 mr-1" />
                              {a.awardName.replace(" (VIQRC)", "").replace(" Award", "")}
                            </Badge>
                            {a.qualifiesFor && (
                              <span className="text-xs text-muted-foreground/60">→ {a.qualifiesFor}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
