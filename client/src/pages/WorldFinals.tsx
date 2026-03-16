import { useState } from "react";
import { useLocation } from "wouter";
import {
  Globe, Trophy, Medal, ChevronRight, Loader2, MapPin,
  Building2, Zap, Target, TrendingUp, Filter, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

const MEDAL_COLORS = [
  "text-amber-400",
  "text-slate-300",
  "text-amber-600",
];

const MEDAL_BG = [
  "bg-amber-400/10 border-amber-400/30",
  "bg-slate-300/10 border-slate-300/30",
  "bg-amber-600/10 border-amber-600/30",
];

function getRankColor(rank: number): string {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-slate-300";
  if (rank === 3) return "text-amber-600";
  if (rank <= 10) return "text-primary";
  return "text-muted-foreground";
}

function ProbabilityBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, oklch(0.60 0.22 25), oklch(0.65 0.18 200))",
          }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-12 text-right">
        {value.toFixed(2)}%
      </span>
    </div>
  );
}

export default function WorldFinals() {
  const [, navigate] = useLocation();
  const [topN, setTopN] = useState(50);
  const [filterCountry, setFilterCountry] = useState("");
  const [filterRegion, setFilterRegion] = useState("");

  const { data: contenders, isLoading, refetch } = trpc.worldFinals.contenders.useQuery(
    { topN },
    { staleTime: 5 * 60 * 1000 }
  );

  const filtered = (contenders ?? []).filter((c) => {
    const countryMatch = !filterCountry || (c.country ?? "").toLowerCase().includes(filterCountry.toLowerCase());
    return countryMatch;
  });

  const maxProb = filtered.length > 0 ? filtered[0].winProbability : 1;

  const top10ChartData = (contenders ?? []).slice(0, 10).map((c) => ({
    name: c.teamNumber,
    teamName: c.teamName,
    skills: c.skillsScore ?? 0,
    driver: c.driverScore ?? 0,
    auto: c.autoScore ?? 0,
    prob: c.winProbability,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm">
        <p className="font-semibold mb-1">{label} {item?.teamName ? `· ${item.teamName}` : ""}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground capitalize">{p.name}:</span>
            <span className="font-medium">{p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen py-10">
      <div className="container max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-amber-400/10 border border-amber-400/30">
              <Globe className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">World Finals Predictor</h1>
              <p className="text-muted-foreground text-sm">April 2026 VEX IQ World Championship</p>
            </div>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Championship odds are calculated using a composite score based on skills rankings, driver
            performance, autonomous skills, match win rates, and average alliance scores from the
            2025-2026 season.
          </p>
        </div>

        {/* Top 3 Podium */}
        {!isLoading && contenders && contenders.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[1, 0, 2].map((i) => {
              const c = contenders[i];
              const pos = i + 1;
              const actualPos = i === 0 ? 2 : i === 1 ? 1 : 3;
              return (
                <Card
                  key={c.teamNumber}
                  className={`border cursor-pointer hover:scale-[1.02] transition-transform ${MEDAL_BG[i]}`}
                  onClick={() => navigate(`/team/${c.teamNumber}`)}
                >
                  <CardContent className="p-5 text-center">
                    <div className={`text-4xl font-black mb-2 ${MEDAL_COLORS[i]}`}>
                      #{actualPos}
                    </div>
                    <div className="text-xl font-bold mb-1">{c.teamNumber}</div>
                    {c.teamName && (
                      <div className="text-sm text-muted-foreground mb-2 truncate">{c.teamName}</div>
                    )}
                    {c.country && (
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1 mb-3">
                        <MapPin className="h-3 w-3" />
                        {c.country}
                      </div>
                    )}
                    <div className={`text-2xl font-bold ${MEDAL_COLORS[i]}`}>
                      {c.winProbability.toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground">win probability</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-background/50 rounded p-1.5">
                        <div className="text-muted-foreground">Skills</div>
                        <div className="font-bold">{c.skillsScore ?? "—"}</div>
                      </div>
                      <div className="bg-background/50 rounded p-1.5">
                        <div className="text-muted-foreground">Rank</div>
                        <div className="font-bold">#{c.skillsRank ?? "—"}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Top 10 Chart */}
        {!isLoading && top10ChartData.length > 0 && (
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3Icon />
                Top 10 Teams — Skills Score Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={top10ChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                  <XAxis dataKey="name" tick={{ fill: "oklch(0.60 0.015 240)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "oklch(0.60 0.015 240)", fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="driver" name="Driver Skills" stackId="a" fill="oklch(0.65 0.18 200)" />
                  <Bar dataKey="auto" name="Auto Skills" stackId="a" fill="oklch(0.65 0.18 280)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Filters & Table */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold">Full Rankings</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter by country..."
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="pl-8 h-8 text-sm w-40 bg-card border-border"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Show top:
              {[25, 50, 100, 200].map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={topN === n ? "default" : "outline"}
                  className={`h-7 px-2 text-xs ${topN !== n ? "border-border hover:bg-secondary" : ""}`}
                  onClick={() => setTopN(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="h-8 border-border hover:bg-secondary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No data available. Please sync skills data first.</p>
          </div>
        ) : (
          <Card className="bg-card border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium w-12">Rank</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Team</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium hidden md:table-cell">Location</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium">Skills</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">Driver</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden sm:table-cell">Auto</th>
                    <th className="text-right px-4 py-3 text-muted-foreground font-medium hidden lg:table-cell">Win Rate</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium min-w-[160px]">Win Probability</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, idx) => (
                    <tr
                      key={c.teamNumber}
                      className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/team/${c.teamNumber}`)}
                    >
                      <td className="px-4 py-3">
                        <span className={`font-bold ${getRankColor(c.rank)}`}>
                          {c.rank <= 3 ? (
                            <span className="text-lg">{c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : "🥉"}</span>
                          ) : (
                            `#${c.rank}`
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{c.teamNumber}</div>
                        {c.teamName && (
                          <div className="text-xs text-muted-foreground truncate max-w-[140px]">{c.teamName}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="text-xs text-muted-foreground">
                          {c.country ?? "—"}
                        </div>
                        {c.organization && (
                          <div className="text-xs text-muted-foreground/70 truncate max-w-[160px]">{c.organization}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {c.skillsScore ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-cyan-400 hidden sm:table-cell">
                        {c.driverScore ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-purple-400 hidden sm:table-cell">
                        {c.autoScore ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        {c.totalMatches > 0 ? (
                          <span className={c.winRate >= 50 ? "text-green-400" : "text-muted-foreground"}>
                            {c.winRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ProbabilityBar value={c.winProbability} max={maxProb} />
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Methodology Note */}
        <div className="mt-8 p-4 rounded-xl border border-border bg-card/50 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Prediction Methodology</p>
          <p>
            Win probabilities are computed using a weighted composite score: Skills Score (35%),
            Driver Skills (15%), Autonomous Skills (15%), Match Win Rate (20%), Average Alliance Score (10%),
            and Best Event Rank (5%). Scores are normalized and converted to relative probabilities
            among the top {topN} teams. This is a statistical model based on available 2025-2026 season data
            and does not account for robot improvements, alliance selection, or tournament-day performance.
          </p>
        </div>
      </div>
    </div>
  );
}

function BarChart3Icon() {
  return <TrendingUp className="h-4 w-4 text-amber-400" />;
}
