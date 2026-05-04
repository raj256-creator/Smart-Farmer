import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

interface SoilClimateRecord {
  label?: string;
  ph?: number | null;
  moisture?: number | null;
  temperature?: number | null;
  humidity?: number | null;
}

// ── Ideal ranges per metric ───────────────────────────────────────────────────
const RANGES = {
  ph:          { optimal: [6.0, 7.5],  warning: [5.5, 8.0],  unit: "",    name: "pH Level" },
  moisture:    { optimal: [40, 70],    warning: [25, 85],     unit: "%",   name: "Soil Moisture" },
  temperature: { optimal: [18, 30],    warning: [10, 38],     unit: "°C",  name: "Temperature" },
  humidity:    { optimal: [50, 80],    warning: [30, 90],     unit: "%",   name: "Humidity" },
};

type MetricKey = keyof typeof RANGES;

function classifyValue(key: MetricKey, value: number | null | undefined): "optimal" | "warning" | "critical" | "missing" {
  if (value == null || isNaN(value)) return "missing";
  const r = RANGES[key];
  if (value >= r.optimal[0] && value <= r.optimal[1]) return "optimal";
  if (value >= r.warning[0] && value <= r.warning[1]) return "warning";
  return "critical";
}

function avg(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => n != null && !isNaN(n));
  if (!valid.length) return null;
  return parseFloat((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
}

router.post("/soil-climate/analyze", async (req, res): Promise<void> => {
  const { records, cropContext = [] } = req.body as {
    records: SoilClimateRecord[];
    cropContext?: string[];
  };

  if (!records?.length) {
    res.status(400).json({ error: "At least one record is required" });
    return;
  }

  // ── Per-record classification ─────────────────────────────────────────────
  const perRecordAnalysis = records.map((rec, i) => {
    const label = rec.label?.trim() || `Reading ${i + 1}`;
    const statuses = {
      ph:          classifyValue("ph",          rec.ph),
      moisture:    classifyValue("moisture",    rec.moisture),
      temperature: classifyValue("temperature", rec.temperature),
      humidity:    classifyValue("humidity",    rec.humidity),
    };
    const alerts: string[] = [];
    if (statuses.ph === "critical")
      alerts.push(`pH ${rec.ph} is ${(rec.ph ?? 0) < RANGES.ph.warning[0] ? "severely acidic" : "severely alkaline"} — immediate soil amendment needed`);
    else if (statuses.ph === "warning")
      alerts.push(`pH ${rec.ph} is slightly ${(rec.ph ?? 0) < RANGES.ph.optimal[0] ? "acidic" : "alkaline"} — consider lime or sulphur application`);

    if (statuses.moisture === "critical")
      alerts.push(`Moisture ${rec.moisture}% is ${(rec.moisture ?? 50) < RANGES.moisture.warning[0] ? "critically low — drought stress likely" : "critically high — root rot risk"}`);
    else if (statuses.moisture === "warning")
      alerts.push(`Moisture ${rec.moisture}% is ${(rec.moisture ?? 50) < RANGES.moisture.optimal[0] ? "below optimal — increase irrigation" : "above optimal — reduce irrigation"}`);

    if (statuses.temperature === "critical")
      alerts.push(`Temperature ${rec.temperature}°C is ${(rec.temperature ?? 25) < RANGES.temperature.warning[0] ? "too cold — frost protection needed" : "too hot — heat stress risk"}`);
    else if (statuses.temperature === "warning")
      alerts.push(`Temperature ${rec.temperature}°C is ${(rec.temperature ?? 25) < RANGES.temperature.optimal[0] ? "cooler than ideal" : "warmer than ideal"} for most crops`);

    if (statuses.humidity === "critical")
      alerts.push(`Humidity ${rec.humidity}% is ${(rec.humidity ?? 60) < RANGES.humidity.warning[0] ? "critically low — transpiration stress" : "critically high — fungal disease risk"}`);
    else if (statuses.humidity === "warning")
      alerts.push(`Humidity ${rec.humidity}% is ${(rec.humidity ?? 60) < RANGES.humidity.optimal[0] ? "below optimal" : "above optimal"}`);

    return { label, statuses, alerts, values: rec };
  });

  // ── Summary averages ──────────────────────────────────────────────────────
  const summary = {
    recordCount:     records.length,
    avgPh:           avg(records.map((r) => r.ph)),
    avgMoisture:     avg(records.map((r) => r.moisture)),
    avgTemperature:  avg(records.map((r) => r.temperature)),
    avgHumidity:     avg(records.map((r) => r.humidity)),
  };

  const avgStatuses = {
    ph:          classifyValue("ph",          summary.avgPh),
    moisture:    classifyValue("moisture",    summary.avgMoisture),
    temperature: classifyValue("temperature", summary.avgTemperature),
    humidity:    classifyValue("humidity",    summary.avgHumidity),
  };

  // ── Overall score (0-100) ─────────────────────────────────────────────────
  const scoreMap = { optimal: 100, warning: 55, critical: 10, missing: 50 };
  const metricScores = Object.values(avgStatuses).map((s) => scoreMap[s]);
  const overallHealthScore = Math.round(metricScores.reduce((a, b) => a + b, 0) / metricScores.length);

  // ── AI narrative ──────────────────────────────────────────────────────────
  const dataDesc = records.slice(0, 20).map((r, i) => {
    const lbl = r.label || `R${i + 1}`;
    return `${lbl}: pH=${r.ph ?? "N/A"}, moisture=${r.moisture ?? "N/A"}%, temp=${r.temperature ?? "N/A"}°C, humidity=${r.humidity ?? "N/A"}%`;
  }).join("\n");

  const aiPrompt = `You are an expert soil and climate analyst for agriculture. Analyze the following sensor readings:

Crops grown: ${cropContext.length ? cropContext.join(", ") : "mixed / unspecified"}
Number of readings: ${records.length}
Average pH: ${summary.avgPh ?? "N/A"}, Average Moisture: ${summary.avgMoisture ?? "N/A"}%, Average Temperature: ${summary.avgTemperature ?? "N/A"}°C, Average Humidity: ${summary.avgHumidity ?? "N/A"}%

Sample readings (up to 20):
${dataDesc}

Return a JSON object (no markdown) with:
{
  "trendInsights": "<2-3 sentences describing patterns and trends across the readings>",
  "overallAssessment": "<1-2 sentences overall soil-climate health summary>",
  "cropRecommendations": ["<specific actionable recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "immediateActions": ["<urgent action if any critical values>", "<action 2>"],
  "seasonalOutlook": "<1 sentence forecast or advice based on current conditions>"
}`;

  const aiResp = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 800,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: aiPrompt }],
  });
  const aiData = JSON.parse(aiResp.choices[0]?.message?.content ?? "{}");

  res.json({
    summary,
    avgStatuses,
    overallHealthScore,
    perRecordAnalysis,
    trendInsights:       aiData.trendInsights ?? "",
    overallAssessment:   aiData.overallAssessment ?? "",
    cropRecommendations: aiData.cropRecommendations ?? [],
    immediateActions:    aiData.immediateActions ?? [],
    seasonalOutlook:     aiData.seasonalOutlook ?? "",
    ranges: RANGES,
  });
});

export default router;
