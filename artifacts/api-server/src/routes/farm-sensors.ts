import { Router, type IRouter } from "express";
import { db, farmSensorReadings, farmSensorBatches, farms } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { randomUUID } from "crypto";

const router: IRouter = Router();

// ── Crop-specific optimal sensor ranges (ICAR / Indian horticulture standards) ──
const CROP_RANGES: Record<string, {
  ph: [number, number]; moisture: [number, number];
  temperature: [number, number]; humidity: [number, number];
  nitrogen: [number, number]; phosphorus: [number, number]; potassium: [number, number];
  waterRequirement: string; mainDiseases: string[]; mainPests: string[];
  icarRef: string;
}> = {
  "Mango": {
    ph: [5.5, 7.5], moisture: [40, 65], temperature: [24, 30], humidity: [50, 70],
    nitrogen: [120, 180], phosphorus: [40, 60], potassium: [120, 180],
    waterRequirement: "600–1500 mm/year (drought-tolerant once established)",
    mainDiseases: ["Anthracnose (Colletotrichum gloeosporioides)", "Powdery Mildew (Oidium mangiferae)", "Bacterial Canker"],
    mainPests: ["Mango Hopper (Amritodus atkinsoni)", "Mango Weevil", "Fruit Fly (Bactrocera dorsalis)"],
    icarRef: "ICAR-CISH Lucknow — Mango Production Technology (2022)",
  },
  "Dragon Fruit": {
    ph: [6.0, 7.0], moisture: [30, 55], temperature: [18, 35], humidity: [40, 70],
    nitrogen: [80, 120], phosphorus: [30, 50], potassium: [100, 160],
    waterRequirement: "400–600 mm/year (cactus-type, drought-tolerant)",
    mainDiseases: ["Stem Canker (Neoscytalidium dimidiatum)", "Anthracnose", "Root Rot (Phytophthora spp.)"],
    mainPests: ["Aphids", "Mealybugs", "Scale Insects"],
    icarRef: "ICAR-NRC for Citrus / State Horticulture Mission guidelines (2021)",
  },
  "Chikoo": {
    ph: [6.0, 8.0], moisture: [45, 70], temperature: [20, 38], humidity: [55, 80],
    nitrogen: [100, 160], phosphorus: [35, 55], potassium: [130, 180],
    waterRequirement: "750–1500 mm/year",
    mainDiseases: ["Leaf Spot (Pestalotiopsis sapotae)", "Stem-End Rot", "Sooty Mould"],
    mainPests: ["Sapota Shoot Borer (Anarsia ephippias)", "Fruit Fly", "Mealybug"],
    icarRef: "ICAR-IIHR Bengaluru — Sapota Cultivation Guide (2020)",
  },
  "Pomegranate": {
    ph: [5.5, 7.5], moisture: [40, 65], temperature: [25, 35], humidity: [40, 65],
    nitrogen: [100, 160], phosphorus: [35, 60], potassium: [120, 180],
    waterRequirement: "500–800 mm/year (drought-tolerant)",
    mainDiseases: ["Bacterial Blight (Xanthomonas axonopodis)", "Cercospora Fruit Spot", "Wilt (Ceratocystis fimbriata)"],
    mainPests: ["Anar Butterfly (Virachola isocrates)", "Pomegranate Aphid", "Thrips"],
    icarRef: "ICAR-NRC for Pomegranate, Solapur — Production Technology (2022)",
  },
  "Mulberry": {
    ph: [6.2, 6.8], moisture: [60, 80], temperature: [24, 32], humidity: [65, 85],
    nitrogen: [200, 300], phosphorus: [50, 80], potassium: [80, 130],
    waterRequirement: "800–2500 mm/year (moisture-loving)",
    mainDiseases: ["Leaf Spot (Cercospora moricola)", "Root Rot (Fusarium solani)", "Powdery Mildew"],
    mainPests: ["Mulberry Thrips (Pseudodendrothrips mori)", "Scale Insects", "Leaf Webber"],
    icarRef: "CSGRC Hosur / CSB Bengaluru — Mulberry Cultivation Package (2021)",
  },
};

function getCropRanges(cropType: string | null | undefined) {
  if (cropType && CROP_RANGES[cropType]) return CROP_RANGES[cropType];
  return {
    ph: [6.0, 7.5] as [number, number], moisture: [40, 70] as [number, number],
    temperature: [18, 30] as [number, number], humidity: [50, 80] as [number, number],
    nitrogen: [100, 200] as [number, number], phosphorus: [30, 60] as [number, number], potassium: [100, 180] as [number, number],
    waterRequirement: "600–1200 mm/year", mainDiseases: [], mainPests: [],
    icarRef: "ICAR General Horticulture Guidelines",
  };
}

