import { Switch, Route, Router as WouterRouter, useRoute, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import FarmDashboard from "@/pages/farm-dashboard";
import FarmChat from "@/pages/farm-chat";
import FarmScan from "@/pages/farm-scan";
import FarmHistory from "@/pages/farm-history";
import FarmTrends from "@/pages/farm-trends";

const queryClient = new QueryClient();

// ── Auth guard: redirect to home if farm not unlocked ─────────────────────────
function FarmAuthGuard({ children }: { children: React.ReactNode }) {
  const [, params] = useRoute("/farms/:id/*?");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  if (farmId > 0) {
    try {
      const unlocked: number[] = JSON.parse(localStorage.getItem("agrivision_unlocked") ?? "[]");
      if (!unlocked.includes(farmId)) {
        navigate("/");
        return null;
      }
    } catch {
      navigate("/");
      return null;
    }
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />

      {/* Per-farm routes */}
      <Route path="/farms/:id/dashboard">
        <FarmAuthGuard><FarmDashboard /></FarmAuthGuard>
      </Route>
      <Route path="/farms/:id/scan">
        <FarmAuthGuard><FarmScan /></FarmAuthGuard>
      </Route>
      <Route path="/farms/:id/chat">
        <FarmAuthGuard><FarmChat /></FarmAuthGuard>
      </Route>
      <Route path="/farms/:id/history">
        <FarmAuthGuard><FarmHistory /></FarmAuthGuard>
      </Route>
      <Route path="/farms/:id/trends">
        <FarmAuthGuard><FarmTrends /></FarmAuthGuard>
      </Route>

      {/* Legacy /farms/:id → redirect to dashboard */}
      <Route path="/farms/:id">
        {(params) => {
          const [, navigate] = useLocation();
          try {
            const unlocked: number[] = JSON.parse(localStorage.getItem("agrivision_unlocked") ?? "[]");
            const id = parseInt(params?.id ?? "0", 10);
            if (unlocked.includes(id)) { navigate(`/farms/${id}/dashboard`); return null; }
          } catch {}
          navigate("/");
          return null;
        }}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
