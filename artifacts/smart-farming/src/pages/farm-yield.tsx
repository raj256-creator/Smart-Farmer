import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOptimizeFarmYield, useGetFarm } from "@workspace/api-client-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  ArrowLeft,
  Loader2,
  Zap,
  Trees,
  Wheat,
  IndianRupee,
  BarChart2,
} from "lucide-react";

const CROP_OPTIONS = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"] as const;
const SPACING_OPTIONS = [
  { value: "low", label: "Low Density", desc: "Wider spacing, larger plants, lower count" },
  { value: "medium", label: "Medium Density", desc: "Standard commercial spacing (recommended)" },
  { value: "high", label: "High Density", desc: "Intensive planting, higher count, earlier bearing" },
] as const;

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function FarmYield() {
  const [, params] = useRoute("/farms/:id/yield");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  const { data: farm } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });
  const optimize = useOptimizeFarmYield();

  const [acreage, setAcreage] = useState(farm?.acreage ?? "");
  const [selectedCrops, setSelectedCrops] = useState<string[]>(
    (farm?.crops as string[]) ?? []
  );
  const [spacing, setSpacing] = useState<"low" | "medium" | "high">("medium");

  // Sync from farm data once loaded
  if (farm && !acreage && farm.acreage) setAcreage(farm.acreage);
  if (farm && selectedCrops.length === 0 && (farm.crops as string[])?.length > 0) {
    setSelectedCrops(farm.crops as string[]);
  }

  const toggleCrop = (crop: string) => {
    setSelectedCrops((c) =>
      c.includes(crop) ? c.filter((x) => x !== crop) : [...c, crop]
    );
  };

  const handleCalculate = async () => {
    if (!acreage || selectedCrops.length === 0) return;
    await optimize.mutateAsync({
      id: farmId,
      data: {
        acreage: parseFloat(acreage),
        selectedCrops,
        spacingPreference: spacing,
      },
    });
  };

  const result = optimize.data;

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
            <h1 className="text-xl font-bold">{farm?.name ?? "Farm"} — Yield Optimizer</h1>
            <p className="text-sm text-muted-foreground">
              Calculate expected yield and revenue based on land area, crop type, and planting density.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/farms/${farmId}/analytics`)} className="gap-1.5 shrink-0">
            <BarChart2 className="w-4 h-4" />
            Analytics
          </Button>
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Left: Input form */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4 text-primary" />
                Optimization Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label>Land Area (acres) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={acreage}
                  onChange={(e) => setAcreage(e.target.value)}
                  placeholder="e.g. 5.0"
                />
              </div>

              <div className="space-y-2">
                <Label>Select Crops <span className="text-destructive">*</span></Label>
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

              <Button
                className="w-full gap-2"
                onClick={handleCalculate}
                disabled={optimize.isPending || !acreage || selectedCrops.length === 0}
              >
                {optimize.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Calculate Optimal Yield
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Right: Results */}
          <div className="lg:col-span-3 space-y-5">
            {!result && !optimize.isPending && (
              <div className="flex flex-col items-center justify-center h-full min-h-64 text-center text-muted-foreground border-2 border-dashed rounded-xl p-8">
                <Zap className="w-8 h-8 mb-3 opacity-40" />
                <p className="font-medium">Configure parameters and click Calculate</p>
                <p className="text-sm mt-1">Results will appear here with detailed crop breakdown</p>
              </div>
            )}
            {optimize.isPending && (
              <div className="flex flex-col items-center justify-center h-full min-h-64 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p className="text-sm">Calculating optimal yield distribution...</p>
              </div>
            )}

            {result && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <Trees className="w-4 h-4 text-green-600 mb-1" />
                      <p className="text-2xl font-bold">{result.totalPlants.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Total Plants</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <Wheat className="w-4 h-4 text-amber-600 mb-1" />
                      <p className="text-2xl font-bold">{(result.totalEstimatedYieldKg / 1000).toFixed(1)}t</p>
                      <p className="text-xs text-muted-foreground">Est. Yield</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <IndianRupee className="w-4 h-4 text-blue-600 mb-1" />
                      <p className="text-2xl font-bold">
                        {result.estimatedRevenueInr >= 100000
                          ? `${(result.estimatedRevenueInr / 100000).toFixed(1)}L`
                          : result.estimatedRevenueInr.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">Est. Revenue</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Revenue distribution pie */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Revenue Distribution</CardTitle>
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

                  {/* Yield bar chart */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Yield by Crop (kg)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={result.cropBreakdown} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="crop" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number) => [`${v.toLocaleString()} kg`, "Yield"]} />
                          <Bar dataKey="totalYieldKg" radius={[3, 3, 0, 0]} name="Yield (kg)">
                            {result.cropBreakdown.map((_: unknown, i: number) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Crop breakdown table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Detailed Crop Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Crop</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Acres</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Plants</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Spacing</th>
                            <th className="text-right py-2 px-2 font-medium text-muted-foreground">Yield (kg)</th>
                            <th className="text-right py-2 pl-2 font-medium text-muted-foreground">Revenue (INR)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.cropBreakdown.map((row: {
                            crop: string;
                            allocatedAcres: number;
                            totalPlants: number;
                            spacing: string;
                            totalYieldKg: number;
                            revenueInr: number;
                          }, i: number) => (
                            <tr key={row.crop} className="border-b border-border/40 hover:bg-muted/20">
                              <td className="py-2.5 pr-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                                  <span className="font-medium">{row.crop}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-right">{row.allocatedAcres}</td>
                              <td className="py-2.5 px-2 text-right">{row.totalPlants.toLocaleString()}</td>
                              <td className="py-2.5 px-2 text-right text-muted-foreground">{row.spacing}</td>
                              <td className="py-2.5 px-2 text-right">{row.totalYieldKg.toLocaleString()}</td>
                              <td className="py-2.5 pl-2 text-right font-semibold">{row.revenueInr.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Optimal distribution */}
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Optimal Distribution Strategy</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.optimalDistribution.map((d: { crop: string; percentage: number; reasoning: string }, i: number) => (
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
                    {result.optimizationSuggestions.map((s: string, i: number) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">
                          {i + 1}
                        </div>
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
