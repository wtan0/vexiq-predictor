import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Search, Trophy, MapPin, Building2, ChevronRight, Loader2, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function TeamSearch() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const initialQuery = params.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isLoading } = trpc.teams.search.useQuery(
    { query: debouncedQuery, limit: 30 },
    { enabled: debouncedQuery.trim().length >= 1 }
  );

  return (
    <div className="min-h-screen py-10">
      <div className="container max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Team Search</h1>
          <p className="text-muted-foreground">
            Find any VEX IQ Elementary team from the 2025-2026 season by team number or name.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Enter team number (e.g. 81777A) or team name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-11 h-12 text-base bg-card border-border focus:border-primary"
          />
          {isLoading && (
            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Results */}
        {debouncedQuery.trim().length >= 1 && (
          <>
            {results && results.length === 0 && !isLoading && (
              <div className="text-center py-16 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg">No teams found for "{debouncedQuery}"</p>
                <p className="text-sm mt-2">Try searching by team number (e.g. 81777A) or team name</p>
              </div>
            )}

            {results && results.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-4">
                  Found {results.length} team{results.length !== 1 ? "s" : ""}
                </p>
                {results.map((team) => (
                  <Card
                    key={team.teamNumber}
                    className="bg-card border-border hover:border-primary/40 transition-all cursor-pointer group"
                    onClick={() => navigate(`/team/${team.teamNumber}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          {/* Rank badge */}
                          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex flex-col items-center justify-center">
                            <span className="text-xs text-muted-foreground leading-none">Rank</span>
                            <span className="text-sm font-bold text-primary leading-none">
                              {team.skillsRank ?? "—"}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-lg text-foreground">{team.teamNumber}</span>
                              {team.teamName && (
                                <span className="text-muted-foreground">·</span>
                              )}
                              {team.teamName && (
                                <span className="font-medium text-foreground truncate">{team.teamName}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              {team.organization && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Building2 className="h-3 w-3" />
                                  {team.organization}
                                </span>
                              )}
                              {team.country && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  {team.eventRegion ? `${team.eventRegion}, ` : ""}{team.country}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          {/* Score breakdown */}
                          <div className="hidden sm:flex items-center gap-3 text-sm">
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">Total</div>
                              <div className="font-semibold text-foreground">{team.skillsScore ?? "—"}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">Driver</div>
                              <div className="font-semibold text-cyan-400">{team.driverScore ?? "—"}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">Auto</div>
                              <div className="font-semibold text-amber-400">{team.autoScore ?? "—"}</div>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {debouncedQuery.trim().length === 0 && (
          <div className="text-center py-16">
            <Search className="h-16 w-16 mx-auto mb-6 text-muted-foreground/30" />
            <h2 className="text-xl font-semibold mb-2">Search for a team</h2>
            <p className="text-muted-foreground mb-6">
              Enter a team number like <code className="bg-secondary px-1.5 py-0.5 rounded text-sm">81777A</code> or
              a team name to get started.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {["81777A", "629Y", "2988A", "618X"].map((t) => (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  onClick={() => setQuery(t)}
                  className="border-border hover:bg-secondary"
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
