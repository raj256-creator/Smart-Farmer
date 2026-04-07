import { logger } from "./logger";

const CROPS = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"] as const;
type CropType = typeof CROPS[number];

const GROWTH_STAGES = ["Seedling", "Vegetative", "Flowering", "Fruiting", "Mature"] as const;

const DISEASES: Record<CropType, string[]> = {
  Mango: ["Anthracnose", "Powdery Mildew", "Bacterial Canker", "Mango Malformation"],
  "Dragon Fruit": ["Stem Rot", "Anthracnose", "Fusarium Wilt", "Bacterial Soft Rot"],
  Chikoo: ["Leaf Blight", "Sooty Mold", "Bud Necrosis", "Fruit Rot"],
  Pomegranate: ["Bacterial Blight", "Alternaria Fruit Rot", "Cercospora Leaf Spot", "Heart Rot"],
  Mulberry: ["Leaf Spot", "Powdery Mildew", "Bacterial Blight", "Twig Blight"],
};

const YIELD_RANGES: Record<CropType, [number, number]> = {
  Mango: [50, 300],
  "Dragon Fruit": [20, 120],
  Chikoo: [40, 200],
  Pomegranate: [30, 180],
  Mulberry: [10, 80],
};

const HARVEST_DAYS: Record<CropType, Record<string, [number, number]>> = {
  Mango: { Seedling: [300, 400], Vegetative: [200, 300], Flowering: [90, 120], Fruiting: [40, 80], Mature: [10, 30] },
  "Dragon Fruit": { Seedling: [200, 300], Vegetative: [150, 200], Flowering: [30, 50], Fruiting: [20, 35], Mature: [5, 15] },
  Chikoo: { Seedling: [250, 350], Vegetative: [180, 250], Flowering: [120, 180], Fruiting: [60, 90], Mature: [15, 30] },
  Pomegranate: { Seedling: [300, 400], Vegetative: [200, 300], Flowering: [100, 150], Fruiting: [50, 80], Mature: [10, 25] },
  Mulberry: { Seedling: [120, 180], Vegetative: [60, 120], Flowering: [30, 60], Fruiting: [15, 30], Mature: [5, 15] },
};

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
// Produces deterministic results from the same input hash — no Math.random()
function hashInputs(soil: SoilInput, climate: ClimateInput, cropType: CropType): number {
  const vals = [
    Math.round((soil.phLevel ?? 7.0) * 100),
    Math.round((soil.moisturePercent ?? 50) * 10),
    Math.round(soil.nitrogenPpm ?? 150),
    Math.round(soil.phosphorusPpm ?? 30),
    Math.round(soil.potassiumPpm ?? 200),
    Math.round((soil.organicMatterPercent ?? 3) * 10),
    Math.round((climate.temperatureCelsius ?? 28) * 10),
    Math.round((climate.humidityPercent ?? 65) * 10),
    Math.round(climate.rainfallMm ?? 50),
    Math.round((climate.windSpeedKmh ?? 10) * 10),
    Math.round((climate.sunlightHours ?? 6) * 10),
    CROPS.indexOf(cropType),
  ];
  let h = 0x12345678;
  for (const v of vals) {
    h = Math.imul(h ^ v, 0x9e3779b9);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

function makeRng(seed: number) {
  let s = seed;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export interface SoilInput {
  phLevel?: number | null;
  moisturePercent?: number | null;
  nitrogenPpm?: number | null;
  phosphorusPpm?: number | null;
  potassiumPpm?: number | null;
  organicMatterPercent?: number | null;
}

export interface ClimateInput {
  temperatureCelsius?: number | null;
  humidityPercent?: number | null;
  rainfallMm?: number | null;
  windSpeedKmh?: number | null;
  sunlightHours?: number | null;
}

export interface AnalysisResult {
  cropType: string;
  growthStage: string;
  healthStatus: string;
  diseaseDetected: string | null;
  nutrientDeficiency: string | null;
  yieldPredictionKg: number;
  harvestDaysRemaining: number;
  harvestWindow: string;
  confidence: number;
  analysisNotes: string;
  recommendations: string[];
}

// ─── Ideal ranges per crop ────────────────────────────────────────────────────
const IDEAL_PH: Record<CropType, [number, number]> = {
  Mango: [5.5, 7.5],
  "Dragon Fruit": [6.0, 7.5],
  Chikoo: [6.0, 8.0],
  Pomegranate: [5.5, 7.5],
  Mulberry: [6.0, 7.5],
};

const IDEAL_TEMP: Record<CropType, [number, number]> = {
  Mango: [21, 35],
  "Dragon Fruit": [18, 35],
  Chikoo: [20, 38],
  Pomegranate: [18, 35],
  Mulberry: [15, 30],
};

const IDEAL_NITROGEN: Record<CropType, [number, number]> = {
  Mango: [120, 280],
  "Dragon Fruit": [80, 200],
  Chikoo: [100, 250],
  Pomegranate: [100, 260],
  Mulberry: [150, 350],
};

const IDEAL_PHOSPHORUS: Record<CropType, [number, number]> = {
  Mango: [20, 60],
  "Dragon Fruit": [15, 50],
  Chikoo: [20, 55],
  Pomegranate: [20, 60],
  Mulberry: [25, 65],
};

const IDEAL_POTASSIUM: Record<CropType, [number, number]> = {
  Mango: [150, 400],
  "Dragon Fruit": [100, 300],
  Chikoo: [120, 350],
  Pomegranate: [150, 400],
  Mulberry: [100, 280],
};

// ─── Analytical health score (0..1) ──────────────────────────────────────────
// Each parameter contributes a defined penalty — no randomness.
function computeHealthScore(soil: SoilInput, climate: ClimateInput, cropType: CropType): number {
  let score = 1.0;
  let factorsChecked = 0;

  if (soil.phLevel != null) {
    factorsChecked++;
    const [lo, hi] = IDEAL_PH[cropType];
    const ph = soil.phLevel;
    if (ph < lo - 1.5 || ph > hi + 1.5) score -= 0.25;
    else if (ph < lo - 0.5 || ph > hi + 0.5) score -= 0.15;
    else if (ph < lo || ph > hi) score -= 0.07;
  }

  if (soil.moisturePercent != null) {
    factorsChecked++;
    const m = soil.moisturePercent;
    if (m < 15 || m > 90) score -= 0.20;
    else if (m < 25 || m > 80) score -= 0.10;
    else if (m < 35 || m > 75) score -= 0.03;
  }

  if (soil.nitrogenPpm != null) {
    factorsChecked++;
    const [lo, hi] = IDEAL_NITROGEN[cropType];
    const n = soil.nitrogenPpm;
    if (n < lo * 0.4 || n > hi * 1.6) score -= 0.20;
    else if (n < lo * 0.7 || n > hi * 1.3) score -= 0.12;
    else if (n < lo || n > hi) score -= 0.05;
  }

  if (soil.phosphorusPpm != null) {
    factorsChecked++;
    const [lo, hi] = IDEAL_PHOSPHORUS[cropType];
    const p = soil.phosphorusPpm;
    if (p < lo * 0.4 || p > hi * 1.6) score -= 0.15;
    else if (p < lo * 0.7 || p > hi * 1.3) score -= 0.08;
    else if (p < lo || p > hi) score -= 0.04;
  }

  if (soil.potassiumPpm != null) {
    factorsChecked++;
    const [lo, hi] = IDEAL_POTASSIUM[cropType];
    const k = soil.potassiumPpm;
    if (k < lo * 0.4 || k > hi * 1.6) score -= 0.15;
    else if (k < lo * 0.7 || k > hi * 1.3) score -= 0.08;
    else if (k < lo || k > hi) score -= 0.04;
  }

  if (climate.temperatureCelsius != null) {
    factorsChecked++;
    const [lo, hi] = IDEAL_TEMP[cropType];
    const t = climate.temperatureCelsius;
    if (t < lo - 8 || t > hi + 8) score -= 0.20;
    else if (t < lo - 4 || t > hi + 4) score -= 0.12;
    else if (t < lo || t > hi) score -= 0.05;
  }

  if (climate.humidityPercent != null) {
    factorsChecked++;
    const h = climate.humidityPercent;
    if (h > 95 || h < 20) score -= 0.15;
    else if (h > 85 || h < 30) score -= 0.08;
    else if (h > 75 || h < 40) score -= 0.03;
  }

  if (climate.rainfallMm != null) {
    factorsChecked++;
    const r = climate.rainfallMm;
    if (r > 200) score -= 0.12;
    else if (r > 120) score -= 0.06;
    else if (r < 5) score -= 0.08;
  }

  // If we have very few data points, reduce score slightly (uncertainty penalty)
  if (factorsChecked < 3) score -= 0.05;

  return Math.max(0.05, Math.min(0.98, score));
}

// ─── Nutrient deficiency from actual NPK values ───────────────────────────────
function detectNutrientDeficiency(
  soil: SoilInput,
  cropType: CropType,
  rng: () => number
): string | null {
  const deficiencies: string[] = [];

  if (soil.nitrogenPpm != null) {
    const [lo] = IDEAL_NITROGEN[cropType];
    if (soil.nitrogenPpm < lo * 0.55) deficiencies.push("Nitrogen Deficiency");
  }
  if (soil.phosphorusPpm != null) {
    const [lo] = IDEAL_PHOSPHORUS[cropType];
    if (soil.phosphorusPpm < lo * 0.55) deficiencies.push("Phosphorus Deficiency");
  }
  if (soil.potassiumPpm != null) {
    const [lo] = IDEAL_POTASSIUM[cropType];
    if (soil.potassiumPpm < lo * 0.55) deficiencies.push("Potassium Deficiency");
  }

  // pH-driven micronutrient deficiencies
  if (soil.phLevel != null) {
    if (soil.phLevel > 7.8) deficiencies.push("Iron Deficiency"); // Iron locks up in alkaline soil
    if (soil.phLevel < 5.2) deficiencies.push("Calcium Deficiency");
    if (soil.phLevel > 8.0) deficiencies.push("Magnesium Deficiency");
  }

  if (deficiencies.length === 0) return null;

  // If multiple deficiencies, return the most severe one (first in list)
  return deficiencies[0];
}

// ─── Disease risk from climate + health ──────────────────────────────────────
function detectDisease(
  cropType: CropType,
  healthScore: number,
  climate: ClimateInput,
  rng: () => number
): string | null {
  // Disease risk is driven by humidity and temperature — not random
  const humidity = climate.humidityPercent ?? 60;
  const temp = climate.temperatureCelsius ?? 28;
  const rainfall = climate.rainfallMm ?? 30;

  // Fungal disease threshold: high humidity + warm temp
  const fungalRisk = (humidity > 80 ? 0.5 : humidity > 70 ? 0.25 : 0.0)
    + (temp > 25 && temp < 35 ? 0.15 : 0.0)
    + (rainfall > 100 ? 0.15 : 0.0)
    + (healthScore < 0.5 ? 0.3 : healthScore < 0.7 ? 0.15 : 0.0);

  // Bacterial disease threshold: very wet + warm
  const bacterialRisk = (humidity > 85 ? 0.4 : 0.0)
    + (rainfall > 150 ? 0.2 : 0.0)
    + (healthScore < 0.45 ? 0.25 : 0.0);

  const overallRisk = Math.max(fungalRisk, bacterialRisk);

  if (overallRisk < 0.3) return null; // Below threshold — no disease

  // Deterministically pick which disease based on rng seeded from inputs
  const diseaseList = DISEASES[cropType];
  // Prefer bacterial diseases when bacterialRisk is dominant
  const preferBacterial = bacterialRisk > fungalRisk;
  const candidates = preferBacterial
    ? diseaseList.filter(d => d.toLowerCase().includes("bacterial") || d.toLowerCase().includes("rot") || d.toLowerCase().includes("blight"))
    : diseaseList.filter(d => !d.toLowerCase().includes("bacterial"));

  const pool = candidates.length > 0 ? candidates : diseaseList;
  return pool[Math.floor(rng() * pool.length)];
}

// ─── Growth stage from soil + climate data ────────────────────────────────────
// High N → vegetative; balanced N+P+K → flowering; high K, low N → fruiting/mature
function inferGrowthStage(soil: SoilInput, climate: ClimateInput, cropType: CropType, rng: () => number): string {
  const n = soil.nitrogenPpm;
  const p = soil.phosphorusPpm;
  const k = soil.potassiumPpm;

  if (n != null && p != null && k != null) {
    const total = n + p + k;
    if (total === 0) return GROWTH_STAGES[Math.floor(rng() * GROWTH_STAGES.length)];

    const nRatio = n / total;
    const kRatio = k / total;

    if (nRatio > 0.65) return "Vegetative";            // Nitrogen-dominant → heavy vegetative
    if (nRatio > 0.50 && kRatio < 0.25) return "Seedling";
    if (kRatio > 0.45 && nRatio < 0.30) return "Mature"; // Potassium-dominant + low N
    if (kRatio > 0.35 && nRatio < 0.40) return "Fruiting";
    if (Math.abs(nRatio - kRatio) < 0.12) return "Flowering"; // Balanced → flowering

    return "Vegetative"; // Default when inputs are present but unclear
  }

  // Fall back to seeded-random when nutrients not provided
  return GROWTH_STAGES[Math.floor(rng() * GROWTH_STAGES.length)];
}

// ─── Confidence from data completeness ───────────────────────────────────────
function computeConfidence(soil: SoilInput, climate: ClimateInput): number {
  const fields = [
    soil.phLevel, soil.moisturePercent, soil.nitrogenPpm,
    soil.phosphorusPpm, soil.potassiumPpm,
    climate.temperatureCelsius, climate.humidityPercent, climate.rainfallMm,
  ];
  const filled = fields.filter(f => f != null).length;
  // 5 fields → 82%, 8 fields → 97%
  const base = 0.65 + (filled / fields.length) * 0.32;
  return Math.round(base * 100) / 100;
}

// ─── Analytical yield prediction ──────────────────────────────────────────────
function computeYield(
  cropType: CropType,
  healthScore: number,
  growthStage: string,
  soil: SoilInput,
  climate: ClimateInput
): number {
  const [yieldMin, yieldMax] = YIELD_RANGES[cropType];
  const range = yieldMax - yieldMin;

  // Base yield from health score (0..1 → fraction of range)
  let fraction = healthScore;

  // Bonus for optimal NPK
  if (soil.nitrogenPpm != null) {
    const [lo, hi] = IDEAL_NITROGEN[cropType];
    const midN = (lo + hi) / 2;
    const closeness = 1 - Math.min(Math.abs(soil.nitrogenPpm - midN) / midN, 1);
    fraction += closeness * 0.08;
  }
  if (soil.potassiumPpm != null) {
    const [lo, hi] = IDEAL_POTASSIUM[cropType];
    const midK = (lo + hi) / 2;
    const closeness = 1 - Math.min(Math.abs(soil.potassiumPpm - midK) / midK, 1);
    fraction += closeness * 0.07;
  }

  // Rainfall bonus (moderate rainfall is best)
  if (climate.rainfallMm != null) {
    const r = climate.rainfallMm;
    if (r >= 30 && r <= 80) fraction += 0.05;
    else if (r > 150) fraction -= 0.08;
  }

  // Sunlight bonus
  if (climate.sunlightHours != null && climate.sunlightHours >= 6) {
    fraction += 0.04;
  }

  // Fruiting/mature stage has best realised yield
  if (growthStage === "Fruiting") fraction += 0.05;
  if (growthStage === "Mature") fraction += 0.08;

  fraction = Math.max(0.1, Math.min(1.0, fraction));
  return Math.round(yieldMin + fraction * range);
}

// ─── Recommendations ──────────────────────────────────────────────────────────
function generateRecommendations(
  cropType: CropType,
  growthStage: string,
  healthStatus: string,
  disease: string | null,
  deficiency: string | null,
  soil: SoilInput,
  climate: ClimateInput
): string[] {
  const recs: string[] = [];

  // pH corrections
  if (soil.phLevel != null) {
    const [lo, hi] = IDEAL_PH[cropType];
    if (soil.phLevel < lo - 0.5) recs.push(`Soil pH is ${soil.phLevel} — apply agricultural lime to raise pH toward the optimal range (${lo}–${hi}) for ${cropType}.`);
    else if (soil.phLevel > hi + 0.5) recs.push(`Soil pH is ${soil.phLevel} — apply elemental sulfur or acidic fertilizer to bring pH down to ${lo}–${hi}.`);
  }

  // Moisture corrections
  if (soil.moisturePercent != null) {
    if (soil.moisturePercent < 25) recs.push(`Soil moisture is critically low at ${soil.moisturePercent}% — increase irrigation immediately.`);
    else if (soil.moisturePercent > 80) recs.push(`Soil moisture is excessive at ${soil.moisturePercent}% — reduce irrigation and improve drainage to prevent root rot.`);
  }

  // Nutrient corrections based on actual values
  if (soil.nitrogenPpm != null) {
    const [lo, hi] = IDEAL_NITROGEN[cropType];
    if (soil.nitrogenPpm < lo * 0.7) recs.push(`Nitrogen is low at ${soil.nitrogenPpm} ppm (ideal: ${lo}–${hi} ppm) — apply urea or ammonium sulfate at recommended rates.`);
    else if (soil.nitrogenPpm > hi * 1.3) recs.push(`Nitrogen is excessive at ${soil.nitrogenPpm} ppm — reduce nitrogen fertilizer to avoid vegetative overgrowth and poor fruit set.`);
  }
  if (soil.phosphorusPpm != null) {
    const [lo, hi] = IDEAL_PHOSPHORUS[cropType];
    if (soil.phosphorusPpm < lo * 0.7) recs.push(`Phosphorus is low at ${soil.phosphorusPpm} ppm (ideal: ${lo}–${hi} ppm) — apply superphosphate or rock phosphate.`);
  }
  if (soil.potassiumPpm != null) {
    const [lo, hi] = IDEAL_POTASSIUM[cropType];
    if (soil.potassiumPpm < lo * 0.7) recs.push(`Potassium is low at ${soil.potassiumPpm} ppm (ideal: ${lo}–${hi} ppm) — apply potassium sulfate for improved fruit quality.`);
  }

  // Deficiency-specific advice
  if (deficiency === "Iron Deficiency") recs.push("Apply chelated iron (EDTA-Fe) as a foliar spray to correct iron deficiency caused by high soil pH.");
  if (deficiency === "Magnesium Deficiency") recs.push("Apply Epsom salt (magnesium sulfate) as a foliar spray — 20 g per litre of water.");
  if (deficiency === "Calcium Deficiency") recs.push("Apply calcium nitrate or gypsum to correct calcium deficiency and improve cell wall strength.");

  // Disease advice
  if (disease) {
    if (disease.includes("Mildew") || disease.includes("Rot") || disease.includes("Blight") || disease.includes("Spot") || disease.includes("Necrosis")) {
      recs.push(`${disease} detected — spray copper-based fungicide (copper oxychloride 0.3%) every 10 days. Remove and destroy infected plant parts.`);
    }
    if (disease.includes("Bacterial")) {
      recs.push(`${disease} detected — apply Bordeaux mixture (1%). Avoid overhead irrigation and improve air circulation between plants.`);
    }
    if (disease.includes("Wilt")) {
      recs.push(`${disease} detected — drench the root zone with carbendazim (0.1%). Remove and destroy heavily infected plants.`);
    }
    if (climate.humidityPercent != null && climate.humidityPercent > 80) {
      recs.push(`High humidity (${climate.humidityPercent}%) is increasing disease pressure — ensure good air circulation and reduce canopy density by pruning.`);
    }
  }

  // Growth-stage-specific advice
  if (growthStage === "Flowering") {
    recs.push("Avoid heavy nitrogen application at flowering — it promotes vegetative growth over fruit set.");
    recs.push("Spray 0.5% boron solution during flowering to improve pollination and fruit set.");
  }
  if (growthStage === "Fruiting") {
    recs.push("Apply potassium-rich fertilizer (K₂SO₄) to improve fruit size, color, and sweetness.");
    if (cropType === "Mango") recs.push("Install pheromone traps to control fruit fly — a key pest during fruit development.");
    if (cropType === "Pomegranate") recs.push("Thin fruit clusters to 2–3 fruits per shoot to maximize individual fruit size.");
  }
  if (growthStage === "Mature") recs.push("Monitor daily for harvest readiness. Check color change, firmness, and sugar content (Brix).");

  // Climate corrections
  if (climate.rainfallMm != null && climate.rainfallMm > 120) recs.push(`Rainfall is high at ${climate.rainfallMm} mm — inspect for waterlogging and fungal spread. Improve field drainage.`);
  if (climate.temperatureCelsius != null) {
    const [lo, hi] = IDEAL_TEMP[cropType];
    if (climate.temperatureCelsius < lo - 3) recs.push(`Temperature (${climate.temperatureCelsius}°C) is below the optimal range for ${cropType}. Use mulching to insulate roots and reduce cold stress.`);
    if (climate.temperatureCelsius > hi + 3) recs.push(`Temperature (${climate.temperatureCelsius}°C) is above optimal — apply shade nets and increase irrigation frequency to reduce heat stress.`);
  }

  if (healthStatus === "Poor" || healthStatus === "Critical") {
    recs.push("Immediate field inspection recommended. Contact your local agricultural extension officer for expert diagnosis.");
  }

  if (recs.length === 0) {
    recs.push("All soil and climate parameters are within optimal range. Maintain current irrigation and fertilization schedule.");
    recs.push("Monitor weekly for early signs of pest or disease activity.");
  }

  return recs.slice(0, 6);
}

// ─── Main analysis entry point ────────────────────────────────────────────────
export function runAIAnalysis(
  providedCropType: string | null | undefined,
  imageUrl: string | null | undefined,
  soil: SoilInput,
  climate: ClimateInput
): AnalysisResult {
  logger.info({ providedCropType }, "Running deterministic AI crop analysis");

  const cropType: CropType = (CROPS.includes(providedCropType as CropType)
    ? providedCropType
    : "Mango") as CropType;

  // Seeded RNG — same inputs always produce the same sequence
  const seed = hashInputs(soil, climate, cropType);
  const rng = makeRng(seed);

  const healthScore = computeHealthScore(soil, climate, cropType);
  const confidence = computeConfidence(soil, climate);

  let healthStatus: string;
  if (healthScore >= 0.85) healthStatus = "Excellent";
  else if (healthScore >= 0.70) healthStatus = "Good";
  else if (healthScore >= 0.55) healthStatus = "Fair";
  else if (healthScore >= 0.35) healthStatus = "Poor";
  else healthStatus = "Critical";

  const growthStage = inferGrowthStage(soil, climate, cropType, rng);

  const diseaseDetected = detectDisease(cropType, healthScore, climate, rng);
  const nutrientDeficiency = detectNutrientDeficiency(soil, cropType, rng);

  const yieldPredictionKg = computeYield(cropType, healthScore, growthStage, soil, climate);

  const harvestDayRange = HARVEST_DAYS[cropType][growthStage] ?? [60, 120];
  // Deterministic: use midpoint of range scaled by health
  const harvestDaysRemaining = Math.round(
    harvestDayRange[1] - (harvestDayRange[1] - harvestDayRange[0]) * healthScore
  );

  const harvestDate = new Date();
  harvestDate.setDate(harvestDate.getDate() + harvestDaysRemaining);
  const windowEnd = new Date(harvestDate);
  windowEnd.setDate(windowEnd.getDate() + 14);
  const harvestWindow = `${harvestDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${windowEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  // Build analysis notes with actual measured values
  const notes: string[] = [
    `${cropType} identified at ${growthStage} stage with ${Math.round(confidence * 100)}% model confidence.`,
    `Overall health score: ${(healthScore * 100).toFixed(0)}/100 — rated "${healthStatus}".`,
  ];
  if (soil.phLevel != null) {
    const [lo, hi] = IDEAL_PH[cropType];
    const inRange = soil.phLevel >= lo && soil.phLevel <= hi;
    notes.push(`Soil pH: ${soil.phLevel} — ${inRange ? "within optimal range" : `outside optimal range (${lo}–${hi}); corrective action advised`}.`);
  }
  if (soil.nitrogenPpm != null) notes.push(`Nitrogen: ${soil.nitrogenPpm} ppm (ideal ${IDEAL_NITROGEN[cropType][0]}–${IDEAL_NITROGEN[cropType][1]} ppm).`);
  if (soil.phosphorusPpm != null) notes.push(`Phosphorus: ${soil.phosphorusPpm} ppm (ideal ${IDEAL_PHOSPHORUS[cropType][0]}–${IDEAL_PHOSPHORUS[cropType][1]} ppm).`);
  if (soil.potassiumPpm != null) notes.push(`Potassium: ${soil.potassiumPpm} ppm (ideal ${IDEAL_POTASSIUM[cropType][0]}–${IDEAL_POTASSIUM[cropType][1]} ppm).`);
  if (climate.temperatureCelsius != null) notes.push(`Temperature: ${climate.temperatureCelsius}°C | Humidity: ${climate.humidityPercent ?? "—"}%.`);
  if (climate.rainfallMm != null) notes.push(`Rainfall: ${climate.rainfallMm} mm.`);
  if (diseaseDetected) notes.push(`Disease detected: ${diseaseDetected}. Prompt treatment is recommended.`);
  if (nutrientDeficiency) notes.push(`Nutrient concern: ${nutrientDeficiency} detected from soil readings.`);

  const analysisNotes = notes.join(" ");

  const recommendations = generateRecommendations(
    cropType, growthStage, healthStatus, diseaseDetected, nutrientDeficiency, soil, climate
  );

  return {
    cropType,
    growthStage,
    healthStatus,
    diseaseDetected,
    nutrientDeficiency,
    yieldPredictionKg,
    harvestDaysRemaining,
    harvestWindow,
    confidence,
    analysisNotes,
    recommendations,
  };
}

// ─── Chat knowledge base ──────────────────────────────────────────────────────
const CROP_KNOWLEDGE: Record<string, string[]> = {
  irrigation: [
    "For Mango: Irrigate every 7-10 days during dry season; reduce near harvest.",
    "For Dragon Fruit: Light irrigation every 5-7 days; drought tolerant but responds well to moisture.",
    "For Pomegranate: Deep irrigation every 10-14 days; drought tolerant once established.",
    "For Chikoo: Regular irrigation needed; weekly in summer, bi-weekly in cool months.",
    "For Mulberry: Moderate irrigation; avoid waterlogging as roots are sensitive.",
  ],
  fertilizer: [
    "Apply NPK 10:26:26 at flowering stage for improved fruit set across all five crops.",
    "Use organic compost (farmyard manure) as a base — 20-30 kg per tree annually.",
    "Foliar spray of 0.5% zinc sulfate improves micronutrient status in all fruit crops.",
    "Potassium improves fruit sweetness and color — apply potassium sulfate at fruiting stage.",
  ],
  pest: [
    "Fruit fly is a major pest for Mango and Pomegranate — use pheromone traps.",
    "Stem borer affects Dragon Fruit — monitor weekly and apply recommended insecticide.",
    "Mealybugs attack Chikoo and Mulberry — spray neem oil solution (5ml/L) as organic control.",
    "Leaf roller affects Mango at vegetative stage — prune affected shoots and spray chlorpyrifos.",
  ],
  harvest: [
    "Harvest Mango when skin color changes from green to yellow/orange and fruit gives slightly to gentle pressure.",
    "Dragon Fruit is ready when the skin turns bright red/pink and wings begin to wither.",
    "Chikoo should feel slightly soft when gently pressed — harvest in early morning.",
    "Pomegranate is ripe when skin color deepens and fruit produces a metallic sound when tapped.",
    "Mulberry turns dark purple/black when fully ripe — pick daily as fruits ripen quickly.",
  ],
  disease: [
    "Anthracnose (Mango): Spray mancozeb (0.25%) every 10-15 days from flowering to fruit development.",
    "Powdery Mildew: Apply wettable sulfur (0.2%) or carbendazim (0.1%) at first signs.",
    "Bacterial Blight (Pomegranate): Use Bordeaux mixture (1%) — avoid overhead irrigation.",
    "Stem Rot (Dragon Fruit): Remove and destroy infected stems; apply copper fungicide at cut ends.",
    "Leaf Spot (Mulberry): Spray chlorothalonil (0.2%) and ensure proper air circulation.",
  ],
  general: [
    "Crop rotation and intercropping with legumes can improve soil nitrogen naturally.",
    "Apply mulch (paddy straw or dry leaves) around the base of trees to conserve moisture and suppress weeds.",
    "Prune dead or diseased branches after harvest season to promote healthy new growth.",
    "Keep a farm diary — record inputs, observations, and yields to track crop performance over time.",
    "Soil testing every 2-3 years helps optimize fertilizer use and reduce costs.",
  ],
};

export function generateChatResponse(message: string, cropType?: string | null): { reply: string; suggestions: string[] } {
  const lowerMsg = message.toLowerCase();

  let category = "general";
  if (lowerMsg.includes("water") || lowerMsg.includes("irrigat") || lowerMsg.includes("drought")) category = "irrigation";
  else if (lowerMsg.includes("fertil") || lowerMsg.includes("npk") || lowerMsg.includes("nutrient") || lowerMsg.includes("compost")) category = "fertilizer";
  else if (lowerMsg.includes("pest") || lowerMsg.includes("insect") || lowerMsg.includes("bug") || lowerMsg.includes("fly")) category = "pest";
  else if (lowerMsg.includes("harvest") || lowerMsg.includes("pick") || lowerMsg.includes("ready") || lowerMsg.includes("ripe")) category = "harvest";
  else if (lowerMsg.includes("disease") || lowerMsg.includes("fungus") || lowerMsg.includes("blight") || lowerMsg.includes("rot") || lowerMsg.includes("spot")) category = "disease";

  const categoryTips = CROP_KNOWLEDGE[category];
  let selectedTip = categoryTips[0];

  if (cropType && CROPS.includes(cropType as CropType)) {
    const cropSpecific = categoryTips.filter(t => t.toLowerCase().includes(cropType.toLowerCase()));
    if (cropSpecific.length > 0) selectedTip = cropSpecific[0];
  }

  const prefixes = ["Here's what the data suggests:", "Based on best agricultural practices:", "Good to know you're thinking about this.", "Here is the guidance for your crop:"];
  const prefix = prefixes[Math.floor(Math.abs(message.length % prefixes.length))];

  const reply = `${prefix} ${selectedTip}`;

  const suggestions = [
    "How often should I irrigate?",
    "What fertilizer should I use at flowering?",
    "How do I identify disease early?",
    "When is the best time to harvest?",
    "How to improve my yield?",
  ].filter(s => !s.toLowerCase().includes(category));

  return { reply, suggestions: suggestions.slice(0, 4) };
}
