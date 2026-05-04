import { useState, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { FarmLayout } from "@/components/farm-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useGetFarm } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Loader2, CheckCircle2, XCircle, AlertTriangle, Info, Upload,
  FileSpreadsheet, Activity, Database, Download, ArrowRight, ArrowLeft,
  ScanLine, Plus, Trash2, RefreshCw, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Status = "optimal" | "warning" | "critical" | "missing";
type Step = 1 | 2 | 3;

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

// ── Column auto-detection ─────────────────────────────────────────────────────
const COL_ALIASES: Record<string, string[]> = {
  ph:          ["ph", "phlevel", "ph_level", "ph level", "soil ph", "soil_ph", "ph value"],
  moisture:    ["moisture", "soil moisture", "soil_moisture", "moisture%", "sm", "vwc"],
  temperature: ["temperature", "temp", "temp_c", "temperature_c", "air temp", "temp (c)"],
  humidity:    ["humidity", "rh", "relative humidity", "rel_humidity", "humidity%"],
  label:       ["label", "name", "id", "reading", "sample", "location", "site", "date", "time"],
};
function detectColumn(headers: string[], field: string): string | null {
  for (const h of headers) {
    const norm = h.toLowerCase().trim().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    if ((COL_ALIASES[field] ?? []).some((a) => norm === a || norm.includes(a))) return h;
  }
  return null;
}

const CROP_OPTIONS = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"] as const;
const GROWTH_STAGES = ["Seedling", "Vegetative", "Flowering", "Fruiting", "Mature"] as const;

type SensorRecord = { label: string; ph: string; moisture: string; temperature: string; humidity: string };
const emptyRow = (): SensorRecord => ({ label: "", ph: "", moisture: "", temperature: "", humidity: "" });

interface SensorResult {
  summary: { recordCount: number; avgPh: number|null; avgMoisture: number|null; avgTemperature: number|null; avgHumidity: number|null };
  avgStatuses: { ph: Status; moisture: Status; temperature: Status; humidity: Status };
  overallHealthScore: number;
  perRecordAnalysis: Array<{ label: string; statuses: Record<string, Status>; alerts: string[]; values: Record<string, number|null> }>;
  aiAnalysis: {
    trendInsights?: string; overallAssessment?: string; cropRecommendations?: string[];
    immediateActions?: string[]; seasonalOutlook?: string; soilAdvisory?: string; irrigationAdvice?: string;
  };
  batch: { batchId: string; source: string; fileName?: string; rowCount: number; createdAt: string };
}

function downloadSampleCSV() {
  const rows = [["Label","pH Level","Moisture (%)","Temperature (°C)","Humidity (%)"],["Zone 1","6.5","55","24","65"],["Zone 2","7.1","48","26","62"]];
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sensor_sample.csv"; a.click();
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function FarmScan() {
  const [, params] = useRoute("/farms/:id/scan");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  const { data: farm } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });
  const queryClient = useQueryClient();
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Crop Details ────────────────────────────────────────────────────
  const farmCrops = (farm?.crops as string[]) ?? [];
  const [cropType,    setCropType]    = useState("");
  const [growthStage, setGrowthStage] = useState("");
  const [areaNote,    setAreaNote]    = useState("");
  const [observation, setObservation] = useState("");

  // ── Step 2: CSV Upload ──────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadMode,   setUploadMode]   = useState<"file" | "manual">("file");
  const [fileName,     setFileName]     = useState("");
  const [dragOver,     setDragOver]     = useState(false);
  const [rawHeaders,   setRawHeaders]   = useState<string[]>([]);
  const [rawRows,      setRawRows]      = useState<Record<string, string>[]>([]);
  const [colMap,       setColMap]       = useState<Record<string, string>>({});
  const [previewRows,  setPreviewRows]  = useState<SensorRecord[]>([]);
  const [mappingDone,  setMappingDone]  = useState(false);
  const [manualRows,   setManualRows]   = useState<SensorRecord[]>([emptyRow()]);
  const [csvError,     setCsvError]     = useState<string | null>(null);

  // ── Step 3: Analytics ───────────────────────────────────────────────────────
  const [saving,       setSaving]       = useState(false);
  const [result,       setResult]       = useState<SensorResult | null>(null);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [scanSaved,    setScanSaved]    = useState(false);

  // ── File parsing ─────────────────────────────────────────────────────────────
  const parseFile = useCallback((file: File) => {
    setCsvError(null); setMappingDone(false); setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const handleRows = (rows: Record<string, string>[]) => {
      if (!rows.length) { setCsvError("File appears empty."); return; }
      const headers = Object.keys(rows[0]);
      setRawHeaders(headers); setRawRows(rows);
      const detected: Record<string, string> = {};
      for (const f of ["label","ph","moisture","temperature","humidity"]) {
        const m = detectColumn(headers, f); if (m) detected[f] = m;
      }
      setColMap(detected);
    };
    if (ext === "csv" || ext === "txt") {
      Papa.parse<Record<string, string>>(file, { header: true, skipEmptyLines: true, complete: (r) => handleRows(r.data), error: () => setCsvError("Failed to parse CSV.") });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          handleRows(data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))));
        } catch { setCsvError("Failed to parse Excel file."); }
      };
      reader.readAsArrayBuffer(file);
    } else { setCsvError("Unsupported file type. Use .csv or .xlsx"); }
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

  // ── Save & analyse ────────────────────────────────────────────────────────────
  const saveAndAnalyse = async () => {
    setSaving(true); setSaveError(null); setResult(null);
    try {
      const rows = uploadMode === "file" ? previewRows : manualRows;
      const payload = rows
        .filter((r) => r.ph || r.moisture || r.temperature || r.humidity)
        .map((r) => ({
          label:       r.label || undefined,
          ph:          r.ph          ? parseFloat(r.ph)          : null,
          moisture:    r.moisture    ? parseFloat(r.moisture)    : null,
          temperature: r.temperature ? parseFloat(r.temperature) : null,
          humidity:    r.humidity    ? parseFloat(r.humidity)    : null,
        }));
      if (!payload.length) { setSaveError("No valid data rows found."); setSaving(false); return; }

      const resp = await fetch(`${BASE}/api/farms/${farmId}/sensors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records: payload,
          source: uploadMode === "file" ? "file" : "manual",
          fileName: uploadMode === "file" ? fileName : undefined,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json() as SensorResult;
      setResult(data);
      setStep(3);

      // Save a scan record to history
      const scoreColor = data.overallHealthScore >= 75 ? "Good" : data.overallHealthScore >= 50 ? "Fair" : "Poor";
      await fetch(`${BASE}/api/farms/${farmId}/scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cropType: cropType || (farmCrops[0] ?? null),
          growthStage: growthStage || null,
          healthStatus: scoreColor,
          analysisNotes: [
            data.aiAnalysis.overallAssessment,
            areaNote ? `Area notes: ${areaNote}` : null,
            observation ? `Observations: ${observation}` : null,
          ].filter(Boolean).join(" "),
          yieldPredictionKg: null,
          harvestDaysRemaining: null,
          harvestWindow: null,
          confidence: data.overallHealthScore / 100,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["farm-scans", farmId] });
      setScanSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setSaving(false); }
  };

  const reset = () => {
    setStep(1); setCropType(""); setGrowthStage(""); setAreaNote(""); setObservation("");
    setFileName(""); setRawHeaders([]); setRawRows([]); setColMap({}); setPreviewRows([]);
    setMappingDone(false); setManualRows([emptyRow()]); setResult(null); setScanSaved(false); setSaveError(null);
  };

  const updateManualRow = (i: number, f: keyof SensorRecord, v: string) =>
    setManualRows((rows) => rows.map((r, idx) => idx === i ? { ...r, [f]: v } : r));

  // ── Step indicators ───────────────────────────────────────────────────────────
  const steps = [
    { n: 1, label: "Crop Details" },
    { n: 2, label: "Soil & Climate Data" },
    { n: 3, label: "Analytics" },
  ];

  return (
    <FarmLayout farmId={farmId} farmName={farm?.name}>
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full space-y-6">

        {/* Step indicator */}
        <div className="flex items-center gap-0">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center flex-1">
              <div className="flex items-center gap-2 shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                  step > s.n ? "bg-primary border-primary text-primary-foreground" :
                  step === s.n ? "border-primary text-primary bg-primary/5" :
                  "border-border text-muted-foreground bg-muted"}`}>
                  {step > s.n ? <CheckCircle2 className="w-4 h-4" /> : s.n}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${step === s.n ? "text-primary" : "text-muted-foreground"}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${step > s.n ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Crop Details ─────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ScanLine className="w-4 h-4 text-primary" />Crop Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Crop Type <span className="text-destructive">*</span></Label>
                  <Select value={cropType} onValueChange={setCropType}>
                    <SelectTrigger><SelectValue placeholder="Select crop..." /></SelectTrigger>
                    <SelectContent>
                      {farmCrops.length > 0
                        ? farmCrops.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)
                        : CROP_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                  {farmCrops.length > 0 && <p className="text-xs text-muted-foreground">Crops registered to this farm</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Growth Stage</Label>
                  <Select value={growthStage} onValueChange={setGrowthStage}>
                    <SelectTrigger><SelectValue placeholder="Select stage..." /></SelectTrigger>
                    <SelectContent>
                      {GROWTH_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Area / Zone Notes</Label>
                  <Input value={areaNote} onChange={(e) => setAreaNote(e.target.value)} placeholder="e.g. North block, Row 3–8" />
                </div>
                <div className="space-y-1.5">
                  <Label>Field Observations</Label>
                  <Input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="e.g. Yellowing leaves, pest marks" />
                </div>
              </div>
              {farmCrops.length === 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2 text-xs text-amber-800">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  No crops are registered to this farm. You can edit the farm to add crops, or select manually above.
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!cropType} className="gap-2">
                  Next: Upload Soil & Climate Data<ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: CSV Upload ───────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2"><Database className="w-4 h-4 text-primary" />Soil & Climate Data</span>
                  <Button variant="outline" size="sm" onClick={downloadSampleCSV} className="gap-1.5 h-7 text-xs">
                    <Download className="w-3 h-3" />Sample CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium">
                  {(["file", "manual"] as const).map((m) => (
                    <button key={m} onClick={() => setUploadMode(m)}
                      className={`flex-1 py-2 transition-colors ${uploadMode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                      {m === "file" ? "Upload File" : "Manual Entry"}
                    </button>
                  ))}
                </div>

                {uploadMode === "file" && (
                  <>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
                      onClick={() => fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
                    >
                      <FileSpreadsheet className="w-9 h-9 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm font-medium">{fileName ? `Loaded: ${fileName}` : "Drop CSV / Excel or click to browse"}</p>
                      <p className="text-xs text-muted-foreground mt-1">.csv · .xlsx · .xls</p>
                      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
                    </div>

                    {rawHeaders.length > 0 && (
                      <Card className="border-primary/20">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-primary" />Column Mapping <span className="text-muted-foreground font-normal">({rawRows.length} rows detected)</span></CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2.5 pt-0">
                          {(["label","ph","moisture","temperature","humidity"] as const).map((field) => (
                            <div key={field} className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-24 shrink-0 capitalize">{field === "ph" ? "pH Level" : field === "label" ? "Row Label" : field}</span>
                              <select value={colMap[field] ?? ""}
                                onChange={(e) => { setColMap((m) => ({ ...m, [field]: e.target.value })); setMappingDone(false); }}
                                className="flex-1 text-xs border border-border rounded-lg px-2 py-1.5 bg-background">
                                <option value="">— not mapped —</option>
                                {rawHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                              </select>
                              {colMap[field] ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <div className="w-3.5 h-3.5 shrink-0" />}
                            </div>
                          ))}
                          <Button size="sm" className="w-full gap-1.5 mt-1" onClick={applyMapping}
                            disabled={!colMap.ph && !colMap.moisture && !colMap.temperature && !colMap.humidity}>
                            <RefreshCw className="w-3 h-3" />Apply Mapping & Preview
                          </Button>
                        </CardContent>
                      </Card>
                    )}

                    {mappingDone && previewRows.length > 0 && (
                      <div className="rounded-lg border border-border overflow-hidden">
                        <div className="bg-muted/50 px-3 py-2 text-xs font-medium flex items-center justify-between">
                          <span>Preview — {previewRows.length} rows</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        </div>
                        <div className="overflow-x-auto max-h-48">
                          <table className="w-full text-xs">
                            <thead><tr className="border-b bg-muted/30">
                              {["Label","pH","Moisture%","Temp°C","Humidity%"].map((h) => <th key={h} className="py-1.5 px-2 text-left text-muted-foreground font-medium">{h}</th>)}
                            </tr></thead>
                            <tbody>
                              {previewRows.slice(0, 10).map((r, i) => (
                                <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                                  <td className="py-1 px-2 truncate max-w-[80px]">{r.label || `Row ${i+1}`}</td>
                                  <td className="py-1 px-2">{r.ph||"—"}</td>
                                  <td className="py-1 px-2">{r.moisture||"—"}</td>
                                  <td className="py-1 px-2">{r.temperature||"—"}</td>
                                  <td className="py-1 px-2">{r.humidity||"—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {uploadMode === "manual" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_52px_60px_52px_60px_28px] gap-1 text-[10px] font-medium text-muted-foreground px-0.5">
                      <span>Label</span><span className="text-center">pH</span><span className="text-center">Moist%</span><span className="text-center">Temp°C</span><span className="text-center">Humid%</span><span />
                    </div>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto">
                      {manualRows.map((row, i) => (
                        <div key={i} className="grid grid-cols-[1fr_52px_60px_52px_60px_28px] gap-1">
                          <Input value={row.label} onChange={(e) => updateManualRow(i,"label",e.target.value)} placeholder={`Zone ${i+1}`} className="h-8 text-xs" />
                          <Input type="number" step="0.1" min="0" max="14"  value={row.ph}          onChange={(e) => updateManualRow(i,"ph",e.target.value)}          placeholder="6.5" className="h-8 text-xs px-2" />
                          <Input type="number" step="1"   min="0" max="100" value={row.moisture}    onChange={(e) => updateManualRow(i,"moisture",e.target.value)}    placeholder="55"  className="h-8 text-xs px-2" />
                          <Input type="number" step="0.5" min="-20" max="60" value={row.temperature} onChange={(e) => updateManualRow(i,"temperature",e.target.value)} placeholder="24"  className="h-8 text-xs px-2" />
                          <Input type="number" step="1"   min="0" max="100" value={row.humidity}    onChange={(e) => updateManualRow(i,"humidity",e.target.value)}    placeholder="65"  className="h-8 text-xs px-2" />
                          <Button variant="ghost" size="icon" className="h-8 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => manualRows.length > 1 && setManualRows((r) => r.filter((_,j) => j !== i))} disabled={manualRows.length === 1}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setManualRows((r) => [...r, emptyRow()])}>
                      <Plus className="w-3 h-3" />Add Row
                    </Button>
                    <p className="text-[10px] text-muted-foreground">Optimal: pH 6–7.5 · Moisture 40–70% · Temp 18–30°C · Humidity 50–80%</p>
                  </div>
                )}

                {csvError && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{csvError}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3 justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2"><ArrowLeft className="w-4 h-4" />Back</Button>
              <Button onClick={saveAndAnalyse} disabled={saving || (uploadMode === "file" ? !mappingDone : manualRows.every((r) => !r.ph && !r.moisture && !r.temperature && !r.humidity))} className="gap-2">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Analysing...</> : <><Activity className="w-4 h-4" />Save & Run Analytics</>}
              </Button>
            </div>
            {saveError && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{saveError}</div>}
          </div>
        )}

        {/* ── STEP 3: Analytics ───────────────────────────────────────────── */}
        {step === 3 && result && (() => {
          const r = result;
          const scoreColor = r.overallHealthScore >= 75 ? "text-green-600" : r.overallHealthScore >= 50 ? "text-amber-600" : "text-red-600";
          const scoreBg    = r.overallHealthScore >= 75 ? "bg-green-50 border-green-200" : r.overallHealthScore >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
          return (
            <div className="space-y-5">
              {/* Summary header */}
              <Card className={`border ${scoreBg}`}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start gap-5 flex-wrap">
                    <div className="text-center shrink-0">
                      <p className={`text-5xl font-bold ${scoreColor}`}>{r.overallHealthScore}</p>
                      <p className="text-xs text-muted-foreground mt-1">/ 100</p>
                      <p className="text-xs font-semibold mt-0.5">Health Score</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className="text-xs font-semibold">{cropType}</Badge>
                        {growthStage && <Badge variant="outline" className="text-xs">{growthStage}</Badge>}
                        {scanSaved && <Badge className="text-xs bg-green-100 text-green-700 border-green-200">Saved to History</Badge>}
                      </div>
                      <p className="font-semibold text-sm mt-1">{r.aiAnalysis.overallAssessment}</p>
                      <p className="text-xs text-muted-foreground mt-1">{r.aiAnalysis.seasonalOutlook}</p>
                      <div className="flex gap-1.5 mt-2.5 flex-wrap">
                        {(Object.entries(r.avgStatuses) as [string, Status][]).map(([k, s]) => (
                          <StatusBadge key={k} status={s} label={k === "ph" ? `pH: ${s}` : `${k}: ${s}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Avg metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { key: "ph",          label: "pH Level",    unit: "",   avg: r.summary.avgPh,          status: r.avgStatuses.ph },
                  { key: "moisture",    label: "Moisture",    unit: "%",  avg: r.summary.avgMoisture,    status: r.avgStatuses.moisture },
                  { key: "temperature", label: "Temperature", unit: "°C", avg: r.summary.avgTemperature, status: r.avgStatuses.temperature },
                  { key: "humidity",    label: "Humidity",    unit: "%",  avg: r.summary.avgHumidity,    status: r.avgStatuses.humidity },
                ] as const).map((m) => (
                  <Card key={m.key} className={`border ${m.status === "optimal" ? "border-green-200" : m.status === "warning" ? "border-amber-200" : m.status === "critical" ? "border-red-200" : ""}`}>
                    <CardContent className="pt-3 pb-3">
                      <p className="text-xs text-muted-foreground mb-0.5">{m.label}</p>
                      <p className="text-2xl font-bold">{m.avg != null ? `${m.avg}${m.unit}` : "—"}</p>
                      <div className="mt-1"><StatusBadge status={m.status} /></div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* AI insights */}
              <Card className="border-blue-200 bg-blue-50/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-blue-600" />AI Insights for {cropType}</CardTitle>
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
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-red-700 flex items-center gap-2"><XCircle className="w-4 h-4" />Immediate Actions</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {r.aiAnalysis.immediateActions!.filter(Boolean).map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-red-800">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{a}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Recommendations */}
              <Card className="border-green-200 bg-green-50/30">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-green-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Crop Recommendations</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(r.aiAnalysis.cropRecommendations ?? []).map((rec, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-green-200 text-green-800 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">{i+1}</div>
                      <p className="text-sm text-green-900 leading-relaxed">{rec}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Per-reading */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Per-Reading Breakdown ({r.perRecordAnalysis.length} readings)</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-0.5">
                    {r.perRecordAnalysis.map((rec, i) => (
                      <div key={i} className="border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                          <p className="font-medium text-sm">{rec.label}</p>
                          <div className="flex gap-1 flex-wrap">
                            {(Object.entries(rec.statuses) as [string,Status][]).map(([k,s]) => <StatusBadge key={k} status={s} label={k === "ph" ? "pH" : k} />)}
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
                        {rec.alerts.length > 0
                          ? rec.alerts.map((a,j) => <div key={j} className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 rounded px-2 py-1"><AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{a}</div>)
                          : <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded px-2 py-1"><CheckCircle2 className="w-3 h-3" />All metrics within range</div>
                        }
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Action buttons */}
              <div className="flex gap-3 flex-wrap pb-6">
                <Button variant="outline" onClick={reset} className="gap-2"><RefreshCw className="w-4 h-4" />New Scan</Button>
                <Button variant="outline" onClick={() => navigate(`/farms/${farmId}/history`)} className="gap-2"><ChevronRight className="w-4 h-4" />View History</Button>
                <Button onClick={() => navigate(`/farms/${farmId}/dashboard`)} className="gap-2"><Activity className="w-4 h-4" />Go to Dashboard</Button>
              </div>
            </div>
          );
        })()}

        {step === 3 && !result && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Processing...</p>
          </div>
        )}
      </div>
    </FarmLayout>
  );
}
