import { Router, type IRouter } from "express";
import { db, farmSensorBatches, farmSensorReadings, farms } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

function parseId(params: Record<string, string>): number | null {
  const n = parseInt(params.id, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function linearRegression(values: number[]): {
  slope: number; intercept: number; r2: number;
} {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0, r2: 0 };

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  let ssxx = 0, ssxy = 0;
  for (let i = 0; i < n; i++) {
    ssxx += (i - meanX) ** 2;
    ssxy += (i - meanX) * (values[i] - meanY);
  }

  const slope     = ssxx === 0 ? 0 : ssxy / ssxx;
  const intercept = meanY - slope * meanX;

  const ssTot = values.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const ssRes = values.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const r2    = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope: parseFloat(slope.toFixed(4)), intercept: parseFloat(intercept.toFixed(4)), r2: parseFloat(r2.toFixed(4)) };
}

function movingAvg(values: number[], window = 3): number {
  const slice = values.slice(-window);
  return parseFloat((slice.reduce((a, b) => a + b, 0) / slice.length).toFixed(2));
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return parseFloat(Math.sqrt(variance).toFixed(2));
}

type MetricKey = "ph" | "moisture" | "temperature" | "humidity";

const TREND_THRESHOLDS: Record<MetricKey, number> = {
  ph: 0.05, moisture: 1.5, temperature: 0.5, humidity: 1.5,
};

const FLUCTUATION_THRESHOLDS: Record<MetricKey, number> = {
  ph: 0.3, moisture: 8, temperature: 3, humidity: 8,
};

function trendDirection(
  slope: number,
  metric: MetricKey,
  sd: number
): "increasing" | "decreasing" | "stable" | "fluctuating" {
  if (sd > FLUCTUATION_THRESHOLDS[metric]) return "fluctuating";
  if (Math.abs(slope) < TREND_THRESHOLDS[metric]) return "stable";
  return slope > 0 ? "increasing" : "decreasing";
}

// Optimal ranges for each metric (general defaults)
const OPTIMAL: Record<MetricKey, [number, number]> = {
  ph:          [6.0, 7.5],
  moisture:    [40, 70],
  temperature: [18, 30],
  humidity:    [50, 80],
};

const CRITICAL: Record<MetricKey, [number, number]> = {
  ph:          [5.0, 8.5],
  moisture:    [20, 90],
  temperature: [10, 40],
  humidity:    [30, 95],
};

function classifyValue(metric: MetricKey, val: number): "optimal" | "warning" | "critical" {
  const [optLo, optHi]  = OPTIMAL[metric];
  const [critLo, critHi] = CRITICAL[metric];
  if (val >= optLo && val <= optHi) return "optimal";
  if (val >= critLo && val <= critHi) return "warning";
  return "critical";
}

function predictAtStep(reg: { slope: number; intercept: number }, step: number): number {
  return parseFloat((reg.slope * step + reg.intercept).toFixed(2));
}

// Days until a value crosses a threshold given a slope (in "batch steps")
function daysUntilCritical(
  metric: MetricKey,
  currentVal: number,
  slope: number,
  currentStep: number,
  avgBatchIntervalDays: number
): number | null {
  if (slope === 0) return null;
  const [optLo, optHi] = OPTIMAL[metric];
  if (slope < 0 && currentVal > optLo) {
    // Decreasing — steps until we hit optLo
    const stepsNeeded = (currentVal - optLo) / Math.abs(slope);
    return Math.round(stepsNeeded * avgBatchIntervalDays);
  }
  if (slope > 0 && currentVal < optHi) {
    const stepsNeeded = (optHi - currentVal) / slope;
    return Math.round(stepsNeeded * avgBatchIntervalDays);
  }
  return null;
}

