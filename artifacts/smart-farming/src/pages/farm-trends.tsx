import { useRoute, useLocation } from "wouter";
import { FarmLayout } from "@/components/farm-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetFarm } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Activity,
  AlertTriangle, CheckCircle2, XCircle, Info,
  ScanLine, RefreshCw, Droplets, Thermometer, Wind, FlaskConical,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type MetricTrend = {
  hasData: boolean;
  series?: (number | null)[];
  labels?: string[];
  latest?: number;
  earliest?: number;
  min?: number;
  max?: number;
  avg?: number;
  stdDev?: number;
  movingAvg3?: number;
  change?: number;
  changePct?: number;
  direction?: "increasing" | "decreasing" | "stable" | "fluctuating";
  currentStatus?: "optimal" | "warning" | "critical";
  optimalRange?: [number, number];
  regression?: { slope: number; intercept: number; r2: number };
};

type TrendsResponse = {
  hasTrendData: boolean;
  message?: string;
  farm?: { id: number; name: string; crops: string[] };
  batchCount?: number;
  avgBatchIntervalDays?: number;
  metrics?: Record<string, MetricTrend>;
  batches?: Array<{
    batchId: string;
    createdAt: string;
    rowCount: number;
    source: string;
    summary: Record<string, number | null>;
  }>;
};

type PredictedDay = { days: number; linear: number; movingAvg: number; clamped?: boolean; rateLimited?: boolean };
type FutureStatus = { days: number; value: number; status: "optimal" | "warning" | "critical" };
type MetricPrediction = {
  hasData: boolean;
  current?: number;
  movingAvg3?: number;
  direction?: string;
  predictedByDay?: PredictedDay[];
  futureStatuses?: FutureStatus[];
  daysToRisk?: number | null;
  regression?: { slope: number; r2: number };
};

