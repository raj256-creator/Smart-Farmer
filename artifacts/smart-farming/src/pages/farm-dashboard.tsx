import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useGetFarmDashboard } from "@workspace/api-client-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  CloudRain,
  Thermometer,
  Droplets,
  Leaf,
  BarChart2,
  Zap,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

function severityColor(severity: string) {
  if (severity === "high") return "bg-red-100 text-red-700 border-red-200";
  if (severity === "medium") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

function healthColor(health: string) {
  if (health === "Good") return "text-green-600";
  if (health === "Fair") return "text-amber-600";
  return "text-red-600";
}

export default function FarmDashboard() {
  const [, params] = useRoute("/farms/:id");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  const { data, isLoading, isError, refetch, isFetching } = useGetFarmDashboard(farmId, {
    query: { enabled: farmId > 0, staleTime: 5 * 60 * 1000 },
  });

  if (farmId <= 0) {
    navigate("/");
    return null;
  }

  return (
    <Layout>
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate("/")} className="gap-2 shrink-0">
            <ArrowLeft className="w-4 h-4" />
            All Farms
          </Button>
          {data && (
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{data.farm.name}</h1>
              <p className="text-sm text-muted-foreground">{data.farm.location}</p>
            </div>
          )}
          <div className="flex gap-2 ml-auto shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate(`/farms/${farmId}/analytics`)} className="gap-1.5">
              <BarChart2 className="w-4 h-4" />
              Analytics
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/farms/${farmId}/yield`)} className="gap-1.5">
              <Zap className="w-4 h-4" />
              Yield Optimizer
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh" disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Generating AI farm insights...</p>
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-destructive">
            <AlertTriangle className="w-8 h-8" />
            <p>Failed to load farm dashboard.</p>
            <Button onClick={() => refetch()} variant="outline">Try Again</Button>
          </div>
        )}

        {data && (
          <>
            {/* Top stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Overall Health</p>
                  <p className="text-3xl font-bold text-primary">{data.healthScore}%</p>
                  <Progress value={data.healthScore} className="h-1.5 mt-2" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Land Area</p>
                  <p className="text-3xl font-bold">{data.farm.acreage ? parseFloat(data.farm.acreage).toFixed(1) : "--"}</p>
                  <p className="text-xs text-muted-foreground mt-1">acres</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Crops</p>
                  <p className="text-3xl font-bold">{((data.farm.crops as string[]) ?? []).length}</p>
                  <p className="text-xs text-muted-foreground mt-1">crop types</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Status</p>
                  <p className="text-lg font-semibold capitalize mt-1">{data.farm.status}</p>
                  <div className={`w-2 h-2 rounded-full mt-1 ${data.farm.status === "active" ? "bg-green-500" : data.farm.status === "monitoring" ? "bg-amber-500" : "bg-gray-400"}`} />
                </CardContent>
              </Card>
            </div>

            {/* Middle row: Crop Health + Alerts */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Crop health map */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Leaf className="w-4 h-4 text-primary" />
                    Crop Health Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(data.cropHealthMap as Array<{ crop: string; health: string; score: number }>).map((item) => (
                    <div key={item.crop} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-28 shrink-0">{item.crop}</span>
                      <Progress value={item.score} className="flex-1 h-2" />
                      <span className={`text-xs font-semibold w-10 shrink-0 ${healthColor(item.health)}`}>
                        {item.health}
                      </span>
                      <span className="text-xs text-muted-foreground w-8 text-right">{item.score}%</span>
                    </div>
                  ))}
                  {data.cropHealthMap.length === 0 && (
                    <p className="text-sm text-muted-foreground">No crop data available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Alerts */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Recent Alerts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(data.recentAlerts as Array<{ type: string; message: string; severity: string }>).map((alert, i) => (
                    <div key={i} className={`rounded-lg border px-3 py-2.5 ${severityColor(alert.severity)}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold uppercase">{alert.type}</span>
                        <Badge variant="outline" className={`text-xs capitalize ${severityColor(alert.severity)}`}>
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed">{alert.message}</p>
                    </div>
                  ))}
                  {data.recentAlerts.length === 0 && (
                    <p className="text-sm text-muted-foreground">No active alerts.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Weather + Soil row */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Weather */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CloudRain className="w-4 h-4 text-sky-500" />
                    Weather Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <Thermometer className="w-4 h-4 text-orange-500 mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">Temp</p>
                      <p className="text-sm font-semibold">{(data.weatherInsights as { temperature: string }).temperature}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <Droplets className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">Humidity</p>
                      <p className="text-sm font-semibold">{(data.weatherInsights as { humidity: string }).humidity}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-muted/50">
                      <CloudRain className="w-4 h-4 text-sky-400 mx-auto mb-1" />
                      <p className="text-xs text-muted-foreground">Rainfall</p>
                      <p className="text-sm font-semibold">{(data.weatherInsights as { rainfall: string }).rainfall}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground bg-sky-50 dark:bg-sky-950/20 rounded-lg p-3 border border-sky-100 dark:border-sky-900">
                    {(data.weatherInsights as { advisory: string }).advisory}
                  </p>
                </CardContent>
              </Card>

              {/* Soil */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="w-4 h-4 text-amber-700 font-bold text-sm">N</span>
                    Soil Health Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { label: "pH", value: (data.soilInsights as { ph: string }).ph },
                      { label: "Nitrogen", value: (data.soilInsights as { nitrogen: string }).nitrogen },
                      { label: "Phosphorus", value: (data.soilInsights as { phosphorus: string }).phosphorus },
                      { label: "Potassium", value: (data.soilInsights as { potassium: string }).potassium },
                    ].map((s) => (
                      <div key={s.label} className="text-center p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                        <p className="text-xs text-muted-foreground mb-0.5">{s.label}</p>
                        <p className="text-sm font-semibold">{s.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 border border-amber-100 dark:border-amber-900">
                    {(data.soilInsights as { advisory: string }).advisory}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Performance trend chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Historical Performance (Last 6 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.performanceTrend as Array<{ month: string; yield: number; health: number }>}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="yield" orientation="left" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="health" orientation="right" tick={{ fontSize: 12 }} domain={[0, 100]} />
                    <Tooltip />
                    <Line yAxisId="yield" type="monotone" dataKey="yield" stroke="#22c55e" strokeWidth={2} name="Yield (kg)" dot={false} />
                    <Line yAxisId="health" type="monotone" dataKey="health" stroke="#3b82f6" strokeWidth={2} name="Health (%)" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* AI Insights */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  AI Farm Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-foreground">{data.aiInsights}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-2"
                  onClick={() => navigate("/chat")}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Ask AI About This Farm
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
