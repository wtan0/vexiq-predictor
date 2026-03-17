import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Trophy, Search, Swords, Globe, Home, Link2, Shield, LogIn, UserPlus, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { InviteModal } from "@/components/InviteModal";
import { getLoginUrl, getSignUpUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/teams", label: "Team Search", icon: Search },
  { href: "/compare", label: "Head-to-Head", icon: Swords },
  { href: "/world-finals", label: "World Finals", icon: Globe },
];

export default function NavBar() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success("Signed out successfully.");
      window.location.href = "/";
    },
  });

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/30">
              <Trophy className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-foreground">VEX IQ</span>
              <span className="text-xs text-muted-foreground">Championship Predictor</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  location === href
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}

            {user ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setInviteOpen(true)}
                >
                  <Link2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Invite</span>
                </Button>

                {user.role === "admin" && (
                  <Link
                    href="/admin/users"
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      location === "/admin/users"
                        ? "bg-yellow-500/15 text-yellow-500"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                )}

                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
                  <span className="text-xs text-muted-foreground truncate max-w-[100px]">{user.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    title="Sign out"
                    onClick={() => logout.mutate()}
                    disabled={logout.isPending}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => { window.location.href = getLoginUrl(location !== "/" ? location : undefined); }}
                >
                  <LogIn className="h-4 w-4" />
                  Sign In
                </Button>
                <Button
                  size="sm"
                  className="flex items-center gap-1.5 bg-primary hover:bg-primary/90"
                  onClick={() => { window.location.href = getSignUpUrl(location !== "/" ? location : undefined); }}
                >
                  <UserPlus className="h-4 w-4" />
                  Sign Up
                </Button>
              </div>
            )}
          </nav>

          {/* Mobile Nav */}
          <nav className="flex md:hidden items-center gap-1">
            {navItems.map(({ href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center justify-center rounded-md p-2 transition-colors",
                  location === href
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Icon className="h-5 w-5" />
              </Link>
            ))}

            {user ? (
              <button
                className="flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                onClick={() => setInviteOpen(true)}
                title="Invite by link"
              >
                <Link2 className="h-5 w-5" />
              </button>
            ) : (
              <button
                className="flex items-center justify-center rounded-md p-2 text-primary hover:bg-primary/10 transition-colors"
                onClick={() => { window.location.href = getLoginUrl(); }}
                title="Sign in"
              >
                <LogIn className="h-5 w-5" />
              </button>
            )}
          </nav>
        </div>
      </header>

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
