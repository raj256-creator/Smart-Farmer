import { useLocation } from "wouter";
import { Leaf, LayoutDashboard, ScanLine, MessageSquare, History, ArrowLeft, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface FarmLayoutProps {
  children: React.ReactNode;
  farmId: number;
  farmName?: string;
}

export function FarmLayout({ children, farmId, farmName }: FarmLayoutProps) {
  const [location, navigate] = useLocation();

  const tabs = [
    { href: `/farms/${farmId}/dashboard`, label: "Dashboard",    icon: LayoutDashboard },
    { href: `/farms/${farmId}/scan`,      label: "New Scan",     icon: ScanLine },
    { href: `/farms/${farmId}/trends`,    label: "Trends",       icon: TrendingUp },
    { href: `/farms/${farmId}/chat`,      label: "AI Assistant", icon: MessageSquare },
    { href: `/farms/${farmId}/history`,   label: "History",      icon: History },
  ];

  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="bg-card border-b border-border sticky top-0 z-40 shrink-0">
        <div className="flex items-center gap-3 px-4 py-3 max-w-7xl mx-auto">
          <button
            onClick={() => navigate("/")}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0"
            title="Back to all farms"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="bg-primary/10 p-1.5 rounded-lg shrink-0">
              <Leaf className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-none">AgriVision</p>
              <h1 className="font-bold text-base truncate leading-tight">{farmName ?? "My Farm"}</h1>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <nav className="flex border-t border-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.href}
              onClick={() => navigate(tab.href)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors shrink-0",
                isActive(tab.href)
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-x-hidden min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  );
}
