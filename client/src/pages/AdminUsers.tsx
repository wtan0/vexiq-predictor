import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  ShieldOff,
  Search,
  RefreshCw,
  Users,
  Crown,
  Link2,
  Calendar,
} from "lucide-react";

function formatDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function AdminUsers() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [search, setSearch] = useState("");

  const { data: userList, isLoading, refetch } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
    retry: false,
  });

  const utils = trpc.useUtils();
  const setRole = trpc.admin.setRole.useMutation({
    onSuccess: (_, vars) => {
      toast.success(
        vars.role === "admin"
          ? "User promoted to Admin."
          : "User demoted to regular user."
      );
      utils.admin.listUsers.invalidate();
    },
    onError: (e) => toast.error(`Failed to update role: ${e.message}`),
  });

  // Redirect non-admins
  if (!loading && user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  if (!loading && !user) {
    navigate("/");
    return null;
  }

  const filtered = (userList ?? []).filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (u.name ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      (u.openId ?? "").toLowerCase().includes(q)
    );
  });

  const adminCount = (userList ?? []).filter((u) => u.role === "admin").length;
  const totalCount = (userList ?? []).length;

  return (
    <div className="container py-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Manage Users
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            View all registered users, their invite source, and manage roles.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Users</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="h-4 w-4 text-yellow-500" />
            <span className="text-xs text-muted-foreground">Admins</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{adminCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Joined via Invite</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {(userList ?? []).filter((u) => u.inviteToken).length}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">User</TableHead>
              <TableHead className="text-muted-foreground">Role</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Joined
                </span>
              </TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">
                <span className="flex items-center gap-1">
                  <Link2 className="h-3.5 w-3.5" /> Invite Source
                </span>
              </TableHead>
              <TableHead className="text-muted-foreground text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                  Loading users…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  {search ? "No users match your search." : "No users found."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((u) => {
              const isCurrentUser = u.openId === user?.openId;
              const isAdmin = u.role === "admin";
              return (
                <TableRow key={u.openId} className="border-border">
                  {/* User */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-primary">{getInitials(u.name)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {u.name ?? "Unnamed User"}
                          {isCurrentUser && (
                            <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
                          )}
                        </p>
                        {u.email && (
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Role */}
                  <TableCell>
                    {isAdmin ? (
                      <Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30 gap-1">
                        <Crown className="h-3 w-3" /> Admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-muted-foreground">
                        User
                      </Badge>
                    )}
                  </TableCell>

                  {/* Joined */}
                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                    {formatDate(u.createdAt)}
                  </TableCell>

                  {/* Invite source */}
                  <TableCell className="hidden lg:table-cell">
                    {u.inviteToken ? (
                      <div>
                        <p className="text-xs text-foreground">
                          {u.inviteLabel ?? "Unnamed link"}
                        </p>
                        {u.invitedBy && (
                          <p className="text-xs text-muted-foreground">by {u.invitedBy}</p>
                        )}
                        {u.inviteAcceptedAt && (
                          <p className="text-xs text-muted-foreground/60">{formatDate(u.inviteAcceptedAt)}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">Direct sign-up</span>
                    )}
                  </TableCell>

                  {/* Action */}
                  <TableCell className="text-right">
                    {isCurrentUser ? (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    ) : isAdmin ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={setRole.isPending}
                        onClick={() => setRole.mutate({ openId: u.openId, role: "user" })}
                      >
                        <ShieldOff className="h-3 w-3" />
                        Demote
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10"
                        disabled={setRole.isPending}
                        onClick={() => setRole.mutate({ openId: u.openId, role: "admin" })}
                      >
                        <Shield className="h-3 w-3" />
                        Make Admin
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 text-right">
          Showing {filtered.length} of {totalCount} users
        </p>
      )}
    </div>
  );
}
