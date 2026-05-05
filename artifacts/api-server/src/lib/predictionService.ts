// ── Realistic agricultural bounds ─────────────────────────────────────────────

export type MetricKey = "ph" | "moisture" | "temperature" | "humidity";

export const METRIC_BOUNDS: Record<MetricKey, { min: number; max: number }> = {
  ph:          { min: 4,  max: 9   },
  moisture:    { min: 0,  max: 100 },
  humidity:    { min: 0,  max: 100 },
  temperature: { min: 10, max: 50  },
};

// Maximum realistic change per day for each metric
export const MAX_DAILY_CHANGE: Record<MetricKey, number> = {
  ph:          0.2,
  moisture:    10,
  humidity:    10,
  temperature: 2,
};

// Damping factor — reduces how aggressively the trend is extrapolated
const DAMPING_FACTOR = 0.3;

// ── Core math helpers ─────────────────────────────────────────────────────────

/**
 * Clamp a value within [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Apply a moving-average smoother to an array.
 * Each output point is the average of up to `window` preceding points
 * (causal, so no future data is used).
 */
export function smoothMovingAverage(values: number[], window = 3): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

/**
 * Average step-wise trend: mean of consecutive differences.
 * More robust than (last - first) because it uses all data points.
 */
export function calculateStepwiseTrend(values: number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    sum += values[i] - values[i - 1];
  }
  return sum / (values.length - 1);
}

// ── Prediction result type ────────────────────────────────────────────────────

export type SafePrediction = {
  days: number;
  value: number;
  /** True if the raw extrapolated value exceeded the realistic bounds */
  clamped: boolean;
  /** True if per-day rate limiting was the binding constraint */
  rateLimited: boolean;
};

// ── Main safe-prediction function ─────────────────────────────────────────────

/**
 * Predict future values for a metric using a safe, constrained pipeline:
 *
 * 1. Smooth historical values (moving average).
 * 2. Compute average step-wise trend.
 * 3. Apply damping factor to reduce aggressiveness.
 * 4. Rate-limit the per-day change.
 * 5. Clamp to realistic agricultural bounds.
 *
 * If fewer than 3 data points are available the function returns the last known
 * value (no extrapolation) to avoid wild guesses.
 */
export function predictSafe(
  metric: MetricKey,
  rawValues: number[],
  forecastDays: number[]
): SafePrediction[] {
  const { min, max } = METRIC_BOUNDS[metric];
  const maxDailyChange = MAX_DAILY_CHANGE[metric];

  // Not enough data — return last known value, no extrapolation
  if (rawValues.length < 3) {
    const lastVal = clamp(rawValues[rawValues.length - 1] ?? 0, min, max);
    return forecastDays.map((d) => ({
      days: d,
      value: parseFloat(lastVal.toFixed(2)),
      clamped: false,
      rateLimited: false,
    }));
  }

  // Step 1 — smooth
  const smoothed = smoothMovingAverage(rawValues, 3);

  // Step 2 — average step-wise trend (per batch step, NOT per day)
  const trendPerStep = calculateStepwiseTrend(smoothed);

  // Baseline: last smoothed value
  const baseline = smoothed[smoothed.length - 1];

  return forecastDays.map((d) => {
    // Step 3 — apply damping
    const dampedChange = trendPerStep * DAMPING_FACTOR * d;

    // Step 4 — apply rate limit
    const maxChange = maxDailyChange * d;
    const limitedChange =
      dampedChange > 0
        ? Math.min(dampedChange, maxChange)
        : Math.max(dampedChange, -maxChange);

    const wasRateLimited = Math.abs(limitedChange) < Math.abs(dampedChange);
    const rawPredicted = baseline + limitedChange;

    // Step 5 — clamp to realistic bounds
    const finalValue = clamp(rawPredicted, min, max);
    const wasClamped = Math.abs(finalValue - rawPredicted) > 0.001;

    return {
      days: d,
      value: parseFloat(finalValue.toFixed(2)),
      clamped: wasClamped,
      rateLimited: wasRateLimited,
    };
  });
}
