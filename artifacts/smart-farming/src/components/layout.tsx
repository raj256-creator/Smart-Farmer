import { Link, useLocation } from "wouter";
import { Leaf, LayoutDashboard, Scan, History, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/scan/new", label: "New Scan", icon: Scan },
    { href: "/history", label: "History", icon: History },
    { href: "/chat", label: "AI Assistant", icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <nav className="w-full md:w-64 bg-card border-r border-border shrink-0 md:h-screen sticky top-0 z-50">
        <div className="p-4 md:p-6 flex items-center gap-2 border-b border-border">
          <div className="bg-primary/10 p-2 rounded-lg text-primary">
            <Leaf className="w-6 h-6" />
          </div>
          <span className="font-bold text-xl text-foreground">AgriVision</span>
        </div>
        <div className="p-4 flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer shrink-0 whitespace-nowrap text-muted-foreground hover:bg-secondary hover:text-secondary-foreground font-bold"
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </div>
            </Link>
          ))}
        </div>
      </nav>
      <main className="flex-1 overflow-x-hidden min-w-0 flex flex-col">
        {children}
      </main>
    </div>
  );
}
