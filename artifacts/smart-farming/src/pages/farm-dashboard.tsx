import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { FarmLayout } from "@/components/farm-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useGetFarm } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, AlertTriangle, CheckCircle2, XCircle, Info,
  ScanLine, Database, Activity, RefreshCw, MessageSquare,
  MapPin, Ruler, Leaf, History,
} from "lucide-react";

type Status = "optimal" | "warning" | "critical" | "missing";

const STATUS_COLORS: Record<Status, string> = {
  optimal:  "text-green-700 bg-green-100 border-green-300",
  warning:  "text-amber-700 bg-amber-100 border-amber-300",
  critical: "text-red-700 bg-red-100 border-red-300",
  missing:  "text-muted-foreground bg-muted border-border",
};
const STATUS_ICONS: Record<Status, React.FC<{className?:string}>> = {
  optimal: CheckCircle2, warning: AlertTriangle, critical: XCircle, missing: Info,
};
function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${STATUS_COLORS[status]}`}>
      <Icon className="w-3 h-3" />{label ?? status}
    </span>
  );
}

type FarmScan = {
  id: number; cropType: string | null; growthStage: string | null; healthStatus: string | null;
  yieldPredictionKg: number | null; harvestDaysRemaining: number | null; harvestWindow: string | null;
  analysisNotes: string | null; createdAt: string;
};

type SensorBatch = {
  batchId: string; source: string; fileName?: string; rowCount: number; createdAt: string;
  summary: { avgPh: number|null; avgMoisture: number|null; avgTemperature: number|null; avgHumidity: number|null; recordCount: number };
  aiAnalysis: {
    overallAssessment?: string; trendInsights?: string; cropRecommendations?: string[];
    immediateActions?: string[]; seasonalOutlook?: string; soilAdvisory?: string; irrigationAdvice?: string;
  };
};

function healthColor(s: string | null) {
  if (!s) return "text-muted-foreground";
  if (s === "Excellent" || s === "Good") return "text-green-600";
  if (s === "Fair") return "text-amber-600";
  return "text-red-600";
}

function classify(key: "ph"|"moisture"|"temperature"|"humidity", val: number | null): Status {
  if (val == null) return "missing";
  const ranges = {
    ph:          { opt: [6.0, 7.5], warn: [5.5, 8.0] },
    moisture:    { opt: [40, 70],   warn: [25, 85] },
    temperature: { opt: [18, 30],   warn: [10, 38] },
    humidity:    { opt: [50, 80],   warn: [30, 90] },
  };
  const r = ranges[key];
  if (val >= r.opt[0] && val <= r.opt[1]) return "optimal";
  if (val >= r.warn[0] && val <= r.warn[1]) return "warning";
  return "critical";
}

export default function FarmDashboard() {
  const [, params] = useRoute("/farms/:id/dashboard");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: farm, isLoading: farmLoading } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });

  const { data: sensorsData, isLoading: sensorLoading, refetch: refetchSensors, isFetching: sensorFetching } = useQuery({
    queryKey: ["farm-sensors", farmId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/farms/${farmId}/sensors`);
      return r.json() as Promise<{ hasSensorData: boolean; latestBatch: SensorBatch | null; batches: SensorBatch[] }>;
    },
    enabled: farmId > 0,
    staleTime: 2 * 60 * 1000,
  });

  const { data: scans = [] } = useQuery({
    queryKey: ["farm-scans", farmId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/farms/${farmId}/scans`);
      return r.json() as Promise<FarmScan[]>;
    },
    enabled: farmId > 0,
    staleTime: 2 * 60 * 1000,
  });

  const hasSensorData  = sensorsData?.hasSensorData ?? false;
  const latestBatch    = sensorsData?.latestBatch ?? null;
  const latestScan     = scans[0] ?? null;
  const cropList       = (farm?.crops as string[]) ?? [];

  if (farmLoading) return (
    <FarmLayout farmId={farmId} farmName="Loading...">
      <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
    </FarmLayout>
  );

  return (
    <FarmLayout farmId={farmId} farmName={farm?.name}>
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* Farm Info Banner */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-4 flex-wrap justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 shrink-0" />{farm?.location}
                </div>
                {farm?.acreage && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Ruler className="w-4 h-4 shrink-0" />{parseFloat(farm.acreage).toFixed(1)} acres
                  </div>
                )}
                {cropList.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Leaf className="w-4 h-4 text-primary shrink-0" />
                    {cropList.map((c) => <Badge key={c} variant="outline" className="text-xs bg-primary/5 border-primary/20 text-primary">{c}</Badge>)}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => refetchSensors()} disabled={sensorFetching} className="gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${sensorFetching ? "animate-spin" : ""}`} />Refresh
                </Button>
                <Button size="sm" onClick={() => navigate(`/farms/${farmId}/scan`)} className="gap-1.5">
                  <ScanLine className="w-3.5 h-3.5" />New Scan
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* No data prompt */}
        {!hasSensorData && !sensorLoading && (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="w-10 h-10 text-muted-foreground opacity-30 mb-3" />
              <h3 className="font-semibold mb-1">No sensor data yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                Run a New Scan to upload soil & climate readings. The dashboard will show real data from your field.
              </p>
              <Button onClick={() => navigate(`/farms/${farmId}/scan`)} className="gap-2">
                <ScanLine className="w-4 h-4" />Start First Scan
              </Button>
            </CardContent>
          </Card>
        )}

        {sensorLoading && (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        )}

        {/* Latest sensor data */}
        {hasSensorData && latestBatch && (
          <>
            {/* Metric summary */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm">Latest Soil & Climate Reading</h2>
                <span className="text-xs text-muted-foreground">
                  {new Date(latestBatch.createdAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })} · {latestBatch.rowCount} readings
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { key: "ph",          label: "Avg pH",        unit: "",   val: latestBatch.summary.avgPh },
                  { key: "moisture",    label: "Avg Moisture",  unit: "%",  val: latestBatch.summary.avgMoisture },
                  { key: "temperature", label: "Avg Temp",      unit: "°C", val: latestBatch.summary.avgTemperature },
                  { key: "humidity",    label: "Avg Humidity",  unit: "%",  val: latestBatch.summary.avgHumidity },
                ] as const).map((m) => {
                  const st = classify(m.key, m.val);
                  return (
                    <Card key={m.key} className={`border ${st === "optimal" ? "border-green-200" : st === "warning" ? "border-amber-200" : st === "critical" ? "border-red-200" : ""}`}>
                      <CardContent className="pt-3 pb-3">
                        <p className="text-xs text-muted-foreground mb-0.5">{m.label}</p>
                        <p className="text-2xl font-bold">{m.val != null ? `${m.val}${m.unit}` : "—"}</p>
                        <div className="mt-1"><StatusBadge status={st} /></div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* AI Analysis from last batch */}
            {latestBatch.aiAnalysis?.overallAssessment && (
              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-600" />AI Soil & Climate Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="font-medium">{latestBatch.aiAnalysis.overallAssessment}</p>
                  {latestBatch.aiAnalysis.trendInsights && <p className="text-muted-foreground">{latestBatch.aiAnalysis.trendInsights}</p>}
                  {latestBatch.aiAnalysis.soilAdvisory && <p className="text-muted-foreground">{latestBatch.aiAnalysis.soilAdvisory}</p>}
                  {latestBatch.aiAnalysis.irrigationAdvice && <p className="text-muted-foreground">{latestBatch.aiAnalysis.irrigationAdvice}</p>}
                </CardContent>
              </Card>
            )}

            {/* Immediate actions */}
            {(latestBatch.aiAnalysis?.immediateActions ?? []).filter(Boolean).length > 0 && (
              <Card className="border-red-200 bg-red-50/30">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Immediate Actions</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {latestBatch.aiAnalysis.immediateActions!.filter(Boolean).map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-red-800">
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />{a}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {(latestBatch.aiAnalysis?.cropRecommendations ?? []).length > 0 && (
              <Card className="border-green-200 bg-green-50/30">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-green-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Crop Recommendations</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {latestBatch.aiAnalysis.cropRecommendations!.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-green-200 text-green-800 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">{i+1}</div>
                      <p className="text-sm text-green-900 leading-relaxed">{rec}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Seasonal outlook */}
            {latestBatch.aiAnalysis?.seasonalOutlook && (
              <Card className="border-amber-200 bg-amber-50/30">
                <CardContent className="pt-3 pb-3 flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">{latestBatch.aiAnalysis.seasonalOutlook}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Latest scan summary */}
        {latestScan && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2"><History className="w-4 h-4 text-primary" />Latest Scan</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => navigate(`/farms/${farmId}/history`)}>
                  View All <Activity className="w-3 h-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold">{latestScan.cropType ?? "Unknown Crop"}</p>
                    {latestScan.growthStage && <Badge variant="outline" className="text-xs">{latestScan.growthStage}</Badge>}
                    {latestScan.healthStatus && (
                      <span className={`text-xs font-semibold ${healthColor(latestScan.healthStatus)}`}>{latestScan.healthStatus}</span>
                    )}
                  </div>
                  {latestScan.analysisNotes && <p className="text-sm text-muted-foreground line-clamp-2">{latestScan.analysisNotes}</p>}
                  <p className="text-xs text-muted-foreground mt-1.5">{new Date(latestScan.createdAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}</p>
                </div>
                {latestScan.harvestDaysRemaining && (
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Harvest in</p>
                    <p className="text-xl font-bold">{latestScan.harvestDaysRemaining}</p>
                    <p className="text-xs text-muted-foreground">days</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { icon: ScanLine,     label: "New Scan",     sub: "Upload soil & climate data",  href: `/farms/${farmId}/scan`,    color: "text-primary" },
            { icon: MessageSquare,label: "AI Assistant",  sub: "Farm-specific conversations", href: `/farms/${farmId}/chat`,    color: "text-blue-600" },
            { icon: History,      label: "History",      sub: "View all scan records",       href: `/farms/${farmId}/history`, color: "text-amber-600" },
          ].map((item) => (
            <Card key={item.href} className="hover:border-primary/40 cursor-pointer transition-colors" onClick={() => navigate(item.href)}>
              <CardContent className="pt-4 pb-4">
                <item.icon className={`w-5 h-5 mb-2 ${item.color}`} />
                <p className="font-semibold text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Batch history strip */}
        {hasSensorData && sensorsData && sensorsData.batches.length > 1 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Uploads ({sensorsData.batches.length} total)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {sensorsData.batches.slice(0, 5).map((b, i) => (
                <div key={b.batchId} className={`flex items-center gap-3 text-xs ${i === 0 ? "font-semibold" : "text-muted-foreground"}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${i === 0 ? "bg-primary" : "bg-muted-foreground/40"}`} />
                  <span className="flex-1 truncate">{b.fileName ?? (b.source === "manual" ? "Manual Entry" : "Uploaded File")}</span>
                  <span>{b.rowCount} rows</span>
                  <span>{new Date(b.createdAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short" })}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </FarmLayout>
  );
}