// ── GET /api/farms/:id/trends ─────────────────────────────────────────────────
router.get("/farms/:id/trends", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const limitParam = parseInt((req.query.limit as string) ?? "10", 10);
  const limit = isNaN(limitParam) || limitParam < 2 ? 10 : Math.min(limitParam, 20);

  const [farm] = await db.select().from(farms).where(eq(farms.id, id));
  if (!farm) { res.status(404).json({ error: "Farm not found" }); return; }

  // Fetch most recent N batches, oldest first for time-series
  const rawBatches = await db
    .select()
    .from(farmSensorBatches)
    .where(eq(farmSensorBatches.farmId, id))
    .orderBy(desc(farmSensorBatches.createdAt))
    .limit(limit);

  if (rawBatches.length < 2) {
    res.json({
      hasTrendData: false,
      message: rawBatches.length === 1
        ? "Only 1 scan available — run at least 2 scans to see trends."
        : "No scan data found — run your first scan to start tracking trends.",
      batches: [],
      metrics: {},
    });
    return;
  }

  // Reverse so oldest is first (index 0 = oldest)
  const batches = [...rawBatches].reverse();

  type Summary = {
    avgPh: number | null;
    avgMoisture: number | null;
    avgTemperature: number | null;
    avgHumidity: number | null;
  };

  // Build time-series arrays
  const series: Record<MetricKey, (number | null)[]> = {
    ph:          batches.map((b) => (b.summary as Summary | null)?.avgPh ?? null),
    moisture:    batches.map((b) => (b.summary as Summary | null)?.avgMoisture ?? null),
    temperature: batches.map((b) => (b.summary as Summary | null)?.avgTemperature ?? null),
    humidity:    batches.map((b) => (b.summary as Summary | null)?.avgHumidity ?? null),
  };

  // Time labels + average interval
  const labels = batches.map((b) =>
    new Date(b.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
  );

  const timestamps = batches.map((b) => new Date(b.createdAt).getTime());
  const totalMs = timestamps[timestamps.length - 1] - timestamps[0];
  const avgBatchIntervalDays =
    batches.length > 1
      ? parseFloat((totalMs / (batches.length - 1) / 86_400_000).toFixed(1))
      : 1;

  // Calculate per-metric stats
  const metrics: Record<string, unknown> = {};

  for (const metric of ["ph", "moisture", "temperature", "humidity"] as MetricKey[]) {
    const raw = series[metric];
    const valid = raw.filter((v): v is number => v != null);

    if (valid.length < 2) {
      metrics[metric] = { hasData: false };
      continue;
    }

    const reg       = linearRegression(valid);
    const sd        = stdDev(valid);
    const direction = trendDirection(reg.slope, metric, sd);
    const ma3       = movingAvg(valid, 3);
    const latest    = valid[valid.length - 1];
    const earliest  = valid[0];
    const change    = parseFloat((latest - earliest).toFixed(2));
    const changePct = earliest !== 0 ? parseFloat(((change / earliest) * 100).toFixed(1)) : 0;

    metrics[metric] = {
      hasData: true,
      series: raw,
      labels,
      latest,
      earliest,
      min: parseFloat(Math.min(...valid).toFixed(2)),
      max: parseFloat(Math.max(...valid).toFixed(2)),
      avg: parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2)),
      stdDev: sd,
      movingAvg3: ma3,
      change,
      changePct,
      regression: reg,
      direction,
      currentStatus: classifyValue(metric, latest),
      optimalRange: OPTIMAL[metric],
    };
  }

  res.json({
    hasTrendData: true,
    farm: { id: farm.id, name: farm.name, crops: farm.crops },
    batchCount: batches.length,
    avgBatchIntervalDays,
    metrics,
    batches: batches.map((b) => ({
      batchId: b.batchId,
      createdAt: b.createdAt,
      rowCount: b.rowCount,
      source: b.source,
      summary: b.summary,
    })),
  });
});

