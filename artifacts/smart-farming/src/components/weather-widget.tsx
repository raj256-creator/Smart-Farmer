import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Cloud, Droplets, Wind, Thermometer, Eye,
  AlertTriangle, Info, XCircle, RefreshCw, Clock,
} from "lucide-react";

// ── Custom error ─────────────────────────────────────────────────────────────

class WeatherError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

type DayForecast = {
  date: string;
  dayLabel: string;
  tempMax: number;
  tempMin: number;
  humidity: number;
  rainMm: number;
  rainProbPct: number;
  rainCategory: string;
  icon: string;
  description: string;
};

type WeatherData = {
  location: { city: string; country: string };
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    pressure: number;
    windSpeed: number;
    visibility: number | null;
    description: string;
    icon: string;
    rainMm1h: number;
  };
  forecast: {
    rainNext24hMm: number;
    rainNext3dMm: number;
    maxTempNext3d: number;
    minTempNext3d: number;
    avgHumidityNext3d: number;
    daily: DayForecast[];
  };
  insights: Array<{ type: "info" | "warning" | "critical"; message: string }>;
  fetchedAt: string;
};

// ── Insight severity styles ───────────────────────────────────────────────────

const INSIGHT_STYLES = {
  info:     { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-800",   icon: Info,          iconColor: "text-blue-500" },
  warning:  { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-800",  icon: AlertTriangle, iconColor: "text-amber-500" },
  critical: { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-800",    icon: XCircle,       iconColor: "text-red-500" },
};

const RAIN_COLORS: Record<string, string> = {
  none:     "text-muted-foreground",
  light:    "text-sky-500",
  moderate: "text-blue-600",
  heavy:    "text-blue-800",
};

// ── Main widget ───────────────────────────────────────────────────────────────

interface WeatherWidgetProps {
  location: string;
  sensorMoisture?: number | null;
  sensorHumidity?: number | null;
}

export function WeatherWidget({ location, sensorMoisture, sensorHumidity }: WeatherWidgetProps) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const params = new URLSearchParams({ location });
  if (sensorMoisture != null) params.set("moisture", String(sensorMoisture));
  if (sensorHumidity != null) params.set("humidity", String(sensorHumidity));

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["weather", location, sensorMoisture, sensorHumidity],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/weather?${params}`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string; message?: string };
        throw new WeatherError(body.error ?? "unknown", body.message ?? `HTTP ${r.status}`);
      }
      return r.json() as Promise<WeatherData>;
    },
    enabled: !!location,
    staleTime: 25 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cloud className="w-4 h-4" />Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="grid grid-cols-5 gap-2">
            {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    const isPending = (error instanceof WeatherError && error.code === "api_key_pending")
      || (error instanceof WeatherError && error.code === "unknown" && error.message.includes("401"));
    return (
      <Card className={isPending ? "border-amber-200 bg-amber-50/30" : "border-red-200 bg-red-50/30"}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-500" />Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isPending ? (
            <div className="flex items-start gap-3 text-sm text-amber-800">
              <Clock className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <div className="space-y-1">
                <p className="font-medium">Weather API key activating…</p>
                <p className="text-xs text-amber-700">New OpenWeatherMap keys take up to 2 hours to activate after account creation. Weather data will appear here automatically once ready.</p>
                <button onClick={() => void refetch()} className="text-xs text-amber-700 underline mt-1 hover:text-amber-900">Check again</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm text-red-700">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>Weather data unavailable. Check API key or location name.</span>
              <button onClick={() => void refetch()} className="ml-auto text-xs underline">Retry</button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const { current, forecast, insights } = data;
  const updatedTime = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-500" />
            Weather — {data.location.city}, {data.location.country}
          </CardTitle>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh weather"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current conditions */}
        <div className="flex items-center gap-4">
          <div className="text-5xl leading-none">{current.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold">{current.temp}°C</span>
              <span className="text-sm text-muted-foreground pb-1">Feels {current.feelsLike}°C</span>
            </div>
            <p className="text-sm text-muted-foreground capitalize">{current.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground shrink-0">
            <span className="flex items-center gap-1"><Droplets className="w-3 h-3 text-sky-500" />{current.humidity}%</span>
            <span className="flex items-center gap-1"><Wind className="w-3 h-3" />{current.windSpeed} km/h</span>
            {current.visibility != null && (
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{current.visibility} km</span>
            )}
            <span className="flex items-center gap-1"><Thermometer className="w-3 h-3 text-orange-400" />{current.pressure} hPa</span>
          </div>
        </div>

        {/* Rain summary strip */}
        {(forecast.rainNext24hMm > 0 || forecast.rainNext3dMm > 0) && (
          <div className="flex items-center gap-3 text-xs bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
            <Droplets className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <span className="text-sky-800">
              Rain: <strong>{forecast.rainNext24hMm.toFixed(1)} mm</strong> next 24 h ·{" "}
              <strong>{forecast.rainNext3dMm.toFixed(1)} mm</strong> next 3 days
            </span>
          </div>
        )}

        {/* 5-day forecast */}
        <div className="grid grid-cols-5 gap-1.5">
          {forecast.daily.slice(0, 5).map((day) => (
            <div
              key={day.date}
              className="flex flex-col items-center gap-1 rounded-lg bg-muted/40 border border-border px-1 py-2 text-center"
            >
              <p className="text-[10px] font-medium text-muted-foreground leading-tight">
                {day.dayLabel.split(" ")[0]}
              </p>
              <span className="text-xl leading-none">{day.icon}</span>
              <p className="text-xs font-bold">{day.tempMax}°</p>
              <p className="text-[10px] text-muted-foreground">{day.tempMin}°</p>
              {day.rainProbPct > 0 && (
                <p className={`text-[10px] font-medium ${RAIN_COLORS[day.rainCategory]}`}>
                  {day.rainProbPct}%
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Agri insights */}
        {insights.length > 0 && (
          <div className="space-y-2">
            {insights.map((ins, i) => {
              const s = INSIGHT_STYLES[ins.type] ?? INSIGHT_STYLES.info;
              const Icon = s.icon;
              return (
                <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2.5 border text-sm ${s.bg} ${s.border}`}>
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.iconColor}`} />
                  <span className={s.text}>{ins.message}</span>
                </div>
              );
            })}
          </div>
        )}

        {updatedTime && (
          <p className="text-[10px] text-muted-foreground text-right">
            Updated {updatedTime} · cached 30 min
          </p>
        )}
      </CardContent>
    </Card>
  );
}
