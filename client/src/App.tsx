import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import TeamSearch from "./pages/TeamSearch";
import TeamProfile from "./pages/TeamProfile";
import HeadToHead from "./pages/HeadToHead";
import WorldFinals from "./pages/WorldFinals";
import InviteAccept from "./pages/InviteAccept";
import AdminUsers from "./pages/AdminUsers";
import NavBar from "./components/NavBar";

function Router() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/teams" component={TeamSearch} />
        <Route path="/team/:teamNumber" component={TeamProfile} />
        <Route path="/compare" component={HeadToHead} />
        <Route path="/world-finals" component={WorldFinals} />
        <Route path="/invite/:token" component={InviteAccept} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
