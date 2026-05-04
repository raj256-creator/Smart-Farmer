import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const OWM_BASE = "https://api.openweathermap.org/data/2.5";
const GEO_BASE = "https://api.openweathermap.org/geo/1.0";

// ── In-memory cache: key → { data, expiresAt } ──────────────────────────────
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function weatherIcon(code: number): string {
  if (code >= 200 && code < 300) return "⛈️";
  if (code >= 300 && code < 400) return "🌦️";
  if (code >= 500 && code < 600) return "🌧️";
  if (code >= 600 && code < 700) return "❄️";
  if (code >= 700 && code < 800) return "🌫️";
  if (code === 800) return "☀️";
  if (code === 801) return "🌤️";
  if (code === 802) return "⛅";
  if (code >= 803) return "☁️";
  return "🌡️";
}

function rainCategory(mmPer3h: number): "none" | "light" | "moderate" | "heavy" {
  if (mmPer3h <= 0) return "none";
  if (mmPer3h < 2.5) return "light";
  if (mmPer3h < 7.6) return "moderate";
  return "heavy";
}

// ── Smart agri-insights from weather + optional sensor data ─────────────────
function buildInsights(opts: {
  currentTemp: number;
  currentHumidity: number;
  rainNext24hMm: number;
  rainNext3dMm: number;
  maxTempNext3d: number;
  minTempNext3d: number;
  avgHumidityNext3d: number;
  sensorMoisture?: number | null;
  sensorHumidity?: number | null;
}): Array<{ type: "info" | "warning" | "critical"; message: string }> {
  const insights: Array<{ type: "info" | "warning" | "critical"; message: string }> = [];

  // Rain-based irrigation advice
  if (opts.rainNext24hMm > 5) {
    insights.push({
      type: "info",
      message: `Rain expected in next 24 h (${opts.rainNext24hMm.toFixed(1)} mm) — skip irrigation today.`,
    });
  } else if (opts.rainNext3dMm > 10) {
    insights.push({
      type: "info",
      message: `${opts.rainNext3dMm.toFixed(0)} mm of rain forecast over the next 3 days — reduce irrigation schedule.`,
    });
  } else if (opts.sensorMoisture != null && opts.sensorMoisture < 35) {
    insights.push({
      type: "warning",
      message: `No rain forecast and soil moisture is low (${opts.sensorMoisture}%) — irrigate within 24 h.`,
    });
  }

  // High humidity → fungal disease risk
  const humidity = opts.sensorHumidity ?? opts.currentHumidity;
  if (humidity > 85) {
    insights.push({
      type: "critical",
      message: `Very high humidity (${humidity}%) — critical fungal disease risk. Apply preventive copper-based fungicide.`,
    });
  } else if (humidity > 75) {
    insights.push({
      type: "warning",
      message: `High humidity (${humidity}%) — increased risk of fungal infections. Monitor crop closely.`,
    });
  }

  // Temperature-based crop stress
  if (opts.maxTempNext3d > 38) {
    insights.push({
      type: "critical",
      message: `Heat stress risk — temperatures reaching ${opts.maxTempNext3d}°C. Use shade nets and increase irrigation frequency.`,
    });
  } else if (opts.maxTempNext3d > 33) {
    insights.push({
      type: "warning",
      message: `High temperatures expected (${opts.maxTempNext3d}°C) — consider additional irrigation and monitoring for heat stress.`,
    });
  }

  if (opts.minTempNext3d < 10) {
    insights.push({
      type: "warning",
      message: `Cold nights forecast (${opts.minTempNext3d}°C) — protect frost-sensitive crops with mulching or covers.`,
    });
  }

  // High avg humidity over next 3 days + rain combo
  if (opts.avgHumidityNext3d > 80 && opts.rainNext3dMm > 15) {
    insights.push({
      type: "warning",
      message: `Wet, humid conditions forecast — high risk of root rot and fungal spread. Ensure good drainage.`,
    });
  }

  return insights;
}

