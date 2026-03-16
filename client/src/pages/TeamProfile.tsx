import { useParams, useLocation } from "wouter";
import {
  Trophy, MapPin, Building2, TrendingUp, Swords, ArrowLeft,
  RefreshCw, Loader2, Target, Zap, Users, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";

export default function TeamProfile() {
  const { teamNumber } = useParams<{ teamNumber: string }>();
  const [, navigate] = useLocation();

  const { data: stats, isLoading: statsLoading } = trpc.teams.detail.useQuery(
    { teamNumber: teamNumber ?? "" },
    { enabled: !!teamNumber }
  );

  const { data: progress, isLoading: progressLoading } = trpc.teams.seasonProgress.useQuery(
    { teamNumber: teamNumber ?? "" },
    { enabled: !!teamNumber }
  );

  const syncMatch = trpc.teams.syncMatchData.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.matchCount} matches from ${data.eventCount} events`);
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

  const chartData = (progress ?? []).map((p, i) => ({
    name: p.eventName.length > 20 ? p.eventName.slice(0, 20) + "…" : p.eventName,
    fullName: p.eventName,
    driver: p.driverScore ?? 0,
    auto: p.autoScore ?? 0,
    total: p.skillsScore ?? (p.driverScore ?? 0) + (p.autoScore ?? 0),
    rank: p.eventRank,
    wins: p.matchWins,
    losses: p.matchLosses,
    date: p.eventDate ? new Date(p.eventDate).toLocaleDateString() : `Event ${i + 1}`,
  }));

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
      label: "Match Win Rate",
      value: stats.totalMatches > 0 ? `${stats.winRate.toFixed(1)}%` : "—",
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-400/10",
    },
    {
      label: "Total Matches",
      value: stats.totalMatches > 0 ? `${stats.wins}W / ${stats.losses}L` : "—",
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
    },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-xl text-sm">
        <p className="font-semibold text-foreground mb-2">{payload[0]?.payload?.fullName || label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground capitalize">{p.dataKey}:</span>
            <span className="font-medium text-foreground">{p.value}</span>
          </div>
        ))}
      </div>
    );
  };

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
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{stats.teamNumber}</h1>
              {stats.teamName && (
                <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-base px-3 py-1">
                  {stats.teamName}
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
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMatch.mutate({ teamNumber: teamNumber! })}
              disabled={syncMatch.isPending}
              className="border-border hover:bg-secondary"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMatch.isPending ? "animate-spin" : ""}`} />
              Sync Matches
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

        {/* Season Progress Charts */}
        {progressLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length > 0 ? (
          <div className="space-y-6">
            {/* Skills Score Over Time */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Skills Score Progression
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "oklch(0.60 0.015 240)", fontSize: 11 }}
                      angle={-35}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis tick={{ fill: "oklch(0.60 0.015 240)", fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ color: "oklch(0.60 0.015 240)", fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Total Skills"
                      stroke="oklch(0.60 0.22 25)"
                      strokeWidth={2}
                      dot={{ fill: "oklch(0.60 0.22 25)", r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="driver"
                      name="Driver Skills"
                      stroke="oklch(0.65 0.18 200)"
                      strokeWidth={2}
                      dot={{ fill: "oklch(0.65 0.18 200)", r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="auto"
                      name="Auto Skills"
                      stroke="oklch(0.65 0.18 280)"
                      strokeWidth={2}
                      dot={{ fill: "oklch(0.65 0.18 280)", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Driver vs Auto Breakdown */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-cyan-400" />
                  Driver vs Autonomous Skills Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "oklch(0.60 0.015 240)", fontSize: 11 }}
                      angle={-35}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis tick={{ fill: "oklch(0.60 0.015 240)", fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ color: "oklch(0.60 0.015 240)", fontSize: 12 }} />
                    <Bar dataKey="driver" name="Driver Skills" fill="oklch(0.65 0.18 200)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="auto" name="Auto Skills" fill="oklch(0.65 0.18 280)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Match Results */}
            {chartData.some((d) => d.wins > 0 || d.losses > 0) && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-green-400" />
                    Team Match Results by Event
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.02 240)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "oklch(0.60 0.015 240)", fontSize: 11 }}
                        angle={-35}
                        textAnchor="end"
                        height={70}
                      />
                      <YAxis tick={{ fill: "oklch(0.60 0.015 240)", fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ color: "oklch(0.60 0.015 240)", fontSize: 12 }} />
                      <Bar dataKey="wins" name="Wins" fill="oklch(0.70 0.18 140)" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="losses" name="Losses" fill="oklch(0.55 0.22 25)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="py-16 text-center">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground mb-2">No detailed event data available yet.</p>
              <p className="text-sm text-muted-foreground mb-4">
                Click "Sync Matches" to fetch this team's match history from RobotEvents.
              </p>
              <Button
                variant="outline"
                onClick={() => syncMatch.mutate({ teamNumber: teamNumber! })}
                disabled={syncMatch.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${syncMatch.isPending ? "animate-spin" : ""}`} />
                Sync Match Data
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
