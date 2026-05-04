import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import {
  Upload, FileSpreadsheet, Plus, Trash2, Loader2,
  FlaskConical, AlertTriangle, CheckCircle2, XCircle,
  Info, Download, RefreshCw, Thermometer, Droplets,
  Wind, Activity,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DataRecord {
  label: string;
  ph: string;
  moisture: string;
  temperature: string;
  humidity: string;
}

interface RecordAnalysis {
  label: string;
  statuses: { ph: Status; moisture: Status; temperature: Status; humidity: Status };
  alerts: string[];
  values: { ph?: number | null; moisture?: number | null; temperature?: number | null; humidity?: number | null };
}

type Status = "optimal" | "warning" | "critical" | "missing";

interface AnalysisResult {
  summary: { recordCount: number; avgPh: number | null; avgMoisture: number | null; avgTemperature: number | null; avgHumidity: number | null };
  avgStatuses: { ph: Status; moisture: Status; temperature: Status; humidity: Status };
  overallHealthScore: number;
  perRecordAnalysis: RecordAnalysis[];
  trendInsights: string;
  overallAssessment: string;
  cropRecommendations: string[];
  immediateActions: string[];
  seasonalOutlook: string;
}

// ── Column aliases for auto-detection ────────────────────────────────────────
const COL_ALIASES: Record<string, string[]> = {
  ph:          ["ph", "phlevel", "ph_level", "ph level", "soil ph", "soil_ph", "ph value"],
  moisture:    ["moisture", "soil moisture", "soil_moisture", "moisture%", "moisture_pct", "sm", "vol moisture", "vwc"],
  temperature: ["temperature", "temp", "temp_c", "temperature_c", "air temp", "air_temp", "temp (c)", "temperature (°c)", "temperature(c)"],
  humidity:    ["humidity", "rh", "relative humidity", "rel_humidity", "humidity%", "humidity_pct", "relative_humidity", "air humidity"],
  label:       ["label", "name", "id", "reading", "sample", "location", "site", "date", "time", "timestamp"],
};

function detectColumn(headers: string[], field: string): string | null {
  const aliases = COL_ALIASES[field] ?? [];
  for (const h of headers) {
    const norm = h.toLowerCase().trim().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    if (aliases.some((a) => norm === a || norm.includes(a))) return h;
  }
  return null;
}

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<Status, string> = {
  optimal: "text-green-700 bg-green-100 border-green-300",
  warning: "text-amber-700 bg-amber-100 border-amber-300",
  critical: "text-red-700 bg-red-100 border-red-300",
  missing: "text-muted-foreground bg-muted border-border",
};

const STATUS_ICONS: Record<Status, React.FC<{ className?: string }>> = {
  optimal:  CheckCircle2,
  warning:  AlertTriangle,
  critical: XCircle,
  missing:  Info,
};

function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${STATUS_COLORS[status]}`}>
      <Icon className="w-3 h-3" />
      {label ?? status}
    </span>
  );
}

const METRIC_ICONS = { ph: FlaskConical, moisture: Droplets, temperature: Thermometer, humidity: Wind };
const METRIC_LABELS = { ph: "pH Level", moisture: "Moisture (%)", temperature: "Temperature (°C)", humidity: "Humidity (%)" };
const METRIC_COLORS = { ph: "#8b5cf6", moisture: "#3b82f6", temperature: "#ef4444", humidity: "#22c55e" };
const OPTIMAL_RANGES = { ph: [6.0, 7.5], moisture: [40, 70], temperature: [18, 30], humidity: [50, 80] };

// ── Sample CSV download ───────────────────────────────────────────────────────
function downloadSampleCSV() {
  const rows = [
    ["Label", "pH Level", "Moisture (%)", "Temperature (°C)", "Humidity (%)"],
    ["Field A - Zone 1", "6.5", "55", "24", "65"],
    ["Field A - Zone 2", "7.1", "48", "26", "62"],
    ["Field B - Zone 1", "5.8", "72", "22", "74"],
    ["Field B - Zone 2", "6.9", "38", "29", "58"],
    ["Field C - Zone 1", "8.2", "25", "35", "42"],
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "soil_climate_sample.csv";
  a.click(); URL.revokeObjectURL(url);
}

// ── Empty record factory ──────────────────────────────────────────────────────
const emptyRecord = (): DataRecord => ({ label: "", ph: "", moisture: "", temperature: "", humidity: "" });

// ── Main component ────────────────────────────────────────────────────────────
export default function SoilClimate() {
  const fileRef = useRef<HTMLInputElement>(null);

  // shared state
  const [activeTab, setActiveTab] = useState<"upload" | "manual">("upload");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<AnalysisResult | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [cropContext, setCropContext] = useState<string>("");

  // upload tab state
  const [rawHeaders, setRawHeaders]     = useState<string[]>([]);
  const [rawRows, setRawRows]           = useState<Record<string, string>[]>([]);
  const [colMap, setColMap]             = useState<Record<string, string>>({});
  const [fileName, setFileName]         = useState<string>("");
  const [dragOver, setDragOver]         = useState(false);
  const [previewMapped, setPreviewMapped] = useState<DataRecord[]>([]);
  const [mappingDone, setMappingDone]   = useState(false);

  // manual entry state
  const [manualRows, setManualRows] = useState<DataRecord[]>([emptyRecord()]);

  // ── File parsing ─────────────────────────────────────────────────────────
  const parseFile = useCallback((file: File) => {
    setError(null); setResult(null); setMappingDone(false); setPreviewMapped([]);
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    const handleRows = (rows: Record<string, string>[]) => {
      if (!rows.length) { setError("File appears to be empty."); return; }
      const headers = Object.keys(rows[0]);
      setRawHeaders(headers);
      setRawRows(rows);
      // Auto-detect column mapping
      const detected: Record<string, string> = {};
      for (const field of ["label", "ph", "moisture", "temperature", "humidity"]) {
        const match = detectColumn(headers, field);
        if (match) detected[field] = match;
      }
      setColMap(detected);
    };

    if (ext === "csv" || ext === "txt") {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (r) => handleRows(r.data),
        error: () => setError("Failed to parse CSV file."),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          handleRows(data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))));
        } catch {
          setError("Failed to parse Excel file.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError("Unsupported file type. Please upload a .csv, .xlsx, or .xls file.");
    }
  }, []);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const applyMapping = () => {
    const mapped = rawRows.map((row, i) => ({
      label:       colMap.label       ? (row[colMap.label] ?? `Reading ${i + 1}`)  : `Reading ${i + 1}`,
      ph:          colMap.ph          ? (row[colMap.ph] ?? "")          : "",
      moisture:    colMap.moisture    ? (row[colMap.moisture] ?? "")    : "",
      temperature: colMap.temperature ? (row[colMap.temperature] ?? "") : "",
      humidity:    colMap.humidity    ? (row[colMap.humidity] ?? "")    : "",
    }));
    setPreviewMapped(mapped);
    setMappingDone(true);
  };

  // ── Analysis call ─────────────────────────────────────────────────────────
  const analyze = async (records: DataRecord[]) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const payload = records
        .filter((r) => r.ph || r.moisture || r.temperature || r.humidity)
        .map((r) => ({
          label:       r.label || undefined,
          ph:          r.ph          ? parseFloat(r.ph)          : null,
          moisture:    r.moisture    ? parseFloat(r.moisture)    : null,
          temperature: r.temperature ? parseFloat(r.temperature) : null,
          humidity:    r.humidity    ? parseFloat(r.humidity)    : null,
        }));

      if (!payload.length) { setError("No valid data rows to analyze."); setLoading(false); return; }

      const crops = cropContext.split(",").map((s) => s.trim()).filter(Boolean);
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/soil-climate/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: payload, cropContext: crops }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json() as AnalysisResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  // ── Manual row helpers ────────────────────────────────────────────────────
  const updateRow = (i: number, field: keyof DataRecord, val: string) =>
    setManualRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const addRow    = () => setManualRows((r) => [...r, emptyRecord()]);
  const removeRow = (i: number) => setManualRows((r) => r.filter((_, idx) => idx !== i));

  // ── Derived chart data ────────────────────────────────────────────────────
  const chartData = result?.perRecordAnalysis.map((r, i) => ({
    name: r.label.length > 14 ? r.label.slice(0, 13) + "…" : r.label,
    ph:          result.summary.avgPh          != null ? (r.values.ph          ?? null) : null,
    moisture:    result.summary.avgMoisture    != null ? (r.values.moisture    ?? null) : null,
    temperature: result.summary.avgTemperature != null ? (r.values.temperature ?? null) : null,
    humidity:    result.summary.avgHumidity    != null ? (r.values.humidity    ?? null) : null,
    index: i,
  })) ?? [];

  const scoreColor = (s: number) => s >= 75 ? "text-green-600" : s >= 50 ? "text-amber-600" : "text-red-600";
  const scoreBg    = (s: number) => s >= 75 ? "bg-green-50 border-green-200" : s >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

  return (
    <Layout>
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-primary" />
              Soil & Climate Analysis
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a CSV / Excel file or enter readings manually — get AI-powered live analysis of pH, moisture, temperature, and humidity.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={downloadSampleCSV} className="gap-1.5 shrink-0">
            <Download className="w-4 h-4" />
            Sample CSV
          </Button>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Left panel — input */}
          <div className="lg:col-span-2 space-y-4">

            {/* Crop context */}
            <Card>
              <CardContent className="pt-4 pb-3 space-y-1.5">
                <Label className="text-xs font-semibold">Crops Grown (optional)</Label>
                <Input
                  placeholder="e.g. Mango, Pomegranate, Dragon Fruit"
                  value={cropContext}
                  onChange={(e) => setCropContext(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Comma-separated list — used to tailor AI recommendations</p>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "upload" | "manual"); setResult(null); setError(null); }}>
              <TabsList className="w-full">
                <TabsTrigger value="upload" className="flex-1 gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  File Upload
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex-1 gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Manual Entry
                </TabsTrigger>
              </TabsList>

              {/* ── FILE UPLOAD TAB ─────────────────────────────────────── */}
              <TabsContent value="upload" className="space-y-4 mt-3">

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
                  }`}
                >
                  <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
                  <p className="font-medium text-sm">
                    {fileName ? `Loaded: ${fileName}` : "Drop file here or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xlsx, .xls</p>
                  <input
                    ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt"
                    className="hidden" onChange={handleFileInput}
                  />
                </div>

                {/* Column mapping */}
                {rawHeaders.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" />
                        Column Mapping
                        <span className="text-xs font-normal text-muted-foreground">({rawRows.length} rows detected)</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {(["label", "ph", "moisture", "temperature", "humidity"] as const).map((field) => (
                        <div key={field} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-24 shrink-0 capitalize">
                            {field === "ph" ? "pH Level" : field === "label" ? "Row Label" : METRIC_LABELS[field as keyof typeof METRIC_LABELS] ?? field}
                          </span>
                          <Select
                            value={colMap[field] ?? "__none__"}
                            onValueChange={(v) => {
                              setColMap((m) => ({ ...m, [field]: v === "__none__" ? "" : v }));
                              setMappingDone(false);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs flex-1">
                              <SelectValue placeholder="— not mapped —" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— not mapped —</SelectItem>
                              {rawHeaders.map((h) => (
                                <SelectItem key={h} value={h}>{h}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {colMap[field] ? (
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                          ) : (
                            <div className="w-4 h-4 shrink-0" />
                          )}
                        </div>
                      ))}
                      <Button
                        size="sm" className="w-full mt-1 gap-1.5"
                        onClick={applyMapping}
                        disabled={!colMap.ph && !colMap.moisture && !colMap.temperature && !colMap.humidity}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Apply Mapping & Preview
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Preview table */}
                {mappingDone && previewMapped.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Data Preview ({previewMapped.length} rows)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto max-h-48">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-1.5 pr-2 text-muted-foreground">Label</th>
                              <th className="text-right py-1.5 px-2 text-muted-foreground">pH</th>
                              <th className="text-right py-1.5 px-2 text-muted-foreground">Moisture%</th>
                              <th className="text-right py-1.5 px-2 text-muted-foreground">Temp°C</th>
                              <th className="text-right py-1.5 pl-2 text-muted-foreground">Humidity%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewMapped.slice(0, 10).map((r, i) => (
                              <tr key={i} className="border-b border-border/30">
                                <td className="py-1.5 pr-2 max-w-[100px] truncate text-muted-foreground">{r.label || `Row ${i+1}`}</td>
                                <td className="py-1.5 px-2 text-right">{r.ph || "—"}</td>
                                <td className="py-1.5 px-2 text-right">{r.moisture || "—"}</td>
                                <td className="py-1.5 px-2 text-right">{r.temperature || "—"}</td>
                                <td className="py-1.5 pl-2 text-right">{r.humidity || "—"}</td>
                              </tr>
                            ))}
                            {previewMapped.length > 10 && (
                              <tr>
                                <td colSpan={5} className="py-1.5 text-center text-muted-foreground text-[11px]">
                                  + {previewMapped.length - 10} more rows
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <Button
                        className="w-full mt-3 gap-2"
                        onClick={() => analyze(previewMapped)}
                        disabled={loading}
                      >
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</> : <><Activity className="w-4 h-4" />Run Live Analysis</>}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ── MANUAL ENTRY TAB ────────────────────────────────────── */}
              <TabsContent value="manual" className="mt-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Manual Readings</span>
                      <Button size="sm" variant="outline" onClick={addRow} className="gap-1 h-7 text-xs">
                        <Plus className="w-3 h-3" />
                        Add Row
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {/* Header row */}
                    <div className="grid grid-cols-[1fr_60px_64px_60px_64px_28px] gap-1.5 text-[11px] font-medium text-muted-foreground px-1">
                      <span>Label</span>
                      <span className="text-center">pH</span>
                      <span className="text-center">Moist%</span>
                      <span className="text-center">Temp°C</span>
                      <span className="text-center">Humid%</span>
                      <span />
                    </div>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                      {manualRows.map((row, i) => (
                        <div key={i} className="grid grid-cols-[1fr_60px_64px_60px_64px_28px] gap-1.5">
                          <Input
                            value={row.label}
                            onChange={(e) => updateRow(i, "label", e.target.value)}
                            placeholder={`Reading ${i + 1}`}
                            className="h-8 text-xs"
                          />
                          <Input
                            type="number" step="0.1" min="0" max="14"
                            value={row.ph}
                            onChange={(e) => updateRow(i, "ph", e.target.value)}
                            placeholder="6.5"
                            className="h-8 text-xs px-2"
                          />
                          <Input
                            type="number" step="1" min="0" max="100"
                            value={row.moisture}
                            onChange={(e) => updateRow(i, "moisture", e.target.value)}
                            placeholder="55"
                            className="h-8 text-xs px-2"
                          />
                          <Input
                            type="number" step="0.5" min="-20" max="60"
                            value={row.temperature}
                            onChange={(e) => updateRow(i, "temperature", e.target.value)}
                            placeholder="24"
                            className="h-8 text-xs px-2"
                          />
                          <Input
                            type="number" step="1" min="0" max="100"
                            value={row.humidity}
                            onChange={(e) => updateRow(i, "humidity", e.target.value)}
                            placeholder="65"
                            className="h-8 text-xs px-2"
                          />
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => manualRows.length > 1 && removeRow(i)}
                            disabled={manualRows.length === 1}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground px-1">
                      Optimal ranges: pH 6–7.5 · Moisture 40–70% · Temp 18–30°C · Humidity 50–80%
                    </p>
                    <Button
                      className="w-full gap-2"
                      onClick={() => analyze(manualRows)}
                      disabled={loading || manualRows.every((r) => !r.ph && !r.moisture && !r.temperature && !r.humidity)}
                    >
                      {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzing...</> : <><Activity className="w-4 h-4" />Run Live Analysis</>}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>

          {/* Right panel — results */}
          <div className="lg:col-span-3 space-y-5">
            {!result && !loading && (
              <div className="flex flex-col items-center justify-center min-h-80 text-center text-muted-foreground border-2 border-dashed rounded-xl p-10">
                <FlaskConical className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium">No analysis yet</p>
                <p className="text-sm mt-1 max-w-xs">Upload a file or enter readings manually, then click Run Live Analysis</p>
              </div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center min-h-80 text-muted-foreground">
                <Loader2 className="w-10 h-10 animate-spin mb-3 text-primary" />
                <p className="font-medium">Running AI analysis...</p>
                <p className="text-sm mt-1 text-muted-foreground">Interpreting sensor readings and generating recommendations</p>
              </div>
            )}

            {result && (
              <>
                {/* Overall health score */}
                <Card className={`border ${scoreBg(result.overallHealthScore)}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-4">
                      <div className="text-center shrink-0">
                        <p className={`text-4xl font-bold ${scoreColor(result.overallHealthScore)}`}>
                          {result.overallHealthScore}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Health Score</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{result.overallAssessment}</p>
                        <p className="text-xs text-muted-foreground mt-1">{result.seasonalOutlook}</p>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {(Object.entries(result.avgStatuses) as [string, Status][]).map(([key, status]) => (
                            <StatusBadge key={key} status={status} label={`${METRIC_LABELS[key as keyof typeof METRIC_LABELS]}: ${status}`} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Average metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(["ph", "moisture", "temperature", "humidity"] as const).map((key) => {
                    const Icon = METRIC_ICONS[key];
                    const val = result.summary[key === "ph" ? "avgPh" : key === "moisture" ? "avgMoisture" : key === "temperature" ? "avgTemperature" : "avgHumidity"];
                    const status = result.avgStatuses[key];
                    return (
                      <Card key={key} className={`border ${status === "optimal" ? "border-green-200" : status === "warning" ? "border-amber-200" : status === "critical" ? "border-red-200" : ""}`}>
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Icon className="w-3.5 h-3.5" style={{ color: METRIC_COLORS[key] }} />
                            <span className="text-xs text-muted-foreground">{METRIC_LABELS[key]}</span>
                          </div>
                          <p className="text-2xl font-bold">{val != null ? val : "—"}</p>
                          <p className="text-xs text-muted-foreground">avg across {result.summary.recordCount} readings</p>
                          <div className="mt-1.5">
                            <StatusBadge status={status} />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Optimal: {OPTIMAL_RANGES[key][0]}–{OPTIMAL_RANGES[key][1]}
                            {key === "ph" ? "" : "%"}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Trend charts */}
                {chartData.length > 1 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Readings Trend</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* pH + Moisture */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">pH Level & Moisture (%)</p>
                        <ResponsiveContainer width="100%" height={150}>
                          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 9 }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={6.0}   stroke="#8b5cf6" strokeDasharray="4 4" strokeOpacity={0.4} />
                            <ReferenceLine y={7.5}   stroke="#8b5cf6" strokeDasharray="4 4" strokeOpacity={0.4} />
                            <Line type="monotone" dataKey="ph"       name="pH"          stroke={METRIC_COLORS.ph}       strokeWidth={2} dot={{ r: 3 }} connectNulls />
                            <Line type="monotone" dataKey="moisture" name="Moisture (%)" stroke={METRIC_COLORS.moisture} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Temperature + Humidity */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Temperature (°C) & Humidity (%)</p>
                        <ResponsiveContainer width="100%" height={150}>
                          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 9 }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={18} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4} />
                            <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.4} />
                            <Line type="monotone" dataKey="temperature" name="Temp (°C)"   stroke={METRIC_COLORS.temperature} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                            <Line type="monotone" dataKey="humidity"    name="Humidity (%)" stroke={METRIC_COLORS.humidity}    strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Dashed reference lines indicate optimal range boundaries</p>
                    </CardContent>
                  </Card>
                )}

                {/* AI trend insights */}
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-600" />
                      AI Trend Insights
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed">{result.trendInsights}</p>
                  </CardContent>
                </Card>

                {/* Immediate actions */}
                {result.immediateActions?.filter(Boolean).length > 0 && (
                  <Card className="border-red-200 bg-red-50/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2 text-red-700">
                        <AlertTriangle className="w-4 h-4" />
                        Immediate Actions Required
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {result.immediateActions.filter(Boolean).map((action, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <p className="text-sm text-red-800 leading-relaxed">{action}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Recommendations */}
                <Card className="border-green-200 bg-green-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-green-800">
                      <CheckCircle2 className="w-4 h-4" />
                      Crop Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.cropRecommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-green-200 text-green-800 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">
                          {i + 1}
                        </div>
                        <p className="text-sm text-green-900 leading-relaxed">{rec}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Per-reading breakdown */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Per-Reading Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-0.5">
                      {result.perRecordAnalysis.map((rec, i) => (
                        <div key={i} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                            <p className="font-medium text-sm">{rec.label}</p>
                            <div className="flex gap-1 flex-wrap">
                              {(Object.entries(rec.statuses) as [string, Status][]).map(([k, s]) => (
                                <StatusBadge key={k} status={s} label={k === "ph" ? "pH" : k} />
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                            {(["ph", "moisture", "temperature", "humidity"] as const).map((k) => (
                              <div key={k} className="text-center">
                                <p className="text-muted-foreground">{k === "ph" ? "pH" : k === "moisture" ? "Moist%" : k === "temperature" ? "Temp°C" : "Humid%"}</p>
                                <p className="font-semibold">{rec.values[k] != null ? rec.values[k] : "—"}</p>
                              </div>
                            ))}
                          </div>
                          {rec.alerts.length > 0 && (
                            <div className="space-y-1">
                              {rec.alerts.map((a, j) => (
                                <div key={j} className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 rounded px-2 py-1">
                                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                  {a}
                                </div>
                              ))}
                            </div>
                          )}
                          {rec.alerts.length === 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                              <CheckCircle2 className="w-3 h-3" />
                              All metrics within acceptable range
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
