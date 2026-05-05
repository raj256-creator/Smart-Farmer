import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface SoilClimateRecord {
  label?: string;
  ph?: number | null;
  moisture?: number | null;
  temperature?: number | null;
  humidity?: number | null;
}

interface WeatherForecastDay {
  date: string;
  dayLabel: string;
  tempMax: number;
  tempMin: number;
  humidity: number;
  rainMm: number;
  rainProbPct: number;
  description: string;
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

// ── Weather forecast fetcher ──────────────────────────────────────────────────
async function fetchWeatherForecast(location: string, apiKey: string): Promise<WeatherForecastDay[] | null> {
  try {
    const geoRes = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`
    );
    if (!geoRes.ok) return null;
    const geoData = await geoRes.json() as Array<{ lat: number; lon: number; name: string }>;
    if (!geoData.length) return null;
    const { lat, lon } = geoData[0];

    const frcRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=40&appid=${apiKey}`
    );
    if (!frcRes.ok) return null;
    const frcData = await frcRes.json() as {
      list: Array<{
        dt: number;
        main: { temp: number; humidity: number };
        weather: Array<{ description: string }>;
        rain?: { "3h"?: number };
        pop: number;
      }>;
    };

    const dayMap = new Map<string, {
      temps: number[]; humidity: number[];
      rainMm: number; popMax: number; description: string;
    }>();

    for (const f of frcData.list) {
      const dayKey = new Date(f.dt * 1000).toISOString().slice(0, 10);
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, { temps: [], humidity: [], rainMm: 0, popMax: 0, description: f.weather[0]?.description ?? "" });
      }
      const day = dayMap.get(dayKey)!;
      day.temps.push(f.main.temp);
      day.humidity.push(f.main.humidity);
      day.rainMm += f.rain?.["3h"] ?? 0;
      day.popMax = Math.max(day.popMax, f.pop);
      const hour = new Date(f.dt * 1000).getUTCHours();
      if (hour >= 11 && hour <= 14) {
        day.description = f.weather[0]?.description ?? day.description;
      }
    }

    return Array.from(dayMap.entries()).slice(0, 7).map(([date, d]) => ({
      date,
      dayLabel: new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
      tempMax:     Math.round(Math.max(...d.temps)),
      tempMin:     Math.round(Math.min(...d.temps)),
      humidity:    Math.round(d.humidity.reduce((a, b) => a + b, 0) / d.humidity.length),
      rainMm:      parseFloat(d.rainMm.toFixed(1)),
      rainProbPct: Math.round(d.popMax * 100),
      description: d.description,
    }));
  } catch (err) {
    logger.warn({ err }, "Weather fetch failed for soil-climate analysis");
    return null;
  }
}

router.post("/soil-climate/analyze", async (req, res): Promise<void> => {
  const { records, cropContext = [], location } = req.body as {
    records: SoilClimateRecord[];
    cropContext?: string[];
    location?: string;
  };

  if (!records?.length) {
    res.status(400).json({ error: "At least one record is required" });
    return;
  }

  // ── Fetch weather forecast in parallel with classification ────────────────
  const apiKey = process.env["OPENWEATHER_API_KEY"];
  const weatherPromise = (location && apiKey)
    ? fetchWeatherForecast(location, apiKey)
    : Promise.resolve(null);

  // ── Per-record classification ─────────────────────────────────────────────
  const perRecordAnalysis = records.map((rec, i) => {
    const label = rec.label?.trim() || `Day ${i + 1}`;
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

  // ── Await weather + build AI narrative ───────────────────────────────────
  const weatherForecast = await weatherPromise;

  const dataDesc = records.slice(0, 20).map((r, i) => {
    const lbl = r.label || `Day ${i + 1}`;
    return `${lbl}: pH=${r.ph ?? "N/A"}, moisture=${r.moisture ?? "N/A"}%, temp=${r.temperature ?? "N/A"}°C, humidity=${r.humidity ?? "N/A"}%`;
  }).join("\n");

  const weatherSection = weatherForecast?.length
    ? `\n\nWeather forecast for coming days (${location}):\n${weatherForecast.map((d) =>
        `${d.dayLabel}: max ${d.tempMax}°C / min ${d.tempMin}°C, humidity ${d.humidity}%, rain ${d.rainMm}mm (${d.rainProbPct}% chance), ${d.description}`
      ).join("\n")}\n\nUsing this weather forecast, predict how the sensor metrics (pH, moisture, temperature, humidity) will trend over the coming days and provide weather-aware advice.`
    : "";

  const aiPrompt = `You are an expert soil and climate analyst for agriculture. The data below represents day-by-day sensor readings from a farm field.

Crops grown: ${cropContext.length ? cropContext.join(", ") : "mixed / unspecified"}
Number of days recorded: ${records.length}
Average pH: ${summary.avgPh ?? "N/A"}, Average Moisture: ${summary.avgMoisture ?? "N/A"}%, Average Temperature: ${summary.avgTemperature ?? "N/A"}°C, Average Humidity: ${summary.avgHumidity ?? "N/A"}%

Day-wise readings:
${dataDesc}
${weatherSection}

Return a JSON object (no markdown) with:
{
  "trendInsights": "<2-4 sentences describing day-by-day patterns, trends, and how the metrics are changing over time${weatherForecast ? ", incorporating the weather forecast" : ""}>",
  "weatherTrendInsight": "${weatherForecast ? "<2-3 sentences specifically about how the upcoming weather will affect soil pH, moisture, and crop health>" : ""}",
  "overallAssessment": "<1-2 sentences overall soil-climate health summary>",
  "cropRecommendations": ["<specific actionable recommendation 1>", "<recommendation 2>", "<recommendation 3>"],
  "immediateActions": ["<urgent action if any critical values>", "<action 2>"],
  "seasonalOutlook": "<1 sentence forecast or advice based on current conditions${weatherForecast ? " and weather forecast" : ""}>"
}`;

  const aiResp = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 900,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: aiPrompt }],
  });
  const aiData = JSON.parse(aiResp.choices[0]?.message?.content ?? "{}");

  res.json({
    summary,
    avgStatuses,
    overallHealthScore,
    perRecordAnalysis,
    trendInsights:        aiData.trendInsights ?? "",
    weatherTrendInsight:  aiData.weatherTrendInsight ?? "",
    overallAssessment:    aiData.overallAssessment ?? "",
    cropRecommendations:  aiData.cropRecommendations ?? [],
    immediateActions:     aiData.immediateActions ?? [],
    seasonalOutlook:      aiData.seasonalOutlook ?? "",
    weatherForecast:      weatherForecast ?? null,
    ranges: RANGES,
  });
});

export default router;
