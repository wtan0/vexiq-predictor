import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Link2,
  Copy,
  Check,
  Trash2,
  Plus,
  Users,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  UserCheck,
  Info,
  ExternalLink,
} from "lucide-react";

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
}

function formatDate(d: Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelative(d: Date | null | undefined) {
  if (!d) return null;
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getInviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
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

/** Sub-component: shows accepted-by list for one invite, lazily fetched on expand */
function AcceptedByList({ token }: { token: string }) {
  const { data, isLoading } = trpc.invites.acceptedBy.useQuery({ token });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 py-1 pl-1">
        <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1 pl-1 italic">No one has accepted this link yet.</p>
    );
  }

  return (
    <div className="space-y-1.5 pt-1">
      {data.map((u) => (
        <div key={u.openId} className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-primary">{getInitials(u.name)}</span>
          </div>
          <span className="text-xs text-foreground flex-1 truncate">{u.name ?? "Anonymous"}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{formatRelative(u.acceptedAt)}</span>
        </div>
      ))}
    </div>
  );
}

export function InviteModal({ open, onClose }: InviteModalProps) {
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());

  const utils = trpc.useUtils();

  const { data: invites, isLoading } = trpc.invites.list.useQuery(undefined, {
    enabled: open,
  });

  const createInvite = trpc.invites.create.useMutation({
    onSuccess: ({ token }) => {
      toast.success("Invite link created!", {
        description: "Share this link with anyone who already has a Manus account.",
      });
      setLabel("");
      setExpiresInDays("");
      utils.invites.list.invalidate();
      copyToClipboard(token);
    },
    onError: (e) => toast.error(`Failed to create invite: ${e.message}`),
  });

  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: () => {
      toast.success("Invite revoked.");
      utils.invites.list.invalidate();
    },
    onError: (e) => toast.error(`Failed to revoke: ${e.message}`),
  });

  const copyToClipboard = (token: string) => {
    const url = getInviteUrl(token);
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      toast.success("Link copied to clipboard!", { description: url });
      setTimeout(() => setCopiedToken(null), 2500);
    });
  };

  const toggleExpanded = (token: string) => {
    setExpandedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  const handleCreate = () => {
    createInvite.mutate({
      label: label.trim() || undefined,
      expiresInDays: expiresInDays !== "" ? Number(expiresInDays) : undefined,
    });
  };

  const activeInvites = (invites ?? []).filter((i) => i.status === "active");
  const revokedInvites = (invites ?? []).filter((i) => i.status === "revoked");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Link2 className="h-5 w-5 text-primary" />
            Invite to App
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Share access with people who already have a Manus account.
          </DialogDescription>
        </DialogHeader>

        {/* Platform restriction notice */}
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <Info className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-amber-300">Inviting new users (no Manus account)</p>
            <p className="text-xs text-amber-200/80">
              This app is in restricted-access mode. To invite someone who doesn't have a Manus account yet,
              you must first add them via the{" "}
              <strong className="text-amber-200">Manus Management UI → Settings → Members</strong>.
              Once they have a Manus account and have been added to the app, they can use the link below to join.
            </p>
            <a
              href="https://help.manus.im"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2"
            >
              Learn more <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Create new invite */}
        <div className="space-y-3 border border-border rounded-lg p-4 bg-background/40">
          <p className="text-sm font-medium text-foreground">Create Invite Link</p>
          <p className="text-xs text-muted-foreground">
            Generate a link for existing Manus users to join this app. They will be automatically registered
            when they open the link and log in.
          </p>
          <div className="space-y-2">
            <Label htmlFor="invite-label" className="text-xs text-muted-foreground">
              Label (optional)
            </Label>
            <Input
              id="invite-label"
              placeholder="e.g. For Coach Smith"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="bg-background border-border text-foreground placeholder:text-muted-foreground h-8 text-sm"
              maxLength={128}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-expiry" className="text-xs text-muted-foreground">
              Expires in (days, optional — leave blank for no expiry)
            </Label>
            <Input
              id="invite-expiry"
              type="number"
              min={1}
              max={365}
              placeholder="e.g. 7"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value === "" ? "" : Number(e.target.value))}
              className="bg-background border-border text-foreground placeholder:text-muted-foreground h-8 text-sm w-32"
            />
          </div>
          <Button
            onClick={handleCreate}
            disabled={createInvite.isPending}
            className="bg-primary hover:bg-primary/90 h-8 text-sm"
          >
            {createInvite.isPending ? (
              <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Creating…</>
            ) : (
              <><Plus className="h-3.5 w-3.5 mr-1.5" /> Generate Link</>
            )}
          </Button>
        </div>

        {/* Active invites */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Active Links</p>
            {isLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {activeInvites.length > 0 && (
              <Badge variant="secondary" className="text-xs">{activeInvites.length}</Badge>
            )}
          </div>

          {!isLoading && activeInvites.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No active invite links yet. Create one above.</p>
          )}

          <div className="space-y-2">
            {activeInvites.map((inv) => {
              const url = getInviteUrl(inv.token);
              const isCopied = copiedToken === inv.token;
              const isExpired = inv.expiresAt && new Date(inv.expiresAt) < new Date();
              const isExpanded = expandedTokens.has(inv.token);

              return (
                <div
                  key={inv.id}
                  className="rounded-lg border border-border bg-background/30 overflow-hidden"
                >
                  {/* Main row */}
                  <div className="flex items-start gap-2 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {inv.label && (
                          <span className="text-xs font-medium text-foreground">{inv.label}</span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {inv.useCount} {inv.useCount === 1 ? "use" : "uses"}
                        </span>
                        {inv.expiresAt && (
                          <span className={`flex items-center gap-1 text-xs ${isExpired ? "text-destructive" : "text-muted-foreground"}`}>
                            <Clock className="h-3 w-3" />
                            {isExpired ? "Expired" : `Expires ${formatDate(inv.expiresAt)}`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate font-mono">{url}</p>
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
                        Created {formatDate(inv.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Copy link"
                        onClick={() => copyToClipboard(inv.token)}
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Revoke invite"
                        disabled={revokeInvite.isPending}
                        onClick={() => revokeInvite.mutate({ token: inv.token })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Accepted by toggle */}
                  <button
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 border-t border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-background/20 transition-colors"
                    onClick={() => toggleExpanded(inv.token)}
                  >
                    <UserCheck className="h-3 w-3" />
                    <span>Accepted by</span>
                    {inv.useCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">{inv.useCount}</Badge>
                    )}
                    <span className="ml-auto">
                      {isExpanded
                        ? <ChevronDown className="h-3 w-3" />
                        : <ChevronRight className="h-3 w-3" />
                      }
                    </span>
                  </button>

                  {/* Expanded accepted-by list */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/30 bg-background/10">
                      <AcceptedByList token={inv.token} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Revoked invites (collapsed summary) */}
        {revokedInvites.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {revokedInvites.length} revoked {revokedInvites.length === 1 ? "link" : "links"} (not shown)
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
