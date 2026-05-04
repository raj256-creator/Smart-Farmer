import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetFarm } from "@workspace/api-client-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import {
  ArrowLeft, Loader2, Zap, Wheat, IndianRupee, BarChart2,
  TrendingDown, TrendingUp, Info, CheckCircle2,
} from "lucide-react";

const CROP_OPTIONS = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"] as const;

const SPACING_OPTIONS = [
  { value: "low",    label: "Low Density",    desc: "Wider spacing — larger plants, lower count" },
  { value: "medium", label: "Medium Density",  desc: "Standard commercial spacing (recommended)" },
  { value: "high",   label: "High Density",    desc: "Intensive planting — higher count, earlier bearing" },
] as const;

const HEALTH_OPTIONS = [
  { value: "excellent", label: "Excellent", color: "bg-green-500",  textColor: "text-green-700",  bg: "bg-green-50 border-green-300",  desc: "Optimal soil, irrigation, proactive pest management" },
  { value: "good",      label: "Good",      color: "bg-blue-500",   textColor: "text-blue-700",   bg: "bg-blue-50 border-blue-300",    desc: "Well-managed with minor stress" },
  { value: "fair",      label: "Fair",      color: "bg-amber-500",  textColor: "text-amber-700",  bg: "bg-amber-50 border-amber-300",  desc: "Moderate disease, water stress, or soil deficiency" },
  { value: "poor",      label: "Poor",      color: "bg-red-500",    textColor: "text-red-700",    bg: "bg-red-50 border-red-300",      desc: "Severe stress from disease, drought, or pest damage" },
] as const;

const AREA_UNITS = [
  { value: "acres",    label: "Acres" },
  { value: "hectares", label: "Hectares" },
  { value: "bigha",    label: "Bigha (North India)" },
  { value: "guntha",   label: "Guntha" },
  { value: "cent",     label: "Cent" },
  { value: "kanal",    label: "Kanal (Punjab)" },
  { value: "marla",    label: "Marla" },
  { value: "biswa",    label: "Biswa" },
  { value: "sqm",      label: "Square Metres" },
  { value: "sqft",     label: "Square Feet" },
] as const;

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

