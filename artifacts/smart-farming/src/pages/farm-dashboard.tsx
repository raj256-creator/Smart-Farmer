import { useState, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetFarmDashboard, useGetFarm } from "@workspace/api-client-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft, Loader2, AlertTriangle, CloudRain, Thermometer,
  Droplets, Leaf, BarChart2, Zap, MessageSquare, RefreshCw,
  Upload, FileSpreadsheet, Plus, Trash2, CheckCircle2, XCircle,
  Info, Activity, Database, Download,
} from "lucide-react";

// ── Column auto-detection ─────────────────────────────────────────────────────
const COL_ALIASES: Record<string, string[]> = {
  ph:          ["ph", "phlevel", "ph_level", "ph level", "soil ph", "soil_ph", "ph value"],
  moisture:    ["moisture", "soil moisture", "soil_moisture", "moisture%", "sm", "vwc"],
  temperature: ["temperature", "temp", "temp_c", "temperature_c", "air temp", "air_temp", "temp (c)"],
  humidity:    ["humidity", "rh", "relative humidity", "rel_humidity", "humidity%", "air humidity"],
  label:       ["label", "name", "id", "reading", "sample", "location", "site", "date", "time", "timestamp"],
};

function detectColumn(headers: string[], field: string): string | null {
  for (const h of headers) {
    const norm = h.toLowerCase().trim().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    if ((COL_ALIASES[field] ?? []).some((a) => norm === a || norm.includes(a))) return h;
  }
  return null;
}

type Status = "optimal" | "warning" | "critical" | "missing";

const STATUS_COLORS: Record<Status, string> = {
  optimal:  "text-green-700 bg-green-100 border-green-300",
  warning:  "text-amber-700 bg-amber-100 border-amber-300",
  critical: "text-red-700 bg-red-100 border-red-300",
  missing:  "text-muted-foreground bg-muted border-border",
};

