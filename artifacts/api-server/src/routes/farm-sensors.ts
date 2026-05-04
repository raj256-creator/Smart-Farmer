import { Router, type IRouter } from "express";
import { db, farmSensorReadings, farmSensorBatches, farms } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";

const router: IRouter = Router();

function parseId(params: Record<string, string>): number | null {
  const n = parseInt(params.id, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

const RANGES = {
  ph:          { optimal: [6.0, 7.5], warning: [5.5, 8.0] },
  moisture:    { optimal: [40, 70],   warning: [25, 85] },
  temperature: { optimal: [18, 30],   warning: [10, 38] },
  humidity:    { optimal: [50, 80],   warning: [30, 90] },
};

type MetricKey = keyof typeof RANGES;

function classify(key: MetricKey, val: number | null): "optimal" | "warning" | "critical" | "missing" {
  if (val == null || isNaN(val)) return "missing";
  const r = RANGES[key];
  if (val >= r.optimal[0] && val <= r.optimal[1]) return "optimal";
  if (val >= r.warning[0] && val <= r.warning[1]) return "warning";
  return "critical";
}

function avg(nums: (string | null | undefined)[]): number | null {
  const valid = nums
    .map((n) => (n != null ? parseFloat(String(n)) : NaN))
    .filter((n) => !isNaN(n));
  if (!valid.length) return null;
  return parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
}

function perRecordAlerts(rec: { ph?: string | null; moisture?: string | null; temperature?: string | null; humidity?: string | null; label?: string | null }) {
  const alerts: string[] = [];
  const ph   = rec.ph   ? parseFloat(rec.ph)   : null;
  const mois = rec.moisture ? parseFloat(rec.moisture) : null;
  const temp = rec.temperature ? parseFloat(rec.temperature) : null;
  const hum  = rec.humidity ? parseFloat(rec.humidity) : null;

  if (classify("ph", ph) === "critical")
    alerts.push(`pH ${ph} is ${(ph ?? 7) < 5.5 ? "severely acidic" : "severely alkaline"} — immediate soil amendment needed`);
  else if (classify("ph", ph) === "warning")
    alerts.push(`pH ${ph} is slightly ${(ph ?? 7) < 6.0 ? "acidic" : "alkaline"} — consider lime or sulphur application`);

  if (classify("moisture", mois) === "critical")
    alerts.push(`Moisture ${mois}% — ${(mois ?? 50) < 25 ? "critically low, drought stress risk" : "critically high, root rot risk"}`);
  else if (classify("moisture", mois) === "warning")
    alerts.push(`Moisture ${mois}% — ${(mois ?? 50) < 40 ? "below optimal, increase irrigation" : "above optimal, reduce irrigation"}`);

  if (classify("temperature", temp) === "critical")
    alerts.push(`Temperature ${temp}°C — ${(temp ?? 25) < 10 ? "frost risk" : "heat stress risk"}`);
  else if (classify("temperature", temp) === "warning")
    alerts.push(`Temperature ${temp}°C — ${(temp ?? 25) < 18 ? "cooler than ideal" : "warmer than ideal"} for most crops`);

  if (classify("humidity", hum) === "critical")
    alerts.push(`Humidity ${hum}% — ${(hum ?? 60) < 30 ? "critically low, transpiration stress" : "critically high, fungal disease risk"}`);
  else if (classify("humidity", hum) === "warning")
    alerts.push(`Humidity ${hum}% — ${(hum ?? 60) < 50 ? "below optimal" : "above optimal"}`);

  return alerts;
}

// ── GET /api/farms/:id/sensors  — latest batch + readings ──────────────────
router.get("/farms/:id/sensors", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const batches = await db
    .select()
    .from(farmSensorBatches)
    .where(eq(farmSensorBatches.farmId, id))
    .orderBy(desc(farmSensorBatches.createdAt))
    .limit(10);

  if (!batches.length) {
    res.json({ hasSensorData: false, batches: [], latestBatch: null, readings: [] });
    return;
  }

  const latestBatch = batches[0];
  const readings = await db
    .select()
    .from(farmSensorReadings)
    .where(
      and(
        eq(farmSensorReadings.farmId, id),
        eq(farmSensorReadings.batchId, latestBatch.batchId)
      )
    )
    .orderBy(farmSensorReadings.recordedAt);

  res.json({ hasSensorData: true, batches, latestBatch, readings });
});

// ── POST /api/farms/:id/sensors  — save new batch + run AI analysis ─────────
router.post("/farms/:id/sensors", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const { records, source = "manual", fileName } = req.body as {
    records: Array<{
      label?: string;
      ph?: number | null;
      moisture?: number | null;
      temperature?: number | null;
      humidity?: number | null;
    }>;
    source?: string;
    fileName?: string;
  };

  if (!records?.length) {
    res.status(400).json({ error: "records array is required" });
    return;
  }

  const [farm] = await db.select().from(farms).where(eq(farms.id, id));
  if (!farm) { res.status(404).json({ error: "Farm not found" }); return; }

  const batchId = randomUUID();
  const cropList = (farm.crops as string[]) ?? [];

  // ── Insert readings ─────────────────────────────────────────────────────
  const toInsert = records.map((r, i) => ({
    farmId:      id,
    batchId,
    label:       r.label?.trim() || `Reading ${i + 1}`,
    ph:          r.ph       != null ? String(r.ph)          : null,
    moisture:    r.moisture != null ? String(r.moisture)    : null,
    temperature: r.temperature != null ? String(r.temperature) : null,
    humidity:    r.humidity != null ? String(r.humidity)    : null,
    source,
  }));
  await db.insert(farmSensorReadings).values(toInsert);

  // ── Compute summary ────────────────────────────────────────────────────
  const allPh   = records.map((r) => r.ph   != null ? String(r.ph)   : null);
  const allMois = records.map((r) => r.moisture != null ? String(r.moisture) : null);
  const allTemp = records.map((r) => r.temperature != null ? String(r.temperature) : null);
  const allHum  = records.map((r) => r.humidity != null ? String(r.humidity) : null);

  const summary = {
    recordCount: records.length,
    avgPh:          avg(allPh),
    avgMoisture:    avg(allMois),
    avgTemperature: avg(allTemp),
    avgHumidity:    avg(allHum),
  };

  const avgStatuses = {
    ph:          classify("ph",          summary.avgPh),
    moisture:    classify("moisture",    summary.avgMoisture),
    temperature: classify("temperature", summary.avgTemperature),
    humidity:    classify("humidity",    summary.avgHumidity),
  };

  const scoreMap = { optimal: 100, warning: 55, critical: 10, missing: 50 };
  const overallHealthScore = Math.round(
    Object.values(avgStatuses).reduce((s, st) => s + scoreMap[st], 0) / 4
  );

  // ── AI analysis ────────────────────────────────────────────────────────
  const dataDesc = records.slice(0, 20).map((r, i) =>
    `${r.label || `R${i+1}`}: pH=${r.ph ?? "N/A"}, moisture=${r.moisture ?? "N/A"}%, temp=${r.temperature ?? "N/A"}°C, humidity=${r.humidity ?? "N/A"}%`
  ).join("\n");

  const aiPrompt = `You are a soil and climate expert for Indian agriculture.
Farm: ${farm.name}, Location: ${farm.location}, Crops: ${cropList.join(", ") || "unspecified"}
Sensor readings (${records.length} total, avg pH=${summary.avgPh}, avg moisture=${summary.avgMoisture}%, avg temp=${summary.avgTemperature}°C, avg humidity=${summary.avgHumidity}%):
${dataDesc}

Return JSON (no markdown):
{
  "trendInsights": "<2-3 sentences describing patterns>",
  "overallAssessment": "<1-2 sentence summary>",
  "cropRecommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "immediateActions": ["<urgent action if critical>"],
  "seasonalOutlook": "<1 sentence>",
  "soilAdvisory": "<1 sentence soil health advice>",
  "irrigationAdvice": "<1 sentence irrigation advice>"
}`;

  const aiResp = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 700,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: aiPrompt }],
  });
  const aiAnalysis = JSON.parse(aiResp.choices[0]?.message?.content ?? "{}");

  // ── Per-record analysis ────────────────────────────────────────────────
  const perRecordAnalysis = toInsert.map((rec) => ({
    label: rec.label,
    statuses: {
      ph:          classify("ph",          rec.ph ? parseFloat(rec.ph) : null),
      moisture:    classify("moisture",    rec.moisture ? parseFloat(rec.moisture) : null),
      temperature: classify("temperature", rec.temperature ? parseFloat(rec.temperature) : null),
      humidity:    classify("humidity",    rec.humidity ? parseFloat(rec.humidity) : null),
    },
    alerts: perRecordAlerts(rec),
    values: {
      ph:          rec.ph          ? parseFloat(rec.ph)          : null,
      moisture:    rec.moisture    ? parseFloat(rec.moisture)    : null,
      temperature: rec.temperature ? parseFloat(rec.temperature) : null,
      humidity:    rec.humidity    ? parseFloat(rec.humidity)    : null,
    },
  }));

  // ── Save batch record ──────────────────────────────────────────────────
  const [batch] = await db.insert(farmSensorBatches).values({
    farmId: id,
    batchId,
    source,
    fileName: fileName ?? null,
    rowCount: records.length,
    summary,
    aiAnalysis,
  }).returning();

  res.status(201).json({
    batch,
    summary,
    avgStatuses,
    overallHealthScore,
    perRecordAnalysis,
    aiAnalysis,
  });
});

// ── DELETE /api/farms/:id/sensors/:batchId  — remove a batch ────────────────
router.delete("/farms/:id/sensors/:batchId", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { batchId } = req.params;

  await db.delete(farmSensorReadings).where(
    and(eq(farmSensorReadings.farmId, id), eq(farmSensorReadings.batchId, batchId))
  );
  await db.delete(farmSensorBatches).where(
    and(eq(farmSensorBatches.farmId, id), eq(farmSensorBatches.batchId, batchId))
  );
  res.sendStatus(204);
});

export default router;