function fmtInr(n: number) {
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `${(n / 100000).toFixed(2)} L`;
  return n.toLocaleString("en-IN");
}
function fmtKg(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)} MT`;
  if (n >= 1000)    return `${(n / 1000).toFixed(2)} t`;
  return `${n.toLocaleString()} kg`;
}

type YieldResult = {
  inputSummary: {
    areaValue: number; areaUnit: string; totalAcres: number;
    totalSqM: number; spacingPreference: string;
    healthCondition: string; healthDescription: string;
  };
  totalPlants: number;
  yieldRangeKg:    { worst: number; best: number };
  revenueRangeInr: { worst: number; best: number };
  nominalYieldKg: number;
  rangeReasons: string[];
  cropBreakdown: {
    crop: string; allocatedAcres: number; plantAreaSqM: number;
    spacingInfo: string; totalPlants: number; yieldKgPerPlant: number;
    nominalYieldKg: number; worstCaseYieldKg: number; bestCaseYieldKg: number;
    worstCaseRevenueInr: number; bestCaseRevenueInr: number; priceInrPerKg: number;
  }[];
  optimalDistribution: { crop: string; percentage: number; reasoning: string }[];
  optimizationSuggestions: string[];
};

export default function FarmYield() {
  const [, params] = useRoute("/farms/:id/yield");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  const { data: farm } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });

  const [areaValue, setAreaValue]       = useState("");
  const [areaUnit,  setAreaUnit]        = useState<string>("acres");
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [spacing, setSpacing]           = useState<"low" | "medium" | "high">("medium");
  const [health, setHealth]             = useState<"excellent" | "good" | "fair" | "poor">("good");
  const [result, setResult]             = useState<YieldResult | null>(null);
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    if (farm) {
      if (!areaValue && farm.acreage) setAreaValue(farm.acreage);
      if (selectedCrops.length === 0 && (farm.crops as string[])?.length > 0) {
        setSelectedCrops(farm.crops as string[]);
      }
    }
  }, [farm]);

  const toggleCrop = (crop: string) =>
    setSelectedCrops((c) => c.includes(crop) ? c.filter((x) => x !== crop) : [...c, crop]);

  const handleCalculate = async () => {
    if (!areaValue || selectedCrops.length === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/farms/${farmId}/yield-optimization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaValue: parseFloat(areaValue),
          areaUnit,
          selectedCrops,
          spacingPreference: spacing,
          healthCondition: health,
        }),
      });
      const data = await resp.json() as YieldResult;
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  const selectedHealthOpt = HEALTH_OPTIONS.find((h) => h.value === health)!;

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
            <h1 className="text-xl font-bold">{farm?.name ?? "Farm"} — Yield Calculator</h1>
            <p className="text-sm text-muted-foreground">
              Enter your farm area in any unit, select crops and health condition, and get a best/worst-case yield range.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/farms/${farmId}/analytics`)} className="gap-1.5 shrink-0">
            <BarChart2 className="w-4 h-4" />
            Analytics
          </Button>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Left: Input form */}
          <Card className="lg:col-span-2 h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-primary" />
                Calculation Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Area input + unit selector */}
              <div className="space-y-1.5">
                <Label>Farm Area <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0.01"
                    step="any"
                    value={areaValue}
                    onChange={(e) => setAreaValue(e.target.value)}
                    placeholder="e.g. 5"
                    className="flex-1"
                  />
                  <Select value={areaUnit} onValueChange={setAreaUnit}>
                    <SelectTrigger className="w-44 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AREA_UNITS.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">Supports acres, hectares, bigha, guntha, cent, kanal, marla, sq.m, sq.ft</p>
              </div>

              {/* Crop selector */}
              <div className="space-y-2">
                <Label>Crops to Include <span className="text-destructive">*</span></Label>
                <div className="flex flex-wrap gap-2">
                  {CROP_OPTIONS.map((crop) => (
                    <button
                      key={crop}
                      type="button"
                      onClick={() => toggleCrop(crop)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        selectedCrops.includes(crop)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {crop}
                    </button>
                  ))}
                </div>
              </div>

              {/* Planting density */}
              <div className="space-y-2">
                <Label>Planting Density</Label>
                <div className="space-y-2">
                  {SPACING_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSpacing(opt.value)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        spacing === opt.value
                          ? "bg-primary/5 border-primary text-foreground"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Health condition */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Overall Crop Health
                  <span className="text-xs text-muted-foreground font-normal">(affects yield range)</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {HEALTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setHealth(opt.value)}
                      className={`rounded-lg border p-2.5 text-left transition-all ${
                        health === opt.value
                          ? `${opt.bg} border-2`
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-2 h-2 rounded-full ${opt.color} shrink-0`} />
                        <span className={`text-xs font-semibold ${health === opt.value ? opt.textColor : "text-foreground"}`}>
                          {opt.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-tight">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleCalculate}
                disabled={loading || !areaValue || selectedCrops.length === 0}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Calculating...</>
                ) : (
                  <><Zap className="w-4 h-4" />Calculate Yield Range</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Right: Results */}
          <div className="lg:col-span-3 space-y-5">
            {!result && !loading && (
              <div className="flex flex-col items-center justify-center h-full min-h-64 text-center text-muted-foreground border-2 border-dashed rounded-xl p-8">
                <Zap className="w-8 h-8 mb-3 opacity-40" />
                <p className="font-medium">Configure parameters and click Calculate</p>
                <p className="text-sm mt-1">You will get a best-case and worst-case yield range with reasons</p>
              </div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center h-full min-h-64 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p className="text-sm">Calculating yield range...</p>
              </div>
            )}

            {result && (
              <>
                {/* Area conversion summary */}
                <Card className="bg-muted/30">
                  <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">{result.inputSummary.areaValue} {result.inputSummary.areaUnit}</span>
                        {" = "}
                        <span className="font-semibold text-foreground">{result.inputSummary.totalAcres.toFixed(3)} acres</span>
                        {" = "}
                        <span className="font-semibold text-foreground">{result.inputSummary.totalSqM.toLocaleString()} sq.m</span>
                      </span>
                      <span>
                        Density: <span className="font-semibold text-foreground capitalize">{result.inputSummary.spacingPreference}</span>
                      </span>
                      <span>
                        Health: <span className={`font-semibold ${selectedHealthOpt.textColor}`}>{result.inputSummary.healthCondition}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Yield Range — the main output */}
                <div className="grid sm:grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <p className="text-xs text-muted-foreground mb-1">Total Plants</p>
                      <p className="text-2xl font-bold">{result.totalPlants.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">across {result.inputSummary.totalAcres.toFixed(2)} acres</p>
                    </CardContent>
                  </Card>

                  <Card className="border-amber-200 bg-amber-50/40">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
                        <p className="text-xs text-amber-700 font-medium">Worst Case Yield</p>
                      </div>
                      <p className="text-xl font-bold text-amber-800">{fmtKg(result.yieldRangeKg.worst)}</p>
                      <p className="text-xs text-amber-700 mt-0.5">INR {fmtInr(result.revenueRangeInr.worst)}</p>
                    </CardContent>
                  </Card>

                  <Card className="border-green-200 bg-green-50/40">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                        <p className="text-xs text-green-700 font-medium">Best Case Yield</p>
                      </div>
                      <p className="text-xl font-bold text-green-800">{fmtKg(result.yieldRangeKg.best)}</p>
                      <p className="text-xs text-green-700 mt-0.5">INR {fmtInr(result.revenueRangeInr.best)}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Revenue range visual bar */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Revenue Range per Season</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="text-amber-700 font-medium">Worst: INR {fmtInr(result.revenueRangeInr.worst)}</span>
                        <span className="text-green-700 font-medium">Best: INR {fmtInr(result.revenueRangeInr.best)}</span>
                      </div>
                      <div className="relative h-6 bg-muted rounded-full overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-400 to-green-500 rounded-full transition-all"
                          style={{ width: "100%" }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white drop-shadow">
                          INR {fmtInr(Math.round((result.revenueRangeInr.worst + result.revenueRangeInr.best) / 2))} (mid estimate)
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart
                          data={result.cropBreakdown.map((c) => ({
                            name: c.crop,
                            Worst: c.worstCaseRevenueInr,
                            Best: c.bestCaseRevenueInr,
                          }))}
                          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: number, name: string) => [`INR ${fmtInr(v)}`, name]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="Worst" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                          <Bar dataKey="Best"  fill="#22c55e" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Detailed crop breakdown table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Per-Crop Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Crop</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Acres</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Plants</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Area/Plant</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Spacing</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Worst Yield</th>
                            <th className="text-right py-2 pl-2 font-medium text-muted-foreground">Best Yield</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.cropBreakdown.map((row, i) => (
                            <tr key={row.crop} className="border-b border-border/40 hover:bg-muted/20">
                              <td className="py-2.5 pr-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                  <span className="font-medium">{row.crop}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-right">{row.allocatedAcres}</td>
                              <td className="py-2.5 px-2 text-right">{row.totalPlants.toLocaleString()}</td>
                              <td className="py-2.5 px-2 text-right text-muted-foreground">{row.plantAreaSqM} sq.m</td>
                              <td className="py-2.5 px-2 text-right text-muted-foreground">{row.spacingInfo}</td>
                              <td className="py-2.5 px-2 text-right text-amber-700 font-medium">
                                {fmtKg(row.worstCaseYieldKg)}
                                <div className="text-muted-foreground font-normal">INR {fmtInr(row.worstCaseRevenueInr)}</div>
                              </td>
                              <td className="py-2.5 pl-2 text-right text-green-700 font-medium">
                                {fmtKg(row.bestCaseYieldKg)}
                                <div className="text-muted-foreground font-normal">INR {fmtInr(row.bestCaseRevenueInr)}</div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Why this range — reasons */}
                <Card className="border-blue-200 bg-blue-50/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Info className="w-4 h-4 text-blue-600" />
                      Why This Yield Range?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {result.rangeReasons.map((reason, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">
                          {i + 1}
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{reason}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Charts row */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Yield range by crop */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Yield Range by Crop (kg)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart
                          data={result.cropBreakdown.map((c) => ({
                            name: c.crop,
                            Worst: c.worstCaseYieldKg,
                            Best:  c.bestCaseYieldKg,
                          }))}
                          margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}t` : `${v}`} />
                          <Tooltip formatter={(v: number, name: string) => [fmtKg(v), name]} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="Worst" fill="#f59e0b" radius={[3,3,0,0]} />
                          <Bar dataKey="Best"  fill="#22c55e" radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Revenue distribution pie */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Mid-Estimate Revenue Share</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={result.optimalDistribution}
                            dataKey="percentage"
                            nameKey="crop"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            label={({ crop, percentage }: { crop: string; percentage: number }) =>
                              `${crop} ${percentage}%`
                            }
                            labelLine={false}
                          >
                            {result.optimalDistribution.map((_: unknown, i: number) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => [`${v}%`, "Revenue Share"]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Optimal distribution */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Optimal Land Distribution Strategy</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.optimalDistribution.map((d, i) => (
                      <div key={d.crop} className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <div>
                          <span className="font-medium text-sm">{d.crop}</span>
                          <Badge variant="outline" className="ml-2 text-xs">{d.percentage}%</Badge>
                          <p className="text-xs text-muted-foreground mt-0.5">{d.reasoning}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Suggestions */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Optimization Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.optimizationSuggestions.map((s, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-sm text-muted-foreground leading-relaxed">{s}</p>
                      </div>
                    ))}
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
