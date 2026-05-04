import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import ScanWizard from "@/pages/scan-wizard";
import ScanDetail from "@/pages/scan-detail";
import History from "@/pages/history";
import Chat from "@/pages/chat";
import FarmDashboard from "@/pages/farm-dashboard";
import FarmAnalytics from "@/pages/farm-analytics";
import FarmYield from "@/pages/farm-yield";
import SoilClimate from "@/pages/soil-climate";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/farms/:id" component={FarmDashboard} />
      <Route path="/farms/:id/analytics" component={FarmAnalytics} />
      <Route path="/farms/:id/yield" component={FarmYield} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/scan/new" component={ScanWizard} />
      <Route path="/scan/:id" component={ScanDetail} />
      <Route path="/history" component={History} />
      <Route path="/chat" component={Chat} />
      <Route path="/soil-climate" component={SoilClimate} />
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
