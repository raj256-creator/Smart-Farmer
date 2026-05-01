import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetFarmAnalytics, useGetFarm } from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Shield,
  BarChart2,
  RefreshCw,
  Zap,
} from "lucide-react";

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

function riskBadge(level: string) {
  if (level === "high") return <Badge className="bg-red-100 text-red-700 border-red-200">High</Badge>;
  if (level === "medium") return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Medium</Badge>;
  return <Badge className="bg-green-100 text-green-700 border-green-200">Low</Badge>;
}

function demandBadge(demand: string) {
  if (demand === "High") return <Badge className="bg-green-100 text-green-700 border-green-200">High Demand</Badge>;
  if (demand === "Medium") return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Medium</Badge>;
  return <Badge variant="secondary">Low</Badge>;
}

export default function FarmAnalytics() {
  const [, params] = useRoute("/farms/:id/analytics");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  const { data: farm } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });
  const { data, isLoading, isError, refetch, isFetching } = useGetFarmAnalytics(farmId, {
    query: { enabled: farmId > 0, staleTime: 5 * 60 * 1000 },
  });

  if (farmId <= 0) { navigate("/"); return null; }

  return (
    <Layout>
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate(`/farms/${farmId}`)} className="gap-2 shrink-0">
            <ArrowLeft className="w-4 h-4" />
            Farm Dashboard
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{farm?.name ?? "Farm"} — AI Analytics</h1>
            <p className="text-sm text-muted-foreground">Yield predictions, risk assessment, and crop performance insights</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate(`/farms/${farmId}/yield`)} className="gap-1.5">
              <Zap className="w-4 h-4" />
              Yield Optimizer
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Running AI analytics for your farm...</p>
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-destructive">
            <AlertTriangle className="w-8 h-8" />
            <p>Failed to load analytics.</p>
            <Button onClick={() => refetch()} variant="outline">Try Again</Button>
          </div>
        )}

        {data && (
          <>
            {/* Yield Prediction */}
            <div className="grid md:grid-cols-3 gap-4">
              <Card className="md:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Yield Prediction
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-3xl font-bold text-primary">
                      {data.yieldPrediction.totalEstimatedKg.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">kg estimated this season</p>
                  </div>
                  <p className="text-sm text-muted-foreground bg-primary/5 rounded-lg p-3 border border-primary/10">
                    {data.yieldPrediction.seasonalOutlook}
                  </p>
                  <div className="space-y-2 pt-1">
                    {data.yieldPrediction.bycrops.map((c: { crop: string; estimatedKg: number; confidence: string }) => (
                      <div key={c.crop} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{c.crop}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{c.estimatedKg.toLocaleString()} kg</span>
                          <Badge variant="outline" className="text-xs">{c.confidence}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Yield by crop bar chart */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Yield Breakdown by Crop</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.yieldPrediction.bycrops} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="crop" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => [`${v.toLocaleString()} kg`, "Yield"]} />
                      <Bar dataKey="estimatedKg" radius={[4, 4, 0, 0]} name="Yield (kg)">
                        {data.yieldPrediction.bycrops.map((_: unknown, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Risk Alerts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="w-4 h-4 text-amber-500" />
                  Risk Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-3">
                  {data.riskAlerts.map((alert: { risk: string; level: string; description: string; action: string }, i: number) => (
                    <div key={i} className="rounded-xl border p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{alert.risk}</span>
                        {riskBadge(alert.level)}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{alert.description}</p>
                      <div className="bg-primary/5 rounded-lg p-2.5 border border-primary/10">
                        <p className="text-xs font-medium text-primary">Action: {alert.action}</p>
                      </div>
                    </div>
                  ))}
                  {data.riskAlerts.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2">No significant risks detected.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Crop Comparison */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  Crop Profitability Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Crop</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Profitability</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Demand</th>
                        <th className="text-right py-2 px-4 font-medium text-muted-foreground">Yield/Acre</th>
                        <th className="text-right py-2 pl-4 font-medium text-muted-foreground">Revenue/Acre</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cropComparison.map((c: {
                        crop: string;
                        profitabilityScore: number;
                        marketDemand: string;
                        avgYieldKgPerAcre: number;
                        estimatedRevenuePerAcre: number;
                      }) => (
                        <tr key={c.crop} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-3 pr-4 font-medium">{c.crop}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5">
                                <div
                                  className="bg-primary h-1.5 rounded-full"
                                  style={{ width: `${c.profitabilityScore}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium">{c.profitabilityScore}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">{demandBadge(c.marketDemand)}</td>
                          <td className="py-3 px-4 text-right text-muted-foreground">{c.avgYieldKgPerAcre.toLocaleString()} kg</td>
                          <td className="py-3 pl-4 text-right font-semibold">INR {c.estimatedRevenuePerAcre.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Trend chart */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">12-Month Trend Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="yield" stroke="#22c55e" strokeWidth={2} name="Yield (kg)" dot={false} />
                    <Line yAxisId="left" type="monotone" dataKey="rainfall" stroke="#3b82f6" strokeWidth={2} name="Rainfall (mm)" dot={false} strokeDasharray="5 5" />
                    <Line yAxisId="right" type="monotone" dataKey="healthScore" stroke="#f59e0b" strokeWidth={2} name="Health Score" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* AI Recommendations */}
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">AI Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{data.aiRecommendations}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