type PredictionsResponse = {
  hasPredictions: boolean;
  message?: string;
  batchCount?: number;
  avgBatchIntervalDays?: number;
  predictions?: Record<string, MetricPrediction>;
  insights?: string[];
  alerts?: Array<{ metric: string; severity: "info" | "warning" | "critical"; message: string }>;
  yieldEstimation?: {
    score: number;
    category: "poor" | "fair" | "good" | "excellent";
    factors: string[];
    summary: string;
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  optimal:  { text: "text-green-700",  bg: "bg-green-50",  border: "border-green-200", badge: "bg-green-100 text-green-700" },
  warning:  { text: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200", badge: "bg-amber-100 text-amber-700" },
  critical: { text: "text-red-700",    bg: "bg-red-50",    border: "border-red-200",   badge: "bg-red-100 text-red-700" },
};

const SEVERITY_STYLES = {
  info:     { icon: Info,          bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-800",   iconColor: "text-blue-500" },
  warning:  { icon: AlertTriangle, bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-800",  iconColor: "text-amber-500" },
  critical: { icon: XCircle,       bg: "bg-red-50",    border: "border-red-200",    text: "text-red-800",    iconColor: "text-red-500" },
};

const DIRECTION_ICON = {
  increasing:   TrendingUp,
  decreasing:   TrendingDown,
  stable:       Minus,
  fluctuating:  Activity,
};

const DIRECTION_COLOR = {
  increasing:  "text-blue-600",
  decreasing:  "text-red-600",
  stable:      "text-green-600",
  fluctuating: "text-amber-600",
};

const METRIC_CONFIG = {
  ph:          { label: "Soil pH",        unit: "",   color: "#8b5cf6", icon: FlaskConical, optimal: [6.0, 7.5] },
  moisture:    { label: "Moisture",       unit: "%",  color: "#0ea5e9", icon: Droplets,     optimal: [40, 70] },
  temperature: { label: "Temperature",   unit: "°C", color: "#f97316", icon: Thermometer,  optimal: [18, 30] },
  humidity:    { label: "Humidity",       unit: "%",  color: "#10b981", icon: Wind,         optimal: [50, 80] },
};

const YIELD_COLORS = {
  excellent: { bg: "bg-green-50",  border: "border-green-300",  text: "text-green-700",  bar: "bg-green-500" },
  good:      { bg: "bg-blue-50",   border: "border-blue-300",   text: "text-blue-700",   bar: "bg-blue-500" },
  fair:      { bg: "bg-amber-50",  border: "border-amber-300",  text: "text-amber-700",  bar: "bg-amber-500" },
  poor:      { bg: "bg-red-50",    border: "border-red-300",    text: "text-red-700",    bar: "bg-red-500" },
};

function fmt(val: number | null | undefined, unit = ""): string {
  if (val == null) return "—";
  return `${val}${unit}`;
}

// ── Chart component ───────────────────────────────────────────────────────────

function MetricChart({
  metric,
  trend,
  prediction,
}: {
  metric: keyof typeof METRIC_CONFIG;
  trend: MetricTrend;
  prediction?: MetricPrediction;
}) {
  const cfg = METRIC_CONFIG[metric];
  const DirIcon = DIRECTION_ICON[trend.direction ?? "stable"];
  const dirColor = DIRECTION_COLOR[trend.direction ?? "stable"];
  const status = trend.currentStatus ?? "optimal";
  const statusStyle = STATUS_STYLES[status];

  // Build chart data from historical + predicted
  const histData = (trend.series ?? []).map((val, i) => ({
    label: (trend.labels ?? [])[i] ?? `#${i + 1}`,
    value: val,
    predicted: undefined as number | undefined,
  }));

  // Append predicted points (day 3 and day 7)
  if (prediction?.predictedByDay) {
    const lastLabel = (trend.labels ?? []).slice(-1)[0] ?? "Now";
    for (const p of prediction.predictedByDay.filter((d) => d.days === 3 || d.days === 7)) {
      histData.push({
        label: `+${p.days}d`,
        value: undefined as unknown as number,
        predicted: p.linear,
      });
    }
    void lastLabel;
  }

  return (
    <Card className={`border ${statusStyle.border}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <cfg.icon className="w-4 h-4" style={{ color: cfg.color }} />
            {cfg.label}
          </CardTitle>
          <div className="flex items-center gap-2">
            {trend.direction && (
              <span className={`flex items-center gap-1 text-xs font-medium ${dirColor}`}>
                <DirIcon className="w-3.5 h-3.5" />
                {trend.direction}
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle.badge}`}>
              {status}
            </span>
          </div>
        </div>
        {/* Stat row */}
        <div className="grid grid-cols-4 gap-1 mt-2">
          {[
            { l: "Current", v: fmt(trend.latest, cfg.unit) },
            { l: "Avg",     v: fmt(trend.avg,    cfg.unit) },
            { l: "Min",     v: fmt(trend.min,    cfg.unit) },
            { l: "Max",     v: fmt(trend.max,    cfg.unit) },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <p className="text-[10px] text-muted-foreground">{s.l}</p>
              <p className="text-sm font-bold">{s.v}</p>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={histData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "#6b7280" }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              formatter={(val: unknown, name: string) =>
                val != null ? [`${val}${cfg.unit}`, name === "value" ? cfg.label : "Predicted"] : ["—", name]
              }
            />
            <Legend
              iconSize={8}
              wrapperStyle={{ fontSize: 11 }}
              formatter={(val) => val === "value" ? cfg.label : "Predicted"}
            />
            {/* Optimal range reference lines */}
            <ReferenceLine y={cfg.optimal[0]} stroke={cfg.color} strokeDasharray="4 2" strokeOpacity={0.4} />
            <ReferenceLine y={cfg.optimal[1]} stroke={cfg.color} strokeDasharray="4 2" strokeOpacity={0.4} />
            {/* Historical line */}
            <Line
              type="monotone"
              dataKey="value"
              stroke={cfg.color}
              strokeWidth={2}
              dot={{ r: 3, fill: cfg.color }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
            {/* Predicted line (dashed) */}
            {prediction?.predictedByDay && (
              <Line
                type="monotone"
                dataKey="predicted"
                stroke={cfg.color}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: "white", stroke: cfg.color, strokeWidth: 2 }}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>

        {/* Change summary */}
        {trend.change != null && (
          <p className="text-[11px] text-muted-foreground mt-1 text-center">
            Change over period:{" "}
            <span className={trend.change > 0 ? "text-blue-600 font-medium" : trend.change < 0 ? "text-red-600 font-medium" : "font-medium"}>
              {trend.change > 0 ? "+" : ""}{trend.change}{cfg.unit}
            </span>
            {trend.changePct != null && (
              <span className="ml-1 text-muted-foreground">({trend.changePct > 0 ? "+" : ""}{trend.changePct}%)</span>
            )}
            {trend.regression && (
              <span className="ml-2 text-muted-foreground">· R² {trend.regression.r2.toFixed(2)}</span>
            )}
          </p>
        )}

        {/* Optimal range label */}
        <p className="text-[10px] text-muted-foreground text-center mt-0.5">
          Optimal range: {cfg.optimal[0]}–{cfg.optimal[1]}{cfg.unit} (dashed lines)
        </p>
      </CardContent>
    </Card>
  );
}

// ── Prediction insight card ───────────────────────────────────────────────────

function PredictionCard({ metric, pred }: { metric: keyof typeof METRIC_CONFIG; pred: MetricPrediction }) {
  const cfg = METRIC_CONFIG[metric];
  if (!pred.hasData || !pred.predictedByDay) return null;

  const anyAdjusted = pred.predictedByDay.some((p) => p.clamped || p.rateLimited);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
          <cfg.icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
          {cfg.label} — 7-Day Forecast
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-4 gap-2">
          {pred.predictedByDay.map((p) => {
            const fs = pred.futureStatuses?.find((f) => f.days === p.days);
            const st = fs?.status ?? "optimal";
            const ss = STATUS_STYLES[st];
            const wasAdjusted = p.clamped || p.rateLimited;
            return (
              <div key={p.days} className={`rounded-lg p-2 text-center border ${ss.border} ${ss.bg} relative`}>
                <p className="text-[10px] text-muted-foreground">+{p.days}d</p>
                <p className={`text-sm font-bold ${ss.text}`}>{p.linear}{cfg.unit}</p>
                <p className={`text-[9px] font-medium mt-0.5 ${ss.text}`}>{st}</p>
                {wasAdjusted && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-amber-400 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold leading-none" title="Adjusted to realistic range">!</span>
                )}
              </div>
            );
          })}
        </div>
        {anyAdjusted && (
          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Values marked <strong className="mx-0.5">!</strong> were adjusted to realistic agricultural range
          </p>
        )}
        {pred.daysToRisk != null && pred.daysToRisk > 0 && pred.daysToRisk <= 14 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mt-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Leaves optimal range in ~{pred.daysToRisk} day{pred.daysToRisk !== 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FarmTrends() {
  const [, params] = useRoute("/farms/:id/trends");
  const [, navigate] = useLocation();
  const farmId = parseInt(params?.id ?? "0", 10);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: farm } = useGetFarm(farmId, { query: { enabled: farmId > 0 } });

  const {
    data: trendsData,
    isLoading: trendsLoading,
    refetch: refetchTrends,
    isFetching: trendsFetching,
  } = useQuery({
    queryKey: ["farm-trends", farmId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/farms/${farmId}/trends?limit=10`);
      return r.json() as Promise<TrendsResponse>;
    },
    enabled: farmId > 0,
    staleTime: 3 * 60 * 1000,
  });

  const {
    data: predsData,
    isLoading: predsLoading,
  } = useQuery({
    queryKey: ["farm-predictions", farmId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/farms/${farmId}/predictions`);
      return r.json() as Promise<PredictionsResponse>;
    },
    enabled: farmId > 0,
    staleTime: 3 * 60 * 1000,
  });

  const isLoading = trendsLoading || predsLoading;
  const metrics = trendsData?.metrics ?? {};
  const preds   = predsData?.predictions ?? {};
  const alerts  = predsData?.alerts ?? [];
  const insights = predsData?.insights ?? [];
  const yieldEst = predsData?.yieldEstimation;
  const yieldStyle = yieldEst ? YIELD_COLORS[yieldEst.category] : YIELD_COLORS.fair;

  return (
    <FarmLayout farmId={farmId} farmName={farm?.name}>
      <div className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold">Trends & Predictions</h2>
            <p className="text-sm text-muted-foreground">
              Time-series analysis across all soil &amp; climate readings
              {trendsData?.batchCount ? ` · ${trendsData.batchCount} scans` : ""}
              {trendsData?.avgBatchIntervalDays
                ? ` · avg ${trendsData.avgBatchIntervalDays}d between scans`
                : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { void refetchTrends(); }}
            disabled={trendsFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${trendsFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
            </div>
          </div>
        )}

        {/* Not enough data */}
        {!isLoading && !trendsData?.hasTrendData && (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <Activity className="w-10 h-10 text-muted-foreground opacity-30 mb-3" />
              <h3 className="font-semibold mb-1">Not enough data yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-4">
                {trendsData?.message ?? "Run at least 2 scans to see trends and predictions."}
              </p>
              <Button onClick={() => navigate(`/farms/${farmId}/scan`)} className="gap-2">
                <ScanLine className="w-4 h-4" />New Scan
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Main content */}
        {!isLoading && trendsData?.hasTrendData && (
          <>
            {/* ── Alerts ── */}
            {alerts.length > 0 && (
              <div className="space-y-2">
                {alerts.map((alert, i) => {
                  const ss = SEVERITY_STYLES[alert.severity];
                  const Icon = ss.icon;
                  return (
                    <div key={i} className={`flex items-start gap-2.5 rounded-xl px-4 py-3 border ${ss.bg} ${ss.border}`}>
                      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${ss.iconColor}`} />
                      <p className={`text-sm ${ss.text}`}>{alert.message}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Insights ── */}
            {insights.length > 0 && (
              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
                    <Info className="w-4 h-4" />Prediction Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {insights.map((ins, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-blue-900">
                      <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      {ins}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ── Yield Estimation ── */}
            {yieldEst && (
              <Card className={`border ${yieldStyle.border} ${yieldStyle.bg}`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`text-sm ${yieldStyle.text}`}>
                    Yield Estimation (trend-based)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="h-2.5 bg-white/60 rounded-full overflow-hidden border">
                        <div
                          className={`h-full rounded-full transition-all ${yieldStyle.bar}`}
                          style={{ width: `${yieldEst.score}%` }}
                        />
                      </div>
                    </div>
                    <span className={`text-xl font-bold ${yieldStyle.text}`}>{yieldEst.score}%</span>
                    <Badge className={`text-xs capitalize ${yieldStyle.bg} ${yieldStyle.text} border ${yieldStyle.border}`}>
                      {yieldEst.category}
                    </Badge>
                  </div>
                  <p className={`text-sm ${yieldStyle.text}`}>{yieldEst.summary}</p>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {yieldEst.factors.map((f, i) => (
                      <p key={i} className={`text-xs ${yieldStyle.text} flex items-start gap-1`}>
                        <span className="mt-0.5">·</span> {f}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Trend Charts ── */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Sensor Trend Charts</h3>
              <div className="grid md:grid-cols-2 gap-4">
                {(Object.keys(METRIC_CONFIG) as (keyof typeof METRIC_CONFIG)[]).map((metric) => {
                  const trend = metrics[metric];
                  if (!trend?.hasData) return (
                    <Card key={metric} className="border-dashed">
                      <CardContent className="flex items-center justify-center py-10 text-center">
                        <div>
                          <p className="text-sm font-medium">{METRIC_CONFIG[metric].label}</p>
                          <p className="text-xs text-muted-foreground mt-1">No data available</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                  return (
                    <MetricChart
                      key={metric}
                      metric={metric}
                      trend={trend}
                      prediction={preds[metric] as MetricPrediction | undefined}
                    />
                  );
                })}
              </div>
            </div>

            {/* ── 7-Day Forecasts ── */}
            {predsData?.hasPredictions && (
              <div>
                <h3 className="font-semibold text-sm mb-3">7-Day Forecast</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {(Object.keys(METRIC_CONFIG) as (keyof typeof METRIC_CONFIG)[]).map((metric) => {
                    const pred = preds[metric] as MetricPrediction | undefined;
                    if (!pred?.hasData) return null;
                    return <PredictionCard key={metric} metric={metric} pred={pred} />;
                  })}
                </div>
              </div>
            )}

            {!predsData?.hasPredictions && predsData?.message && (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">{predsData.message}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Quick action */}
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/farms/${farmId}/scan`)}>
            <ScanLine className="w-4 h-4" />Add New Scan to Improve Predictions
          </Button>
        </div>

      </div>
    </FarmLayout>
  );
}