const STATUS_ICONS: Record<Status, React.FC<{ className?: string }>> = {
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

function severityColor(s: string) {
  if (s === "high")   return "bg-red-100 text-red-700 border-red-200";
  if (s === "medium") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}
function healthColor(h: string) {
  if (h === "Good") return "text-green-600";
  if (h === "Fair") return "text-amber-600";
  return "text-red-600";
}

const emptyRow = () => ({ label: "", ph: "", moisture: "", temperature: "", humidity: "" });

type SensorRecord = { label: string; ph: string; moisture: string; temperature: string; humidity: string };

interface SensorBatch {
  batchId: string; source: string; fileName?: string;
  rowCount: number; createdAt: string;
  summary?: Record<string, number | null>;
  aiAnalysis?: Record<string, unknown>;
}

interface SensorResult {
  summary: { recordCount: number; avgPh: number|null; avgMoisture: number|null; avgTemperature: number|null; avgHumidity: number|null };
  avgStatuses: { ph: Status; moisture: Status; temperature: Status; humidity: Status };
  overallHealthScore: number;
  perRecordAnalysis: Array<{
    label: string;
    statuses: Record<string, Status>;
    alerts: string[];
    values: Record<string, number|null>;
  }>;
  aiAnalysis: {
    trendInsights?: string; overallAssessment?: string;
    cropRecommendations?: string[]; immediateActions?: string[];
    seasonalOutlook?: string; soilAdvisory?: string; irrigationAdvice?: string;
  };
  batch: SensorBatch;
}

function downloadSampleCSV() {
  const rows = [
    ["Label","pH Level","Moisture (%)","Temperature (°C)","Humidity (%)"],
    ["Zone 1","6.5","55","24","65"],
    ["Zone 2","7.1","48","26","62"],
    ["Zone 3","5.8","72","22","74"],
  ];
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "farm_sensor_sample.csv"; a.click();
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function FarmDashboard() {
  const [, params] = useRoute("/farms/:id");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  const { data, isLoading, isError, refetch, isFetching } = useGetFarmDashboard(farmId, {
    query: { enabled: farmId > 0, staleTime: 5 * 60 * 1000 },
  });
  const { data: farm } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });

  // ── Sensor tab state ────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [sensorInputMode, setSensorInputMode] = useState<"upload" | "manual">("upload");
  const [sensorLoading,   setSensorLoading]   = useState(false);
  const [sensorResult,    setSensorResult]     = useState<SensorResult | null>(null);
  const [sensorError,     setSensorError]      = useState<string | null>(null);
  const [savedBatches,    setSavedBatches]     = useState<SensorBatch[] | null>(null);
  const [loadingBatches,  setLoadingBatches]   = useState(false);
  const [dragOver,        setDragOver]         = useState(false);
  const [fileName,        setFileName]         = useState("");

  // file-path state
  const [rawHeaders,   setRawHeaders]   = useState<string[]>([]);
  const [rawRows,      setRawRows]      = useState<Record<string, string>[]>([]);
  const [colMap,       setColMap]       = useState<Record<string, string>>({});
  const [previewRows,  setPreviewRows]  = useState<SensorRecord[]>([]);
  const [mappingDone,  setMappingDone]  = useState(false);

  // manual state
  const [manualRows, setManualRows] = useState<SensorRecord[]>([emptyRow()]);

  // ── File parsing ────────────────────────────────────────────────────────────
  const parseFile = useCallback((file: File) => {
    setSensorError(null); setSensorResult(null); setMappingDone(false);
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    const handleRows = (rows: Record<string, string>[]) => {
      if (!rows.length) { setSensorError("File appears empty."); return; }
      const headers = Object.keys(rows[0]);
      setRawHeaders(headers); setRawRows(rows);
      const detected: Record<string, string> = {};
      for (const f of ["label", "ph", "moisture", "temperature", "humidity"]) {
        const m = detectColumn(headers, f);
        if (m) detected[f] = m;
      }
      setColMap(detected);
    };

    if (ext === "csv" || ext === "txt") {
      Papa.parse<Record<string, string>>(file, {
        header: true, skipEmptyLines: true,
        complete: (r) => handleRows(r.data),
        error: () => setSensorError("Failed to parse CSV."),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          handleRows(data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))));
        } catch { setSensorError("Failed to parse Excel file."); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setSensorError("Unsupported file type. Use .csv, .xlsx or .xls");
    }
  }, []);

  const applyMapping = () => {
    const mapped = rawRows.map((row, i) => ({
      label:       colMap.label       ? (row[colMap.label] ?? `Reading ${i+1}`) : `Reading ${i+1}`,
      ph:          colMap.ph          ? (row[colMap.ph] ?? "")          : "",
      moisture:    colMap.moisture    ? (row[colMap.moisture] ?? "")    : "",
      temperature: colMap.temperature ? (row[colMap.temperature] ?? "") : "",
      humidity:    colMap.humidity    ? (row[colMap.humidity] ?? "")    : "",
    }));
    setPreviewRows(mapped); setMappingDone(true);
  };

  // ── Submit sensor data ──────────────────────────────────────────────────────
  const submitSensors = async (rows: SensorRecord[], src: string, file?: string) => {
    setSensorLoading(true); setSensorError(null); setSensorResult(null);
    try {
      const payload = rows
        .filter((r) => r.ph || r.moisture || r.temperature || r.humidity)
        .map((r) => ({
          label:       r.label || undefined,
          ph:          r.ph          ? parseFloat(r.ph)          : null,
          moisture:    r.moisture    ? parseFloat(r.moisture)    : null,
          temperature: r.temperature ? parseFloat(r.temperature) : null,
          humidity:    r.humidity    ? parseFloat(r.humidity)    : null,
        }));
      if (!payload.length) { setSensorError("No valid data rows to save."); setSensorLoading(false); return; }

      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/farms/${farmId}/sensors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: payload, source: src, fileName: file }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const result = await resp.json() as SensorResult;
      setSensorResult(result);
      setSavedBatches(null); // reset so it re-fetches
    } catch (e) {
      setSensorError(e instanceof Error ? e.message : "Failed to save sensor data.");
    } finally {
      setSensorLoading(false);
    }
  };

  // ── Load past batches ───────────────────────────────────────────────────────
  const loadPastBatches = async () => {
    setLoadingBatches(true);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/farms/${farmId}/sensors`);
      const data = await resp.json() as { batches: SensorBatch[]; hasSensorData: boolean };
      setSavedBatches(data.batches ?? []);
    } finally {
      setLoadingBatches(false);
    }
  };

  // ── Delete a batch ──────────────────────────────────────────────────────────
  const deleteBatch = async (batchId: string) => {
    const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
    await fetch(`${BASE}/api/farms/${farmId}/sensors/${batchId}`, { method: "DELETE" });
    setSavedBatches((prev) => prev?.filter((b) => b.batchId !== batchId) ?? null);
  };

  const updateRow = (i: number, f: keyof SensorRecord, v: string) =>
    setManualRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [f]: v } : r));

  if (farmId <= 0) { navigate("/"); return null; }

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <Layout>
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate("/")} className="gap-2 shrink-0">
            <ArrowLeft className="w-4 h-4" />All Farms
          </Button>
          {(data || farm) && (
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{(data?.farm ?? farm)?.name}</h1>
              <p className="text-sm text-muted-foreground">{(data?.farm ?? farm)?.location}</p>
            </div>
          )}
          <div className="flex gap-2 ml-auto shrink-0 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => navigate(`/farms/${farmId}/analytics`)} className="gap-1.5">
              <BarChart2 className="w-4 h-4" />Analytics
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/farms/${farmId}/yield`)} className="gap-1.5">
              <Zap className="w-4 h-4" />Yield
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} title="Refresh AI insights">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Main tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="gap-1.5"><Leaf className="w-3.5 h-3.5" />AI Overview</TabsTrigger>
            <TabsTrigger value="sensors"  className="gap-1.5"><Database className="w-3.5 h-3.5" />Sensor Data</TabsTrigger>
          </TabsList>

          {/* ── AI OVERVIEW TAB ──────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6 mt-4">
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm">Generating AI farm insights...</p>
              </div>
            )}
            {isError && !isLoading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-destructive">
                <AlertTriangle className="w-8 h-8" />
                <p>Failed to load farm dashboard.</p>
                <Button onClick={() => refetch()} variant="outline">Try Again</Button>
              </div>
            )}

            {data && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-800">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  These insights are AI-estimated based on your farm's location and crops. For readings from your actual field, use the <strong className="mx-0.5">Sensor Data</strong> tab.
                </div>

                {/* Top stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">AI Health Score</p>
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

                {/* Crop health + Alerts */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Leaf className="w-4 h-4 text-primary" />Crop Health Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(data.cropHealthMap as Array<{ crop: string; health: string; score: number }>).map((item) => (
                        <div key={item.crop} className="flex items-center gap-3">
                          <span className="text-sm font-medium w-28 shrink-0">{item.crop}</span>
                          <Progress value={item.score} className="flex-1 h-2" />
                          <span className={`text-xs font-semibold w-10 shrink-0 ${healthColor(item.health)}`}>{item.health}</span>
                          <span className="text-xs text-muted-foreground w-8 text-right">{item.score}%</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />Recent Alerts
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(data.recentAlerts as Array<{ type: string; message: string; severity: string }>).map((alert, i) => (
                        <div key={i} className={`rounded-lg border px-3 py-2.5 ${severityColor(alert.severity)}`}>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold uppercase">{alert.type}</span>
                            <Badge variant="outline" className={`text-xs capitalize ${severityColor(alert.severity)}`}>{alert.severity}</Badge>
                          </div>
                          <p className="text-xs leading-relaxed">{alert.message}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                {/* Weather + Soil */}
                <div className="grid md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <CloudRain className="w-4 h-4 text-sky-500" />Weather Insights
                        <Badge variant="outline" className="ml-auto text-xs text-amber-700 border-amber-300">AI Estimate</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {[
                          { icon: Thermometer, color: "text-orange-500", label: "Temp",     val: (data.weatherInsights as { temperature: string }).temperature },
                          { icon: Droplets,    color: "text-blue-500",   label: "Humidity", val: (data.weatherInsights as { humidity: string }).humidity },
                          { icon: CloudRain,   color: "text-sky-400",    label: "Rainfall", val: (data.weatherInsights as { rainfall: string }).rainfall },
                        ].map((w) => (
                          <div key={w.label} className="text-center p-3 rounded-lg bg-muted/50">
                            <w.icon className={`w-4 h-4 ${w.color} mx-auto mb-1`} />
                            <p className="text-xs text-muted-foreground">{w.label}</p>
                            <p className="text-sm font-semibold">{w.val}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground bg-sky-50 rounded-lg p-3 border border-sky-100">
                        {(data.weatherInsights as { advisory: string }).advisory}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <span className="w-4 h-4 text-amber-700 font-bold text-sm">N</span>Soil Health
                        <Badge variant="outline" className="ml-auto text-xs text-amber-700 border-amber-300">AI Estimate</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-2 mb-4">
                        {[
                          { label: "pH",         value: (data.soilInsights as { ph: string }).ph },
                          { label: "Nitrogen",   value: (data.soilInsights as { nitrogen: string }).nitrogen },
                          { label: "Phosphorus", value: (data.soilInsights as { phosphorus: string }).phosphorus },
                          { label: "Potassium",  value: (data.soilInsights as { potassium: string }).potassium },
                        ].map((s) => (
                          <div key={s.label} className="text-center p-2.5 rounded-lg bg-amber-50">
                            <p className="text-xs text-muted-foreground mb-0.5">{s.label}</p>
                            <p className="text-sm font-semibold">{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground bg-amber-50 rounded-lg p-3 border border-amber-100">
                        {(data.soilInsights as { advisory: string }).advisory}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Performance trend */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Historical Performance (Last 6 Months) — AI Estimate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={data.performanceTrend as Array<{ month: string; yield: number; health: number }>}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="yield" orientation="left"  tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="health" orientation="right" tick={{ fontSize: 12 }} domain={[0, 100]} />
                        <Tooltip />
                        <Line yAxisId="yield"  type="monotone" dataKey="yield"  stroke="#22c55e" strokeWidth={2} name="Yield (kg)" dot={false} />
                        <Line yAxisId="health" type="monotone" dataKey="health" stroke="#3b82f6" strokeWidth={2} name="Health (%)" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* AI Insights */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageSquare className="w-4 h-4 text-primary" />AI Farm Intelligence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{data.aiInsights}</p>
                    <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => navigate("/chat")}>
                      <MessageSquare className="w-3.5 h-3.5" />Ask AI About This Farm
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── SENSOR DATA TAB ─────────────────────────────────────────────── */}
          <TabsContent value="sensors" className="mt-4">
            <div className="grid lg:grid-cols-5 gap-6">

              {/* Left: input panel */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-sm">Upload Your Sensor Readings</h2>
                  <Button variant="outline" size="sm" onClick={downloadSampleCSV} className="gap-1.5 h-7 text-xs">
                    <Download className="w-3 h-3" />Sample CSV
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your actual pH, moisture, temperature and humidity readings. These will be saved to this farm and analysed by AI.
                </p>

                {/* Mode toggle */}
                <Tabs value={sensorInputMode} onValueChange={(v) => { setSensorInputMode(v as "upload"|"manual"); setSensorResult(null); setSensorError(null); }}>
                  <TabsList className="w-full">
                    <TabsTrigger value="upload" className="flex-1 gap-1"><Upload className="w-3 h-3" />File Upload</TabsTrigger>
                    <TabsTrigger value="manual" className="flex-1 gap-1"><Plus className="w-3 h-3" />Manual Entry</TabsTrigger>
                  </TabsList>

                  {/* File upload */}
                  <TabsContent value="upload" className="space-y-3 mt-3">
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
                      onClick={() => fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                    >
                      <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm font-medium">{fileName ? `Loaded: ${fileName}` : "Drop CSV / Excel or click to browse"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">.csv · .xlsx · .xls</p>
                      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
                    </div>

                    {/* Column mapping */}
                    {rawHeaders.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1">
                          <CardTitle className="text-xs flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-primary" />
                            Column Mapping <span className="text-muted-foreground font-normal">({rawRows.length} rows)</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 pt-1">
                          {(["label","ph","moisture","temperature","humidity"] as const).map((field) => (
                            <div key={field} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-20 shrink-0 capitalize">
                                {field === "ph" ? "pH Level" : field === "label" ? "Row Label" : field}
                              </span>
                              <Select
                                value={colMap[field] ?? "__none__"}
                                onValueChange={(v) => { setColMap((m) => ({ ...m, [field]: v === "__none__" ? "" : v })); setMappingDone(false); }}
                              >
                                <SelectTrigger className="h-7 text-xs flex-1">
                                  <SelectValue placeholder="— not mapped —" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— not mapped —</SelectItem>
                                  {rawHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {colMap[field] ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <div className="w-3.5 h-3.5 shrink-0" />}
                            </div>
                          ))}
                          <Button size="sm" className="w-full gap-1.5 mt-1" onClick={applyMapping}
                            disabled={!colMap.ph && !colMap.moisture && !colMap.temperature && !colMap.humidity}>
                            <RefreshCw className="w-3 h-3" />Apply & Preview
                          </Button>
                        </CardContent>
                      </Card>
                    )}

                    {/* Preview */}
                    {mappingDone && previewRows.length > 0 && (
                      <Card>
                        <CardHeader className="pb-1">
                          <CardTitle className="text-xs">Preview ({previewRows.length} rows)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto max-h-36">
                            <table className="w-full text-xs">
                              <thead><tr className="border-b">
                                <th className="text-left py-1 pr-2 text-muted-foreground">Label</th>
                                <th className="text-right py-1 px-1 text-muted-foreground">pH</th>
                                <th className="text-right py-1 px-1 text-muted-foreground">Moist%</th>
                                <th className="text-right py-1 px-1 text-muted-foreground">Temp</th>
                                <th className="text-right py-1 pl-1 text-muted-foreground">Humid%</th>
                              </tr></thead>
                              <tbody>
                                {previewRows.slice(0, 8).map((r, i) => (
                                  <tr key={i} className="border-b border-border/30">
                                    <td className="py-1 pr-2 truncate max-w-[70px] text-muted-foreground">{r.label || `Row ${i+1}`}</td>
                                    <td className="py-1 px-1 text-right">{r.ph||"—"}</td>
                                    <td className="py-1 px-1 text-right">{r.moisture||"—"}</td>
                                    <td className="py-1 px-1 text-right">{r.temperature||"—"}</td>
                                    <td className="py-1 pl-1 text-right">{r.humidity||"—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <Button className="w-full mt-2 gap-1.5" size="sm" onClick={() => submitSensors(previewRows, "file", fileName)} disabled={sensorLoading}>
                            {sensorLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving & Analysing...</> : <><Database className="w-3.5 h-3.5" />Save & Analyse</>}
                          </Button>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  {/* Manual entry */}
                  <TabsContent value="manual" className="mt-3">
                    <Card>
                      <CardHeader className="pb-1">
                        <CardTitle className="text-xs flex items-center justify-between">
                          Manual Readings
                          <Button size="sm" variant="outline" onClick={() => setManualRows((r) => [...r, emptyRow()])} className="h-6 text-xs gap-0.5 px-2">
                            <Plus className="w-3 h-3" />Add Row
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-[1fr_52px_56px_52px_56px_24px] gap-1 text-[10px] font-medium text-muted-foreground px-0.5">
                          <span>Label</span><span className="text-center">pH</span><span className="text-center">Moist%</span><span className="text-center">Temp°C</span><span className="text-center">Humid%</span><span />
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {manualRows.map((row, i) => (
                            <div key={i} className="grid grid-cols-[1fr_52px_56px_52px_56px_24px] gap-1">
                              <Input value={row.label} onChange={(e) => updateRow(i,"label",e.target.value)} placeholder={`Zone ${i+1}`} className="h-7 text-xs" />
                              <Input type="number" step="0.1" min="0" max="14"  value={row.ph}          onChange={(e) => updateRow(i,"ph",e.target.value)}          placeholder="6.5" className="h-7 text-xs px-1.5" />
                              <Input type="number" step="1"   min="0" max="100" value={row.moisture}    onChange={(e) => updateRow(i,"moisture",e.target.value)}    placeholder="55"  className="h-7 text-xs px-1.5" />
                              <Input type="number" step="0.5" min="-20" max="60" value={row.temperature} onChange={(e) => updateRow(i,"temperature",e.target.value)} placeholder="24"  className="h-7 text-xs px-1.5" />
                              <Input type="number" step="1"   min="0" max="100" value={row.humidity}    onChange={(e) => updateRow(i,"humidity",e.target.value)}    placeholder="65"  className="h-7 text-xs px-1.5" />
                              <Button variant="ghost" size="icon" className="h-7 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => manualRows.length > 1 && setManualRows((r) => r.filter((_,idx) => idx !== i))}
                                disabled={manualRows.length === 1}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">Optimal: pH 6–7.5 · Moisture 40–70% · Temp 18–30°C · Humidity 50–80%</p>
                        <Button className="w-full gap-1.5" size="sm" onClick={() => submitSensors(manualRows, "manual")} disabled={sensorLoading || manualRows.every((r) => !r.ph && !r.moisture && !r.temperature && !r.humidity)}>
                          {sensorLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving & Analysing...</> : <><Database className="w-3.5 h-3.5" />Save & Analyse</>}
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>

                {sensorError && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{sensorError}
                  </div>
                )}

                {/* Past batches */}
                <div>
                  <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={loadPastBatches} disabled={loadingBatches}>
                    {loadingBatches ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                    View Past Uploads
                  </Button>
                  {savedBatches && (
                    <div className="mt-2 space-y-1.5">
                      {savedBatches.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No past uploads found.</p>}
                      {savedBatches.map((b) => (
                        <div key={b.batchId} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-xs">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{b.fileName ?? (b.source === "manual" ? "Manual Entry" : "Uploaded File")}</p>
                            <p className="text-muted-foreground">{b.rowCount} rows · {new Date(b.createdAt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">{b.source}</Badge>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteBatch(b.batchId)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: analysis results */}
              <div className="lg:col-span-3 space-y-4">
                {!sensorResult && !sensorLoading && (
                  <div className="flex flex-col items-center justify-center min-h-80 text-center text-muted-foreground border-2 border-dashed rounded-xl p-10">
                    <Database className="w-10 h-10 mb-3 opacity-30" />
                    <p className="font-medium">No sensor data yet for this farm</p>
                    <p className="text-sm mt-1 max-w-xs">Upload a CSV/Excel file or enter readings manually — they'll be saved to this farm and analysed by AI.</p>
                  </div>
                )}
                {sensorLoading && (
                  <div className="flex flex-col items-center justify-center min-h-80 text-muted-foreground">
                    <Loader2 className="w-10 h-10 animate-spin mb-3 text-primary" />
                    <p className="font-medium">Saving readings and running AI analysis...</p>
                  </div>
                )}

                {sensorResult && (() => {
                  const r = sensorResult;
                  const scoreColor = r.overallHealthScore >= 75 ? "text-green-600" : r.overallHealthScore >= 50 ? "text-amber-600" : "text-red-600";
                  const scoreBg    = r.overallHealthScore >= 75 ? "bg-green-50 border-green-200" : r.overallHealthScore >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
                  return (
                    <>
                      {/* Header score */}
                      <Card className={`border ${scoreBg}`}>
                        <CardContent className="pt-4 pb-4">
                          <div className="flex items-center gap-4">
                            <div className="text-center shrink-0">
                              <p className={`text-4xl font-bold ${scoreColor}`}>{r.overallHealthScore}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Health Score</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm">{r.aiAnalysis.overallAssessment}</p>
                              <p className="text-xs text-muted-foreground mt-1">{r.aiAnalysis.seasonalOutlook}</p>
                              <div className="flex gap-1.5 mt-2 flex-wrap">
                                {(Object.entries(r.avgStatuses) as [string, Status][]).map(([k, s]) => (
                                  <StatusBadge key={k} status={s} label={k === "ph" ? `pH: ${s}` : `${k}: ${s}`} />
                                ))}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground shrink-0 text-right">
                              <p>{r.summary.recordCount} readings</p>
                              <p className="font-medium capitalize">{r.batch.source === "file" ? r.batch.fileName ?? "File" : "Manual"}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Real metric cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {([
                          { key: "ph",          label: "pH Level",      icon: "⚗", unit: "",   avg: r.summary.avgPh,          status: r.avgStatuses.ph },
                          { key: "moisture",    label: "Moisture",      icon: "💧", unit: "%",  avg: r.summary.avgMoisture,    status: r.avgStatuses.moisture },
                          { key: "temperature", label: "Temperature",   icon: "🌡", unit: "°C", avg: r.summary.avgTemperature, status: r.avgStatuses.temperature },
                          { key: "humidity",    label: "Humidity",      icon: "🌫", unit: "%",  avg: r.summary.avgHumidity,    status: r.avgStatuses.humidity },
                        ] as const).map((m) => (
                          <Card key={m.key} className={`border ${m.status === "optimal" ? "border-green-200" : m.status === "warning" ? "border-amber-200" : m.status === "critical" ? "border-red-200" : ""}`}>
                            <CardContent className="pt-3 pb-3">
                              <p className="text-lg mb-1">{m.icon}</p>
                              <p className="text-xs text-muted-foreground">{m.label}</p>
                              <p className="text-2xl font-bold">{m.avg != null ? m.avg : "—"}{m.avg != null ? m.unit : ""}</p>
                              <div className="mt-1"><StatusBadge status={m.status} /></div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* AI insights */}
                      <Card className="border-blue-200 bg-blue-50/30">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Activity className="w-4 h-4 text-blue-600" />AI Analysis of Your Sensor Data
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                          <p>{r.aiAnalysis.trendInsights}</p>
                          {r.aiAnalysis.soilAdvisory && <p className="text-muted-foreground">{r.aiAnalysis.soilAdvisory}</p>}
                          {r.aiAnalysis.irrigationAdvice && <p className="text-muted-foreground">{r.aiAnalysis.irrigationAdvice}</p>}
                        </CardContent>
                      </Card>

                      {/* Immediate actions */}
                      {(r.aiAnalysis.immediateActions ?? []).filter(Boolean).length > 0 && (
                        <Card className="border-red-200 bg-red-50/30">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />Immediate Actions Required
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {r.aiAnalysis.immediateActions!.filter(Boolean).map((a, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-red-800">
                                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />{a}
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      {/* Recommendations */}
                      <Card className="border-green-200 bg-green-50/30">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm text-green-800 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />Crop Recommendations
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {(r.aiAnalysis.cropRecommendations ?? []).map((rec, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                              <div className="w-5 h-5 rounded-full bg-green-200 text-green-800 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">{i+1}</div>
                              <p className="text-sm text-green-900 leading-relaxed">{rec}</p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      {/* Per-reading breakdown */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Per-Reading Breakdown ({r.perRecordAnalysis.length} readings)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-0.5">
                            {r.perRecordAnalysis.map((rec, i) => (
                              <div key={i} className="border border-border rounded-lg p-3">
                                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                                  <p className="font-medium text-sm">{rec.label}</p>
                                  <div className="flex gap-1 flex-wrap">
                                    {(Object.entries(rec.statuses) as [string,Status][]).map(([k,s]) => (
                                      <StatusBadge key={k} status={s} label={k === "ph" ? "pH" : k} />
                                    ))}
                                  </div>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                                  {(["ph","moisture","temperature","humidity"] as const).map((k) => (
                                    <div key={k} className="text-center">
                                      <p className="text-muted-foreground">{k === "ph" ? "pH" : k === "moisture" ? "Moist%" : k === "temperature" ? "Temp°C" : "Humid%"}</p>
                                      <p className="font-semibold">{rec.values[k] != null ? rec.values[k] : "—"}</p>
                                    </div>
                                  ))}
                                </div>
                                {rec.alerts.length > 0 ? (
                                  <div className="space-y-1">
                                    {rec.alerts.map((a, j) => (
                                      <div key={j} className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 rounded px-2 py-1">
                                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{a}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                                    <CheckCircle2 className="w-3 h-3" />All metrics within acceptable range
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  );
                })()}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
