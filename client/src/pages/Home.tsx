import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Trophy, Swords, TrendingUp, Globe, Database, RefreshCw, ChevronRight, Zap, UserPlus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl, getSignUpUrl } from "@/const";

export default function Home() {
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAuth();

  const syncStatus = trpc.sync.status.useQuery(undefined, { refetchInterval: 10000 });
  const triggerSync = trpc.sync.triggerSkillsSync.useMutation({
    onSuccess: () => {
      toast.success("Data sync started! This may take a minute.");
      syncStatus.refetch();
    },
    onError: (e) => toast.error(`Sync failed: ${e.message}`),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/teams?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const lastSync = syncStatus.data?.logs?.[0];
  const teamCount = syncStatus.data?.teamCount ?? 0;

  const features = [
    {
      icon: Swords,
      title: "Head-to-Head Comparison",
      desc: "Compare any two teams with AI-powered winning probability analysis across driver skills, auto skills, and match records.",
      href: "/compare",
      color: "text-red-400",
      bg: "bg-red-400/10",
    },
    {
      icon: TrendingUp,
      title: "Season Progress Tracker",
      desc: "Visualize a team's performance journey through the 2025-2026 season with interactive charts broken down by competition type.",
      href: "/teams",
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
    },
    {
      icon: Globe,
      title: "World Finals Predictor",
      desc: "See which teams have the best odds of winning the April 2026 VEX IQ World Championship based on comprehensive season data.",
      href: "/world-finals",
      color: "text-amber-400",
      bg: "bg-amber-400/10",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "linear-gradient(oklch(0.65 0.18 200) 1px, transparent 1px), linear-gradient(90deg, oklch(0.65 0.18 200) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        <div className="container relative">
          <div className="max-w-3xl mx-auto text-center">
            <Badge
              variant="outline"
              className="mb-6 border-primary/40 text-primary bg-primary/10 px-3 py-1"
            >
              <Zap className="h-3 w-3 mr-1.5" />
              2025-2026 Season · Elementary Level
            </Badge>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              <span className="text-foreground">VEX IQ</span>
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, oklch(0.60 0.22 25), oklch(0.65 0.18 200))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Championship Predictor
              </span>
            </h1>

            <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto">
              Analyze team performance, compare winning odds, and predict the April 2026 World
              Championship outcome using real 2025-2026 season data from RobotEvents.
            </p>

            {/* Quick Search */}
            <form onSubmit={handleSearch} className="flex gap-2 max-w-md mx-auto mb-8">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search team number or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-card border-border"
                />
              </div>
              <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Search
              </Button>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => navigate("/compare")}
                className="border-border hover:bg-secondary"
              >
                <Swords className="h-4 w-4 mr-2" />
                Compare Teams
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/world-finals")}
                className="border-amber-500/40 text-amber-400 hover:bg-amber-400/10"
              >
                <Trophy className="h-4 w-4 mr-2" />
                World Finals Odds
              </Button>
            </div>

            {/* Sign Up / Sign In CTA for logged-out visitors */}
            {!user && (
              <div className="mt-10 pt-8 border-t border-border/40">
                <p className="text-sm text-muted-foreground mb-4">
                  Create a free account to sync team data and unlock all features.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    size="lg"
                    className="bg-primary hover:bg-primary/90 gap-2 shadow-lg shadow-primary/20"
                    onClick={() => { window.location.href = getSignUpUrl(); }}
                  >
                    <UserPlus className="h-4 w-4" />
                    Create Free Account
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="gap-2 border-border hover:bg-secondary"
                    onClick={() => { window.location.href = getLoginUrl(); }}
                  >
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Data Status Bar */}
      <section className="border-y border-border bg-card/50 py-3">
        <div className="container flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-cyan-400" />
              <span className="text-muted-foreground">
                {teamCount > 0 ? (
                  <span>
                    <span className="text-foreground font-semibold">{teamCount.toLocaleString()}</span> teams loaded
                  </span>
                ) : (
                  <span className="text-amber-400">No data yet — sync required</span>
                )}
              </span>
            </div>
            {lastSync && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Last sync:</span>
                <Badge
                  variant="outline"
                  className={
                    lastSync.status === "success"
                      ? "border-green-500/40 text-green-400 bg-green-400/10"
                      : lastSync.status === "running"
                      ? "border-cyan-500/40 text-cyan-400 bg-cyan-400/10"
                      : "border-red-500/40 text-red-400 bg-red-400/10"
                  }
                >
                  {lastSync.status}
                </Badge>
                <span className="text-xs">
                  {lastSync.startedAt
                    ? new Date(lastSync.startedAt).toLocaleString()
                    : ""}
                </span>
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending || lastSync?.status === "running"}
            className="border-border hover:bg-secondary text-sm"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 ${triggerSync.isPending ? "animate-spin" : ""}`}
            />
            {lastSync?.status === "running" ? "Syncing..." : "Sync Data"}
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              Everything you need to predict the champion
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Powered by real 2025-2026 season data including skills scores, match records, and
              partner team performance from all league nights and tournaments.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc, href, color, bg }) => (
              <Card
                key={title}
                className="bg-card border-border hover:border-primary/30 transition-all duration-200 cursor-pointer group"
                onClick={() => navigate(href)}
              >
                <CardContent className="p-6">
                  <div className={`inline-flex p-3 rounded-xl ${bg} mb-4`}>
                    <Icon className={`h-6 w-6 ${color}`} />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4">{desc}</p>
                  <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 gap-1 transition-all">
                    Explore <ChevronRight className="h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 border-t border-border bg-card/30">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { value: teamCount > 0 ? `${teamCount.toLocaleString()}+` : "6,600+", label: "Teams Tracked" },
              { value: "3", label: "Performance Metrics" },
              { value: "100%", label: "Free to Use" },
              { value: "Apr 2026", label: "World Finals" },
            ].map(({ value, label }) => (
              <div key={label}>
                <div className="text-3xl font-bold text-primary mb-1">{value}</div>
                <div className="text-sm text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <div className="container">
          <p>
            Data sourced from{" "}
            <a
              href="https://www.robotevents.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              RobotEvents.com
            </a>{" "}
            · VEX IQ Elementary 2025-2026 Season · Not affiliated with VEX Robotics
          </p>
        </div>
      </footer>
    </div>
  );
}
