import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Link2, CheckCircle2, XCircle, LogIn } from "lucide-react";
import { toast } from "sonner";

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();
  const [accepted, setAccepted] = useState(false);

  // Validate the token first (public — works before login)
  const { data: validation, isLoading: validating } = trpc.invites.validate.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  // Accept mutation (protected — requires login)
  const accept = trpc.invites.accept.useMutation({
    onSuccess: (data) => {
      setAccepted(true);
      toast.success(
        data.createdByName
          ? `You joined via ${data.createdByName}'s invite!`
          : "Invite accepted! Welcome.",
        { description: "You now have full access to VEX IQ Championship Predictor." }
      );
    },
    onError: (e) => {
      toast.error(`Could not accept invite: ${e.message}`);
    },
  });

  // Once user is logged in and token is valid, auto-accept
  useEffect(() => {
    if (!authLoading && user && validation?.valid && !accepted && !accept.isPending && !accept.isSuccess) {
      accept.mutate({ token: token! });
    }
  }, [authLoading, user, validation, accepted, token]);

  const isLoading = validating || authLoading;
  // Store token in sessionStorage so we can re-accept after OAuth redirect
  useEffect(() => {
    if (token) sessionStorage.setItem("pendingInviteToken", token);
  }, [token]);

  // ── Render states ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Invalid / revoked / expired token
  if (!validation?.valid) {
    const reason =
      (validation as any)?.reason === "revoked"
        ? "This invite link has been revoked."
        : (validation as any)?.reason === "expired"
        ? "This invite link has expired."
        : "This invite link is invalid or no longer exists.";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="bg-card border-border max-w-md w-full">
          <CardContent className="py-12 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <p className="text-foreground font-semibold text-lg mb-2">Invalid Invite</p>
            <p className="text-muted-foreground text-sm mb-6">{reason}</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Valid token — user not logged in yet
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="bg-card border-border max-w-md w-full">
          <CardContent className="py-12 text-center">
            <Link2 className="h-12 w-12 mx-auto mb-4 text-primary" />
            <p className="text-foreground font-semibold text-lg mb-1">You've been invited!</p>
            {validation.createdByName && (
              <p className="text-muted-foreground text-sm mb-1">
                Invited by <span className="font-medium text-foreground">{validation.createdByName}</span>
              </p>
            )}
            {validation.label && (
              <p className="text-muted-foreground text-sm mb-3 italic">"{validation.label}"</p>
            )}
            <p className="text-muted-foreground text-sm mb-6">
              Sign in to accept this invite and get access to VEX IQ Championship Predictor.
            </p>
            <Button
              className="bg-primary hover:bg-primary/90"
              onClick={() => { window.location.href = getLoginUrl(); }}
            >
              <LogIn className="h-4 w-4 mr-2" />
              Sign In to Accept
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Accepting in progress
  if (accept.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Accepting invite…</p>
        </div>
      </div>
    );
  }

  // Successfully accepted
  if (accepted || accept.isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="bg-card border-border max-w-md w-full">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="text-foreground font-semibold text-lg mb-2">Welcome aboard!</p>
            <p className="text-muted-foreground text-sm mb-6">
              You now have full access to VEX IQ Championship Predictor.
            </p>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => navigate("/")}>
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (accept.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="bg-card border-border max-w-md w-full">
          <CardContent className="py-12 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <p className="text-foreground font-semibold text-lg mb-2">Could not accept invite</p>
            <p className="text-muted-foreground text-sm mb-6">{accept.error?.message}</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