// ── GET /api/farms/:id/predictions ───────────────────────────────────────────
router.get("/farms/:id/predictions", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [farm] = await db.select().from(farms).where(eq(farms.id, id));
  if (!farm) { res.status(404).json({ error: "Farm not found" }); return; }

  const rawBatches = await db
    .select()
    .from(farmSensorBatches)
    .where(eq(farmSensorBatches.farmId, id))
    .orderBy(desc(farmSensorBatches.createdAt))
    .limit(10);

  if (rawBatches.length < 3) {
    res.json({
      hasPredictions: false,
      message: `Need at least 3 scans for predictions (you have ${rawBatches.length}).`,
    });
    return;
  }

  const batches = [...rawBatches].reverse();

  type Summary = {
    avgPh: number | null;
    avgMoisture: number | null;
    avgTemperature: number | null;
    avgHumidity: number | null;
  };

  const extractSeries = (metric: MetricKey): number[] =>
    batches
      .map((b) => {
        const s = b.summary as Summary | null;
        if (!s) return null;
        return s[`avg${metric.charAt(0).toUpperCase() + metric.slice(1)}` as keyof Summary] ?? null;
      })
      .filter((v): v is number => v != null);

  const timestamps = batches.map((b) => new Date(b.createdAt).getTime());
  const totalMs = timestamps[timestamps.length - 1] - timestamps[0];
  const avgBatchIntervalDays = batches.length > 1
    ? totalMs / (batches.length - 1) / 86_400_000
    : 1;

  const predictions: Record<string, unknown> = {};
  const insights: string[] = [];
  const alerts: Array<{ metric: string; severity: "info" | "warning" | "critical"; message: string }> = [];

  const PREDICT_DAYS = [1, 3, 5, 7];

  for (const metric of ["ph", "moisture", "temperature", "humidity"] as MetricKey[]) {
    const values = extractSeries(metric);
    if (values.length < 3) {
      predictions[metric] = { hasData: false };
      continue;
    }

    const reg         = linearRegression(values);
    const n           = values.length;
    const currentStep = n - 1;
    const currentVal  = values[currentStep];
    const ma3         = movingAvg(values, 3);

    // Predict at future batch steps (convert days → batch steps)
    const futureSteps = PREDICT_DAYS.map((days) =>
      currentStep + days / Math.max(avgBatchIntervalDays, 0.5)
    );

    const predictedByDay = PREDICT_DAYS.map((days, i) => ({
      days,
      linear: parseFloat(Math.max(0, predictAtStep(reg, futureSteps[i])).toFixed(2)),
      movingAvg: parseFloat(Math.max(0, ma3 + reg.slope * (futureSteps[i] - currentStep)).toFixed(2)),
    }));

    // Risk: days until value leaves optimal range
    const daysToRisk = daysUntilCritical(metric, currentVal, reg.slope, currentStep, avgBatchIntervalDays);
    const direction  = trendDirection(reg.slope, metric, stdDev(values));

    // Status of each future prediction
    const futureStatuses = predictedByDay.map((p) => ({
      days: p.days,
      value: p.linear,
      status: classifyValue(metric, p.linear),
    }));

    predictions[metric] = {
      hasData: true,
      current: currentVal,
      movingAvg3: ma3,
      regression: reg,
      direction,
      predictedByDay,
      futureStatuses,
      daysToRisk,
    };

    // Generate insights
    const unitMap: Record<MetricKey, string> = { ph: "", moisture: "%", temperature: "°C", humidity: "%" };
    const labelMap: Record<MetricKey, string> = { ph: "Soil pH", moisture: "Soil Moisture", temperature: "Temperature", humidity: "Humidity" };
    const unit   = unitMap[metric];
    const label  = labelMap[metric];
    const [optLo, optHi] = OPTIMAL[metric];

    // Moisture-specific: most critical for farming
    if (metric === "moisture") {
      const day3Pred = predictedByDay.find((p) => p.days === 3)?.linear ?? ma3;
      const day7Pred = predictedByDay.find((p) => p.days === 7)?.linear ?? ma3;

      if (direction === "decreasing" && day3Pred < optLo) {
        const insight = `Moisture will drop below optimal (${optLo}%) in ~3 days (predicted: ${day3Pred}%) — schedule irrigation soon.`;
        insights.push(insight);
        alerts.push({ metric, severity: "warning", message: insight });
      } else if (direction === "decreasing" && day7Pred < optLo) {
        const insight = `Moisture trending down — may drop below optimal (${optLo}%) within 7 days (predicted: ${day7Pred}%).`;
        insights.push(insight);
        alerts.push({ metric, severity: "info", message: insight });
      } else if (direction === "increasing" && day3Pred > optHi) {
        const insight = `Moisture is rising and may exceed optimal (${optHi}%) in ~3 days (predicted: ${day3Pred}%) — check drainage.`;
        insights.push(insight);
        alerts.push({ metric, severity: "warning", message: insight });
      }

      // Critical risk
      if (classifyValue(metric, day3Pred) === "critical") {
        alerts.push({
          metric,
          severity: "critical",
          message: `Critical moisture level predicted in 3 days: ${day3Pred}${unit}. Immediate irrigation required.`,
        });
      }
    }

    if (metric === "ph") {
      const day3Pred = predictedByDay.find((p) => p.days === 3)?.linear ?? currentVal;
      if (direction === "decreasing" && day3Pred < optLo) {
        insights.push(`Soil pH is acidifying — expected to reach ${day3Pred} in 3 days (optimal: ${optLo}–${optHi}). Apply lime.`);
        alerts.push({ metric, severity: "warning", message: `pH trending acidic — predicted ${day3Pred} in 3 days.` });
      } else if (direction === "increasing" && day3Pred > optHi) {
        insights.push(`Soil pH is rising — expected ${day3Pred} in 3 days (optimal: ${optLo}–${optHi}). Consider sulfur treatment.`);
        alerts.push({ metric, severity: "warning", message: `pH trending alkaline — predicted ${day3Pred} in 3 days.` });
      }
    }

    if (metric === "temperature" || metric === "humidity") {
      const day3Pred = predictedByDay.find((p) => p.days === 3)?.linear ?? currentVal;
      const status3  = classifyValue(metric, day3Pred);
      if (status3 === "critical") {
        const msg = `${label} predicted to reach critical level (${day3Pred}${unit}) in 3 days.`;
        insights.push(msg);
        alerts.push({ metric, severity: "critical", message: msg });
      } else if (status3 === "warning" && classifyValue(metric, currentVal) === "optimal") {
        insights.push(`${label} trending towards warning zone — expected ${day3Pred}${unit} in 3 days.`);
        alerts.push({ metric, severity: "info", message: `${label} may leave optimal range in ~3 days.` });
      }
    }
  }

  // ── Yield estimation based on trends ─────────────────────────────────────
  const moistureVals = extractSeries("moisture");
  const phVals       = extractSeries("ph");
  const tempVals     = extractSeries("temperature");
  const humidityVals = extractSeries("humidity");

  let yieldScore = 70; // baseline %
  const yieldFactors: string[] = [];

  if (moistureVals.length >= 3) {
    const ma = movingAvg(moistureVals, 3);
    const [lo, hi] = OPTIMAL.moisture;
    if (ma >= lo && ma <= hi) { yieldScore += 10; yieldFactors.push("Moisture in optimal range (+10%)"); }
    else if (ma < lo - 10 || ma > hi + 10) { yieldScore -= 15; yieldFactors.push("Moisture critically off-range (-15%)"); }
    else { yieldScore -= 5; yieldFactors.push("Moisture slightly off-range (-5%)"); }
  }

  if (phVals.length >= 3) {
    const ma = movingAvg(phVals, 3);
    const [lo, hi] = OPTIMAL.ph;
    if (ma >= lo && ma <= hi) { yieldScore += 8; yieldFactors.push("pH in optimal range (+8%)"); }
    else { yieldScore -= 8; yieldFactors.push("pH out of optimal range (-8%)"); }
  }

  if (tempVals.length >= 3) {
    const ma = movingAvg(tempVals, 3);
    const [lo, hi] = OPTIMAL.temperature;
    if (ma >= lo && ma <= hi) { yieldScore += 7; yieldFactors.push("Temperature optimal (+7%)"); }
    else { yieldScore -= 5; yieldFactors.push("Temperature suboptimal (-5%)"); }
  }

  if (humidityVals.length >= 3) {
    const ma = movingAvg(humidityVals, 3);
    const [lo, hi] = OPTIMAL.humidity;
    if (ma >= lo && ma <= hi) { yieldScore += 5; yieldFactors.push("Humidity optimal (+5%)"); }
    else { yieldScore -= 3; yieldFactors.push("Humidity suboptimal (-3%)"); }
  }

  yieldScore = Math.max(10, Math.min(100, yieldScore));

  let yieldCategory: "poor" | "fair" | "good" | "excellent";
  if (yieldScore >= 85)      yieldCategory = "excellent";
  else if (yieldScore >= 65) yieldCategory = "good";
  else if (yieldScore >= 45) yieldCategory = "fair";
  else                       yieldCategory = "poor";

  if (insights.length === 0) {
    insights.push("All monitored metrics are trending within acceptable ranges.");
  }

  res.json({
    hasPredictions: true,
    farm: { id: farm.id, name: farm.name, crops: farm.crops },
    batchCount: batches.length,
    avgBatchIntervalDays: parseFloat(avgBatchIntervalDays.toFixed(1)),
    predictions,
    insights,
    alerts,
    yieldEstimation: {
      score: yieldScore,
      category: yieldCategory,
      factors: yieldFactors,
      summary:
        yieldCategory === "excellent"
          ? "Soil conditions are trending excellently — expect near-optimal yield."
          : yieldCategory === "good"
          ? "Conditions are generally good with minor deviations."
          : yieldCategory === "fair"
          ? "Some conditions need attention to maintain acceptable yield."
          : "Multiple critical conditions detected — immediate action needed to protect yield.",
    },
  });
});

export default router;
