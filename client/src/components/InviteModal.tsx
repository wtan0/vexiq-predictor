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
} from "lucide-react";

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
}

function formatDate(d: Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getInviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
}

export function InviteModal({ open, onClose }: InviteModalProps) {
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: invites, isLoading } = trpc.invites.list.useQuery(undefined, {
    enabled: open,
  });

  const createInvite = trpc.invites.create.useMutation({
    onSuccess: ({ token }) => {
      toast.success("Invite link created!", {
        description: "Copy the link and share it with anyone you want to invite.",
      });
      setLabel("");
      setExpiresInDays("");
      utils.invites.list.invalidate();
      // Auto-copy the new link
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
      toast.success("Link copied to clipboard!", {
        description: url,
      });
      setTimeout(() => setCopiedToken(null), 2500);
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
            Invite by Link
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Generate a shareable link. Anyone who opens it and logs in will gain access to this app.
          </DialogDescription>
        </DialogHeader>

        {/* Create new invite */}
        <div className="space-y-3 border border-border rounded-lg p-4 bg-background/40">
          <p className="text-sm font-medium text-foreground">Create New Invite Link</p>
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
              return (
                <div
                  key={inv.id}
                  className="flex items-start gap-2 p-3 rounded-lg border border-border bg-background/30"
                >
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
