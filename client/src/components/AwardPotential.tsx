import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, ChevronDown, ChevronUp, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { useState } from "react";

interface AwardPotentialProps {
  teamNumber: string;
}

function LikelihoodBar({ value }: { value: number }) {
  const color =
    value >= 70 ? "bg-amber-400" :
    value >= 45 ? "bg-blue-400" :
    value >= 25 ? "bg-slate-400" :
    "bg-slate-600";

  const label =
    value >= 70 ? "High" :
    value >= 45 ? "Moderate" :
    value >= 25 ? "Low" :
    "Unlikely";

  const labelColor =
    value >= 70 ? "text-amber-400" :
    value >= 45 ? "text-blue-400" :
    value >= 25 ? "text-slate-400" :
    "text-slate-500";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`text-xs font-semibold w-16 text-right ${labelColor}`}>
        {label} {value}%
      </span>
    </div>
  );
}

export function AwardPotential({ teamNumber }: AwardPotentialProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data, isLoading, error } = trpc.awards.analyzeAwardPotential.useQuery(
    { teamNumber },
    { staleTime: 5 * 60 * 1000 }
  );

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Analyzing award potential…</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">Award analysis unavailable — sync team history first.</span>
        </CardContent>
      </Card>
    );
  }

  const topCategory = data.categories[0];

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          Award Potential at World Championship
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* LLM Narrative */}
        {data.narrative && (
          <div className="flex gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Sparkles className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-100/90 leading-relaxed">{data.narrative}</p>
          </div>
        )}

        {/* Top Award Highlight */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <span className="text-2xl">{topCategory.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground">{topCategory.name}</span>
              <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">
                Best Chance
              </Badge>
            </div>
            <LikelihoodBar value={topCategory.likelihood} />
          </div>
        </div>

        {/* All Categories */}
        <div className="space-y-2">
          {data.categories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-lg border border-border/50 overflow-hidden"
            >
              <button
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
                onClick={() => setExpanded(expanded === cat.id ? null : cat.id)}
              >
                <span className="text-lg w-7 shrink-0">{cat.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-foreground">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      {cat.evidence.length > 0 && (
                        <span className="text-xs text-muted-foreground">{cat.evidence.length} signal{cat.evidence.length !== 1 ? "s" : ""}</span>
                      )}
                      {expanded === cat.id
                        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                    </div>
                  </div>
                  <LikelihoodBar value={cat.likelihood} />
                </div>
              </button>

              {expanded === cat.id && (
                <div className="px-4 pb-4 pt-1 bg-slate-900/30 border-t border-border/30 space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">{cat.description}</p>
                  {cat.evidence.length > 0 ? (
                    <ul className="space-y-1.5">
                      {cat.evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                          <span className="text-green-400 mt-0.5 shrink-0">✓</span>
                          {e}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No supporting signals found in season data.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Award History Toggle */}
        {data.awardHistory.length > 0 && (
          <div>
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showHistory ? "Hide" : "Show"} season award history ({data.awardHistory.length} awards)
            </button>
            {showHistory && (
              <div className="mt-3 space-y-1.5">
                {data.awardHistory.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-amber-400 shrink-0 mt-0.5">🏅</span>
                    <div>
                      <span className="text-foreground font-medium">{a.awardName.replace(/\s*\(VIQRC\)\s*/i, "").trim()}</span>
                      <span className="text-muted-foreground"> — {a.eventName}</span>
                      {a.qualifiesFor && (
                        <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0 border-green-500/40 text-green-400">
                          {a.qualifiesFor}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Stats Footer */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/30">
          <div className="text-center">
            <div className="text-sm font-bold text-foreground">#{data.stats.skillsRank ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Skills Rank</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-foreground">{data.stats.skillsScore ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Skills Score</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-foreground">{data.stats.winRate.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">Win Rate</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