function parseId(params: Record<string, string>): number | null {
  const n = parseInt(params.id, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

function classify(
  key: "ph" | "moisture" | "temperature" | "humidity",
  val: number | null,
  cropType?: string | null
): "optimal" | "warning" | "critical" | "missing" {
  if (val == null || isNaN(val)) return "missing";
  const r = getCropRanges(cropType);
  const WARN_MARGIN = { ph: 0.5, moisture: 10, temperature: 5, humidity: 10 };
  const [lo, hi] = r[key];
  const margin = WARN_MARGIN[key];
  if (val >= lo && val <= hi) return "optimal";
  if (val >= lo - margin && val <= hi + margin) return "warning";
  return "critical";
}

function avg(nums: (string | null | undefined)[]): number | null {
  const valid = nums.map((n) => (n != null ? parseFloat(String(n)) : NaN)).filter((n) => !isNaN(n));
  if (!valid.length) return null;
  return parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
}

function perRecordAlerts(
  rec: { ph?: string | null; moisture?: string | null; temperature?: string | null; humidity?: string | null },
  cropType: string | null
) {
  const alerts: string[] = [];
  const r = getCropRanges(cropType);
  const ph   = rec.ph          ? parseFloat(rec.ph)          : null;
  const mois = rec.moisture    ? parseFloat(rec.moisture)    : null;
  const temp = rec.temperature ? parseFloat(rec.temperature) : null;
  const hum  = rec.humidity    ? parseFloat(rec.humidity)    : null;

  if (ph != null) {
    const [lo, hi] = r.ph;
    if (ph < lo - 0.5 || ph > hi + 0.5)
      alerts.push(`pH ${ph} is ${ph < lo ? "severely acidic" : "severely alkaline"} (optimal ${lo}–${hi} for ${cropType ?? "this crop"})`);
    else if (ph < lo || ph > hi)
      alerts.push(`pH ${ph} is slightly ${ph < lo ? "acidic" : "alkaline"} — apply ${ph < lo ? "agricultural lime (CaCO₃)" : "elemental sulphur"}`);
  }
  if (mois != null) {
    const [lo, hi] = r.moisture;
    if (mois < lo - 10 || mois > hi + 10)
      alerts.push(`Moisture ${mois}% — ${mois < lo ? "severe drought stress, immediate irrigation required" : "waterlogging risk, check drainage"}`);
    else if (mois < lo || mois > hi)
      alerts.push(`Moisture ${mois}% — ${mois < lo ? "below optimal, schedule irrigation" : "above optimal, reduce watering frequency"}`);
  }
  if (temp != null) {
    const [lo, hi] = r.temperature;
    if (temp < lo - 5 || temp > hi + 5)
      alerts.push(`Temperature ${temp}°C — ${temp < lo ? "frost/cold damage risk" : "heat stress risk — consider shade nets"}`);
    else if (temp < lo || temp > hi)
      alerts.push(`Temperature ${temp}°C — ${temp < lo ? "cooler than ideal" : "warmer than ideal"} for ${cropType ?? "this crop"}`);
  }
  if (hum != null) {
    const [lo, hi] = r.humidity;
    if (hum < lo - 10 || hum > hi + 10)
      alerts.push(`Humidity ${hum}% — ${hum < lo ? "critical moisture stress on leaves" : "very high fungal disease risk"}`);
    else if (hum < lo || hum > hi)
      alerts.push(`Humidity ${hum}% — ${hum < lo ? "below optimal" : "above optimal, monitor for fungal diseases"}`);
  }
  return alerts;
}

// ── GET /api/farms/:id/sensors ───────────────────────────────────────────────
router.get("/farms/:id/sensors", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const batches = await db
    .select().from(farmSensorBatches).where(eq(farmSensorBatches.farmId, id))
    .orderBy(desc(farmSensorBatches.createdAt)).limit(10);

  if (!batches.length) {
    res.json({ hasSensorData: false, batches: [], latestBatch: null, readings: [] }); return;
  }

  const latestBatch = batches[0];
  const readings = await db.select().from(farmSensorReadings).where(
    and(eq(farmSensorReadings.farmId, id), eq(farmSensorReadings.batchId, latestBatch.batchId))
  ).orderBy(farmSensorReadings.recordedAt);

  res.json({ hasSensorData: true, batches, latestBatch, readings });
});

// ── POST /api/farms/:id/sensors ──────────────────────────────────────────────
router.post("/farms/:id/sensors", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const { records, source = "manual", fileName, cropType: reqCrop, growthStage } = req.body as {
    records: Array<{ label?: string; ph?: number | null; moisture?: number | null; temperature?: number | null; humidity?: number | null }>;
    source?: string; fileName?: string; cropType?: string; growthStage?: string;
  };

  if (!records?.length) { res.status(400).json({ error: "records array is required" }); return; }

  const [farm] = await db.select().from(farms).where(eq(farms.id, id));
  if (!farm) { res.status(404).json({ error: "Farm not found" }); return; }

  const cropList = (farm.crops as string[]) ?? [];
  const cropType = reqCrop || cropList[0] || null;
  const cropRef  = getCropRanges(cropType);
  const batchId  = randomUUID();

  // ── Insert readings ──────────────────────────────────────────────────────
  const toInsert = records.map((r, i) => ({
    farmId: id, batchId,
    label:       r.label?.trim() || `Reading ${i + 1}`,
    ph:          r.ph          != null ? String(r.ph)          : null,
    moisture:    r.moisture    != null ? String(r.moisture)    : null,
    temperature: r.temperature != null ? String(r.temperature) : null,
    humidity:    r.humidity    != null ? String(r.humidity)    : null,
    source,
  }));
  await db.insert(farmSensorReadings).values(toInsert);

  // ── Compute summary ──────────────────────────────────────────────────────
  const summary = {
    recordCount:    records.length,
    avgPh:          avg(records.map((r) => r.ph          != null ? String(r.ph)          : null)),
    avgMoisture:    avg(records.map((r) => r.moisture    != null ? String(r.moisture)    : null)),
    avgTemperature: avg(records.map((r) => r.temperature != null ? String(r.temperature) : null)),
    avgHumidity:    avg(records.map((r) => r.humidity    != null ? String(r.humidity)    : null)),
  };

  const avgStatuses = {
    ph:          classify("ph",          summary.avgPh,          cropType),
    moisture:    classify("moisture",    summary.avgMoisture,    cropType),
    temperature: classify("temperature", summary.avgTemperature, cropType),
    humidity:    classify("humidity",    summary.avgHumidity,    cropType),
  };

  const scoreWeights = { optimal: 100, warning: 55, critical: 10, missing: 40 };
  const overallHealthScore = Math.round(
    Object.values(avgStatuses).reduce((s, st) => s + scoreWeights[st], 0) / 4
  );

  // ── Per-record analysis ──────────────────────────────────────────────────
  const perRecordAnalysis = toInsert.map((rec) => ({
    label: rec.label,
    statuses: {
      ph:          classify("ph",          rec.ph          ? parseFloat(rec.ph)          : null, cropType),
      moisture:    classify("moisture",    rec.moisture    ? parseFloat(rec.moisture)    : null, cropType),
      temperature: classify("temperature", rec.temperature ? parseFloat(rec.temperature) : null, cropType),
      humidity:    classify("humidity",    rec.humidity    ? parseFloat(rec.humidity)    : null, cropType),
    },
    alerts: perRecordAlerts(rec, cropType),
    values: {
      ph:          rec.ph          ? parseFloat(rec.ph)          : null,
      moisture:    rec.moisture    ? parseFloat(rec.moisture)    : null,
      temperature: rec.temperature ? parseFloat(rec.temperature) : null,
      humidity:    rec.humidity    ? parseFloat(rec.humidity)    : null,
    },
  }));

  const criticalCount = perRecordAnalysis.filter((r) => Object.values(r.statuses).some((s) => s === "critical")).length;
  const warningCount  = perRecordAnalysis.filter((r) => Object.values(r.statuses).some((s) => s === "warning")).length;

  // ── Identify deficiencies and deviations ─────────────────────────────────
  const deviations: string[] = [];
  if (summary.avgPh != null) {
    const [lo, hi] = cropRef.ph;
    if (summary.avgPh < lo) deviations.push(`Soil pH ${summary.avgPh} is acidic (optimal ${lo}–${hi}); apply agricultural lime at 2–4 t/ha`);
    else if (summary.avgPh > hi) deviations.push(`Soil pH ${summary.avgPh} is alkaline (optimal ${lo}–${hi}); apply elemental sulphur or gypsum`);
  }
  if (summary.avgMoisture != null) {
    const [lo, hi] = cropRef.moisture;
    if (summary.avgMoisture < lo) deviations.push(`Soil moisture ${summary.avgMoisture}% is below optimal (${lo}–${hi}%); increase irrigation frequency`);
    else if (summary.avgMoisture > hi) deviations.push(`Soil moisture ${summary.avgMoisture}% is above optimal (${lo}–${hi}%); improve drainage, reduce irrigation`);
  }
  if (summary.avgTemperature != null) {
    const [lo, hi] = cropRef.temperature;
    if (summary.avgTemperature < lo) deviations.push(`Temperature ${summary.avgTemperature}°C is below ideal range (${lo}–${hi}°C); consider mulching to retain soil warmth`);
    else if (summary.avgTemperature > hi) deviations.push(`Temperature ${summary.avgTemperature}°C exceeds ideal range (${lo}–${hi}°C); shade nets at 25–50% shade recommended`);
  }
  if (summary.avgHumidity != null) {
    const [lo, hi] = cropRef.humidity;
    if (summary.avgHumidity > hi) deviations.push(`Humidity ${summary.avgHumidity}% is high (optimal ${lo}–${hi}%); risk of fungal diseases — apply preventive copper-based fungicide`);
    else if (summary.avgHumidity < lo) deviations.push(`Humidity ${summary.avgHumidity}% is low (optimal ${lo}–${hi}%); foliar sprays may help reduce transpiration stress`);
  }

  // ── Fetch live weather for the farm location (best-effort, non-blocking) ──
  let weatherContext = "";
  try {
    const apiKey = process.env["OPENWEATHER_API_KEY"];
    if (apiKey && farm.location) {
      const params = new URLSearchParams({ location: farm.location });
      if (summary.avgMoisture != null) params.set("moisture", String(summary.avgMoisture));
      if (summary.avgHumidity != null) params.set("humidity", String(summary.avgHumidity));
      const weatherRes = await fetch(
        `http://localhost:${process.env["PORT"] ?? 8080}/api/weather?${params}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (weatherRes.ok) {
        const wd = await weatherRes.json() as {
          current?: { temp: number; humidity: number; description: string; windSpeed: number };
          forecast?: { rainNext24hMm: number; rainNext3dMm: number; maxTempNext3d: number; minTempNext3d: number; avgHumidityNext3d: number };
          insights?: Array<{ type: string; message: string }>;
        };
        if (wd.current && wd.forecast) {
          weatherContext = `
=== LIVE WEATHER DATA (${farm.location}) ===
Current Temperature: ${wd.current.temp}°C, Humidity: ${wd.current.humidity}%, Conditions: ${wd.current.description}, Wind: ${wd.current.windSpeed} km/h
Rain next 24h: ${wd.forecast.rainNext24hMm} mm | Rain next 3 days: ${wd.forecast.rainNext3dMm} mm
Temperature range next 3 days: ${wd.forecast.minTempNext3d}°C – ${wd.forecast.maxTempNext3d}°C
Average humidity next 3 days: ${wd.forecast.avgHumidityNext3d}%
Weather alerts: ${wd.insights?.map((i) => i.message).join("; ") || "None"}`;
        }
      }
    }
  } catch {
    // Weather fetch failed silently — analysis continues without it
  }

  // ── AI analysis prompt (comprehensive, data-driven, ICAR-grounded) ────────
  const readingsSample = records.slice(0, 20).map((r, i) =>
    `${r.label || `R${i + 1}`}: pH=${r.ph ?? "N/A"}, moisture=${r.moisture ?? "N/A"}%, temp=${r.temperature ?? "N/A"}°C, humidity=${r.humidity ?? "N/A"}%`
  ).join("\n");

  const aiPrompt = `You are a senior agricultural scientist with expertise in Indian horticulture and soil science. Your analysis must be grounded entirely in the measured sensor data provided — do NOT fabricate or assume any readings. Where live weather data is provided, incorporate it into your irrigation, disease risk, and seasonal outlook recommendations.

=== FARM PROFILE ===
Farm Name: ${farm.name}
Location: ${farm.location}
Crop: ${cropType ?? "Unspecified"}
Growth Stage: ${growthStage ?? "Unspecified"}
Reference Standard: ${cropRef.icarRef}

=== SENSOR DATA SUMMARY (${records.length} readings) ===
Average pH:          ${summary.avgPh ?? "N/A"}        (ICAR optimal: ${cropRef.ph[0]}–${cropRef.ph[1]})
Average Moisture:    ${summary.avgMoisture ?? "N/A"}%  (ICAR optimal: ${cropRef.moisture[0]}–${cropRef.moisture[1]}%)
Average Temperature: ${summary.avgTemperature ?? "N/A"}°C (ICAR optimal: ${cropRef.temperature[0]}–${cropRef.temperature[1]}°C)
Average Humidity:    ${summary.avgHumidity ?? "N/A"}%  (ICAR optimal: ${cropRef.humidity[0]}–${cropRef.humidity[1]}%)
Readings with critical flags: ${criticalCount} / ${records.length}
Readings with warning flags:  ${warningCount} / ${records.length}

=== INDIVIDUAL READINGS (up to 20 shown) ===
${readingsSample}
${weatherContext}
=== CROP-SPECIFIC KNOWN RISKS ===
Diseases to watch: ${cropRef.mainDiseases.join("; ")}
Pests to watch: ${cropRef.mainPests.join("; ")}
Water requirement: ${cropRef.waterRequirement}
N-P-K reference: N ${cropRef.nitrogen[0]}–${cropRef.nitrogen[1]} kg/ha, P ${cropRef.phosphorus[0]}–${cropRef.phosphorus[1]} kg/ha, K ${cropRef.potassium[0]}–${cropRef.potassium[1]} kg/ha

=== DEVIATIONS IDENTIFIED ===
${deviations.length ? deviations.join("\n") : "No significant deviations from ICAR optimal ranges."}

=== TASK ===
Analyse ALL the above sensor data and return a JSON object. Base every field strictly on the data provided.

Return JSON only (no markdown):
{
  "overallAssessment": "2-3 sentence overall health assessment citing specific measured values",
  "trendInsights": "2-3 sentences on patterns across readings (spatial variation, consistency, hotspots)",
  "soilAdvisory": "Specific soil amendment recommendation citing the measured pH and moisture values with product names and dosages where applicable (e.g. 'Apply dolomite lime at 3 t/ha to raise pH from 5.2 to target 6.0–6.5')",
  "irrigationAdvice": "Specific irrigation schedule recommendation based on measured moisture and temperature values, method (drip/flood), frequency, and quantity per plant/ha",
  "fertilizationPlan": "N-P-K fertilizer plan based on crop stage and ICAR standard. Include product name, quantity per plant or per ha, and timing (e.g. 'Apply Urea @ 450 g/tree split in 3 doses; MOP @ 750 g/tree at fruit development')",
  "diseaseRisk": "Low" | "Moderate" | "High",
  "diseaseRiskDetails": "Explain which specific diseases are at risk given the current humidity/temp readings and what preventive measures to take (product + dose)",
  "pestRisk": "Low" | "Moderate" | "High",
  "pestRiskDetails": "Specific pest risk assessment based on temperature and humidity readings",
  "cropRecommendations": [
    "Specific actionable recommendation 1 with exact values",
    "Specific actionable recommendation 2 with exact values",
    "Specific actionable recommendation 3 with exact values",
    "Specific actionable recommendation 4 with exact values"
  ],
  "immediateActions": ["Urgent action 1 if any readings are critical — leave empty array if all optimal"],
  "seasonalOutlook": "Outlook for the next 4–6 weeks based on measured conditions and typical seasonal pattern for the location",
  "harvestReadiness": "Assessment of harvest readiness or time-to-harvest based on growth stage${growthStage ? ` (${growthStage})` : ""} and current crop condition",
  "referenceStandard": "${cropRef.icarRef}"
}`;

  const aiResp = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: aiPrompt }],
  });

  let aiAnalysis: Record<string, unknown> = {};
  try {
    aiAnalysis = JSON.parse(aiResp.choices[0]?.message?.content ?? "{}");
  } catch { aiAnalysis = { overallAssessment: "Analysis unavailable." }; }

  // Attach the reference standard if AI didn't include it
  if (!aiAnalysis.referenceStandard) aiAnalysis.referenceStandard = cropRef.icarRef;

  // ── Save batch record ────────────────────────────────────────────────────
  const [batch] = await db.insert(farmSensorBatches).values({
    farmId: id, batchId, source,
    fileName: fileName ?? null,
    rowCount: records.length,
    summary,
    aiAnalysis,
  }).returning();

  res.status(201).json({ batch, summary, avgStatuses, overallHealthScore, perRecordAnalysis, aiAnalysis });
});

// ── DELETE /api/farms/:id/sensors/:batchId ───────────────────────────────────
router.delete("/farms/:id/sensors/:batchId", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { batchId } = req.params;
  await db.delete(farmSensorReadings).where(and(eq(farmSensorReadings.farmId, id), eq(farmSensorReadings.batchId, batchId)));
  await db.delete(farmSensorBatches).where(and(eq(farmSensorBatches.farmId, id), eq(farmSensorBatches.batchId, batchId)));
  res.sendStatus(204);
});

export default router;