// ── GET /api/weather ─────────────────────────────────────────────────────────
router.get("/weather", async (req, res): Promise<void> => {
  const apiKey = process.env["OPENWEATHER_API_KEY"];
  if (!apiKey) {
    res.status(503).json({ error: "Weather API key not configured." });
    return;
  }

  const location = (req.query.location as string | undefined)?.trim();
  const rawMoisture = req.query.moisture as string | undefined;
  const rawHumidity = req.query.humidity as string | undefined;

  if (!location) {
    res.status(400).json({ error: "location query parameter is required" });
    return;
  }

  const sensorMoisture = rawMoisture ? parseFloat(rawMoisture) : null;
  const sensorHumidity = rawHumidity ? parseFloat(rawHumidity) : null;

  const cacheKey = `weather:${location.toLowerCase()}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    // Re-run insights with current sensor data even on cache hit
    const c = cached as ReturnType<typeof buildResponse>;
    const insights = buildInsights({
      currentTemp:       c.current.temp,
      currentHumidity:   c.current.humidity,
      rainNext24hMm:     c.forecast.rainNext24hMm,
      rainNext3dMm:      c.forecast.rainNext3dMm,
      maxTempNext3d:     c.forecast.maxTempNext3d,
      minTempNext3d:     c.forecast.minTempNext3d,
      avgHumidityNext3d: c.forecast.avgHumidityNext3d,
      sensorMoisture,
      sensorHumidity,
    });
    res.json({ ...c, insights, cachedAt: true });
    return;
  }

  // ── Step 1: Geocode the location ──────────────────────────────────────────
  let lat: number, lon: number, resolvedCity: string, resolvedCountry: string;
  try {
    const geoUrl = `${GEO_BASE}/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    if (geoRes.status === 401) {
      res.status(401).json({
        error: "api_key_pending",
        message: "OpenWeatherMap API key is not yet active. New keys can take up to 2 hours to activate. Please try again shortly.",
      });
      return;
    }
    if (!geoRes.ok) throw new Error(`Geocoding failed: ${geoRes.status}`);
    const geoData = await geoRes.json() as Array<{ lat: number; lon: number; name: string; country: string }>;
    if (!geoData.length) {
      res.status(404).json({ error: `Location "${location}" not found.` });
      return;
    }
    lat = geoData[0].lat;
    lon = geoData[0].lon;
    resolvedCity = geoData[0].name;
    resolvedCountry = geoData[0].country;
  } catch (err) {
    logger.error({ err }, "Geocoding error");
    res.status(502).json({ error: "Failed to resolve location." });
    return;
  }

  // ── Step 2: Fetch current weather + 5-day forecast in parallel ────────────
  let currentData: Record<string, unknown>, forecastData: Record<string, unknown>;
  try {
    const [curRes, frcRes] = await Promise.all([
      fetch(`${OWM_BASE}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${apiKey}`),
      fetch(`${OWM_BASE}/forecast?lat=${lat}&lon=${lon}&units=metric&cnt=40&appid=${apiKey}`),
    ]);
    if (!curRes.ok) throw new Error(`Current weather failed: ${curRes.status}`);
    if (!frcRes.ok) throw new Error(`Forecast failed: ${frcRes.status}`);
    currentData = await curRes.json() as Record<string, unknown>;
    forecastData = await frcRes.json() as Record<string, unknown>;
  } catch (err) {
    logger.error({ err }, "Weather fetch error");
    res.status(502).json({ error: "Failed to fetch weather data." });
    return;
  }

  // ── Step 3: Parse current weather ────────────────────────────────────────
  const main = currentData.main as Record<string, number>;
  const wind = currentData.wind as Record<string, number>;
  const weatherArr = currentData.weather as Array<{ id: number; main: string; description: string }>;
  const rainObj = currentData.rain as Record<string, number> | undefined;
  const sysObj = currentData.sys as Record<string, number>;

  const current = {
    temp:        Math.round(main.temp),
    feelsLike:   Math.round(main.feels_like),
    humidity:    main.humidity,
    pressure:    main.pressure,
    windSpeed:   parseFloat((wind.speed * 3.6).toFixed(1)), // m/s → km/h
    windDeg:     wind.deg,
    visibility:  typeof currentData.visibility === "number" ? Math.round(currentData.visibility / 1000) : null,
    description: weatherArr[0]?.description ?? "N/A",
    icon:        weatherIcon(weatherArr[0]?.id ?? 800),
    conditionId: weatherArr[0]?.id ?? 800,
    rainMm1h:    rainObj?.["1h"] ?? 0,
    sunrise:     new Date(sysObj.sunrise * 1000).toISOString(),
    sunset:      new Date(sysObj.sunset * 1000).toISOString(),
  };

  // ── Step 4: Parse 5-day / 3-hour forecast ────────────────────────────────
  type FrcItem = {
    dt: number;
    main: { temp: number; humidity: number };
    weather: Array<{ id: number; description: string }>;
    rain?: { "3h"?: number };
    pop: number; // probability of precipitation 0–1
  };

  const list = forecastData.list as FrcItem[];
  const now = Date.now();
  const next24h = now + 24 * 3600 * 1000;
  const next3d  = now + 3 * 24 * 3600 * 1000;
  const next5d  = now + 5 * 24 * 3600 * 1000;

  const rainNext24hMm = list
    .filter((f) => f.dt * 1000 <= next24h)
    .reduce((s, f) => s + (f.rain?.["3h"] ?? 0), 0);
  const rainNext3dMm = list
    .filter((f) => f.dt * 1000 <= next3d)
    .reduce((s, f) => s + (f.rain?.["3h"] ?? 0), 0);

  const next3dItems = list.filter((f) => f.dt * 1000 <= next3d);
  const maxTempNext3d = next3dItems.length
    ? Math.max(...next3dItems.map((f) => f.main.temp))
    : current.temp;
  const minTempNext3d = next3dItems.length
    ? Math.min(...next3dItems.map((f) => f.main.temp))
    : current.temp;
  const avgHumidityNext3d = next3dItems.length
    ? Math.round(next3dItems.reduce((s, f) => s + f.main.humidity, 0) / next3dItems.length)
    : current.humidity;

  // Build daily forecast (group by day)
  const dayMap = new Map<string, {
    date: string; temps: number[]; humidity: number[];
    rainMm: number; popMax: number; conditionId: number; description: string;
  }>();

  for (const f of list) {
    if (f.dt * 1000 > next5d) break;
    const dayKey = new Date(f.dt * 1000).toISOString().slice(0, 10);
    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, {
        date: dayKey, temps: [], humidity: [], rainMm: 0, popMax: 0,
        conditionId: f.weather[0]?.id ?? 800, description: f.weather[0]?.description ?? "",
      });
    }
    const day = dayMap.get(dayKey)!;
    day.temps.push(f.main.temp);
    day.humidity.push(f.main.humidity);
    day.rainMm += f.rain?.["3h"] ?? 0;
    day.popMax = Math.max(day.popMax, f.pop);
    // Use midday condition if available
    const hour = new Date(f.dt * 1000).getUTCHours();
    if (hour >= 11 && hour <= 14) {
      day.conditionId = f.weather[0]?.id ?? day.conditionId;
      day.description = f.weather[0]?.description ?? day.description;
    }
  }

  const dailyForecast = Array.from(dayMap.values()).map((d) => ({
    date:        d.date,
    dayLabel:    new Date(d.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
    tempMax:     Math.round(Math.max(...d.temps)),
    tempMin:     Math.round(Math.min(...d.temps)),
    humidity:    Math.round(d.humidity.reduce((a, b) => a + b, 0) / d.humidity.length),
    rainMm:      parseFloat(d.rainMm.toFixed(1)),
    rainCategory: rainCategory(d.rainMm),
    rainProbPct: Math.round(d.popMax * 100),
    icon:        weatherIcon(d.conditionId),
    description: d.description,
  }));

  const forecast = {
    rainNext24hMm:     parseFloat(rainNext24hMm.toFixed(1)),
    rainNext3dMm:      parseFloat(rainNext3dMm.toFixed(1)),
    maxTempNext3d:     Math.round(maxTempNext3d),
    minTempNext3d:     Math.round(minTempNext3d),
    avgHumidityNext3d,
    daily:             dailyForecast,
  };

  // ── Step 5: Build agri insights ───────────────────────────────────────────
  const insights = buildInsights({
    currentTemp:       current.temp,
    currentHumidity:   current.humidity,
    rainNext24hMm:     forecast.rainNext24hMm,
    rainNext3dMm:      forecast.rainNext3dMm,
    maxTempNext3d:     forecast.maxTempNext3d,
    minTempNext3d:     forecast.minTempNext3d,
    avgHumidityNext3d: forecast.avgHumidityNext3d,
    sensorMoisture,
    sensorHumidity,
  });

  const response = buildResponse({ resolvedCity, resolvedCountry, lat, lon, current, forecast, insights });
  setCache(cacheKey, response);
  res.json({ ...response, cachedAt: false });
});

type WeatherResponse = ReturnType<typeof buildResponse>;

function buildResponse(opts: {
  resolvedCity: string;
  resolvedCountry: string;
  lat: number;
  lon: number;
  current: {
    temp: number; feelsLike: number; humidity: number; pressure: number;
    windSpeed: number; windDeg: number; visibility: number | null;
    description: string; icon: string; conditionId: number;
    rainMm1h: number; sunrise: string; sunset: string;
  };
  forecast: {
    rainNext24hMm: number; rainNext3dMm: number;
    maxTempNext3d: number; minTempNext3d: number; avgHumidityNext3d: number;
    daily: Array<{
      date: string; dayLabel: string; tempMax: number; tempMin: number;
      humidity: number; rainMm: number; rainCategory: string;
      rainProbPct: number; icon: string; description: string;
    }>;
  };
  insights: Array<{ type: string; message: string }>;
}) {
  return {
    location: {
      city:    opts.resolvedCity,
      country: opts.resolvedCountry,
      lat:     opts.lat,
      lon:     opts.lon,
    },
    current:  opts.current,
    forecast: opts.forecast,
    insights: opts.insights,
    fetchedAt: new Date().toISOString(),
  };
}

export default router;
