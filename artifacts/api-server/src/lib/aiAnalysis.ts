import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

const CROPS = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"] as const;
type CropType = typeof CROPS[number];

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

const IDEAL_PH: Record<CropType, [number, number]> = {
  Mango: [5.5, 7.5], "Dragon Fruit": [6.0, 7.5], Chikoo: [6.0, 8.0],
  Pomegranate: [5.5, 7.5], Mulberry: [6.0, 7.5],
};
const IDEAL_TEMP: Record<CropType, [number, number]> = {
  Mango: [21, 35], "Dragon Fruit": [18, 35], Chikoo: [20, 38],
  Pomegranate: [18, 35], Mulberry: [15, 30],
};
const IDEAL_NITROGEN: Record<CropType, [number, number]> = {
  Mango: [120, 280], "Dragon Fruit": [80, 200], Chikoo: [100, 250],
  Pomegranate: [100, 260], Mulberry: [150, 350],
};
const IDEAL_PHOSPHORUS: Record<CropType, [number, number]> = {
  Mango: [20, 60], "Dragon Fruit": [15, 50], Chikoo: [20, 55],
  Pomegranate: [20, 60], Mulberry: [25, 65],
};
const IDEAL_POTASSIUM: Record<CropType, [number, number]> = {
  Mango: [150, 400], "Dragon Fruit": [100, 300], Chikoo: [120, 350],
  Pomegranate: [150, 400], Mulberry: [100, 280],
};
const YIELD_RANGES: Record<CropType, [number, number]> = {
  Mango: [50, 300], "Dragon Fruit": [20, 120], Chikoo: [40, 200],
  Pomegranate: [30, 180], Mulberry: [10, 80],
};
const HARVEST_DAYS: Record<CropType, Record<string, [number, number]>> = {
  Mango:         { Seedling: [300, 400], Vegetative: [200, 300], Flowering: [90, 120], Fruiting: [40, 80], Mature: [10, 30] },
  "Dragon Fruit":{ Seedling: [200, 300], Vegetative: [150, 200], Flowering: [30, 50],  Fruiting: [20, 35], Mature: [5, 15] },
  Chikoo:        { Seedling: [250, 350], Vegetative: [180, 250], Flowering: [120, 180],Fruiting: [60, 90], Mature: [15, 30] },
  Pomegranate:   { Seedling: [300, 400], Vegetative: [200, 300], Flowering: [100, 150],Fruiting: [50, 80], Mature: [10, 25] },
  Mulberry:      { Seedling: [120, 180], Vegetative: [60, 120],  Flowering: [30, 60],  Fruiting: [15, 30], Mature: [5, 15] },
};

function buildSystemPrompt(): string {
  return `You are an advanced AI-based Smart Farming Assistant. Analyze crop health using structured agricultural parameters and provide accurate insights, disease detection, and actionable recommendations.
Respond ONLY with a valid JSON object. No markdown, no extra text.
Required JSON schema:
{"cropType":string,"growthStage":"Seedling"|"Vegetative"|"Flowering"|"Fruiting"|"Mature","healthStatus":"Excellent"|"Good"|"Fair"|"Poor"|"Critical","diseaseDetected":string|null,"diseaseConfidence":number|null,"diseaseSymptoms":string|null,"diseaseCause":string|null,"nutrientDeficiency":string|null,"yieldImpact":"No Impact"|"Slight Reduction"|"Moderate Loss"|"Severe Loss","yieldPredictionKg":number,"harvestDaysRemaining":number,"confidence":number,"analysisNotes":string,"recommendations":string[]}
Rules: confidence 0.0–1.0, yieldPredictionKg in kg, harvestDaysRemaining integer, recommendations: 4–6 specific strings.`;
}

function buildUserPrompt(cropType: string, soil: SoilInput, climate: ClimateInput): string {
  const soilLines = [
    soil.phLevel != null ? `pH: ${soil.phLevel}` : null,
    soil.moisturePercent != null ? `Moisture: ${soil.moisturePercent}%` : null,
    soil.nitrogenPpm != null ? `Nitrogen: ${soil.nitrogenPpm} ppm` : null,
    soil.phosphorusPpm != null ? `Phosphorus: ${soil.phosphorusPpm} ppm` : null,
    soil.potassiumPpm != null ? `Potassium: ${soil.potassiumPpm} ppm` : null,
    soil.organicMatterPercent != null ? `Organic Matter: ${soil.organicMatterPercent}%` : null,
  ].filter(Boolean).join(", ");

  const climateLines = [
    climate.temperatureCelsius != null ? `Temperature: ${climate.temperatureCelsius}°C` : null,
    climate.humidityPercent != null ? `Humidity: ${climate.humidityPercent}%` : null,
    climate.rainfallMm != null ? `Rainfall: ${climate.rainfallMm} mm` : null,
    climate.windSpeedKmh != null ? `Wind: ${climate.windSpeedKmh} km/h` : null,
    climate.sunlightHours != null ? `Sunlight: ${climate.sunlightHours} hrs/day` : null,
  ].filter(Boolean).join(", ");

  const cropKey = CROPS.includes(cropType as CropType) ? cropType as CropType : "Mango";
  const [phLo, phHi] = IDEAL_PH[cropKey];
  const [tLo, tHi] = IDEAL_TEMP[cropKey];
  const [nLo, nHi] = IDEAL_NITROGEN[cropKey];
  const [pLo, pHi] = IDEAL_PHOSPHORUS[cropKey];
  const [kLo, kHi] = IDEAL_POTASSIUM[cropKey];
  const [yMin, yMax] = YIELD_RANGES[cropKey];

  return `Analyze this crop data and return JSON.
Crop: ${cropType}
Soil: ${soilLines || "No soil data."}
Climate: ${climateLines || "No climate data."}
Ideal ranges for ${cropType}: pH ${phLo}–${phHi}, Temp ${tLo}–${tHi}°C, N ${nLo}–${nHi} ppm, P ${pLo}–${pHi} ppm, K ${kLo}–${kHi} ppm, Yield ${yMin}–${yMax} kg/season.
Respond ONLY with the JSON object.`;
}

function parseGptResponse(raw: string, cropType: CropType, growthStageFallback: string): AnalysisResult {
  let parsed: Record<string, unknown>;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    throw new Error("Failed to parse GPT JSON response");
  }

  const growthStage = (typeof parsed.growthStage === "string" && parsed.growthStage) || growthStageFallback;
  const harvestDayRange = HARVEST_DAYS[cropType][growthStage] ?? [60, 120];
  const harvestDaysRemaining = typeof parsed.harvestDaysRemaining === "number"
    ? Math.round(parsed.harvestDaysRemaining)
    : Math.round((harvestDayRange[0] + harvestDayRange[1]) / 2);

  const harvestDate = new Date();
  harvestDate.setDate(harvestDate.getDate() + harvestDaysRemaining);
  const windowEnd = new Date(harvestDate);
  windowEnd.setDate(windowEnd.getDate() + 14);
  const harvestWindow = `${harvestDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${windowEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  return {
    cropType: (typeof parsed.cropType === "string" && parsed.cropType) || cropType,
    growthStage,
    healthStatus: (typeof parsed.healthStatus === "string" && parsed.healthStatus) || "Fair",
    diseaseDetected: (typeof parsed.diseaseDetected === "string" && parsed.diseaseDetected !== "null") ? parsed.diseaseDetected : null,
    nutrientDeficiency: (typeof parsed.nutrientDeficiency === "string" && parsed.nutrientDeficiency !== "null") ? parsed.nutrientDeficiency : null,
    yieldPredictionKg: typeof parsed.yieldPredictionKg === "number" ? Math.round(parsed.yieldPredictionKg) : 100,
    harvestDaysRemaining,
    harvestWindow,
    confidence: typeof parsed.confidence === "number" ? Math.round(parsed.confidence * 100) / 100 : 0.85,
    analysisNotes: (typeof parsed.analysisNotes === "string" && parsed.analysisNotes) || "",
    recommendations: Array.isArray(parsed.recommendations) ? (parsed.recommendations as string[]).slice(0, 6) : [],
  };
}

export async function runAIAnalysis(
  providedCropType: string | null | undefined,
  imageUrl: string | null | undefined,
  soil: SoilInput,
  climate: ClimateInput
): Promise<AnalysisResult> {
  const cropType: CropType = (CROPS.includes(providedCropType as CropType) ? providedCropType : "Mango") as CropType;
  logger.info({ cropType }, "Running OpenAI crop analysis");

  type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" } };
  const contentParts: ContentPart[] = [{ type: "text", text: buildUserPrompt(cropType, soil, climate) }];
  if (imageUrl?.startsWith("data:image/")) {
    contentParts.push({ type: "image_url", image_url: { url: imageUrl, detail: "high" } });
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: contentParts },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  return parseGptResponse(raw, cropType, "Vegetative");
}

export async function generateChatResponse(
  message: string,
  cropType?: string | null,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
  farmContext?: string | null
): Promise<{ reply: string; suggestions: string[] }> {
  const systemPrompt = `You are an AI Agriculture Assistant providing accurate, practical, farming guidance for Indian farmers.

${farmContext ? `Farm Context:\n${farmContext}\n` : ""}
${cropType ? `Current crop focus: ${cropType}. Prioritize advice for this crop.` : ""}

Capabilities: crop guidance, disease & pest support, soil health, irrigation scheduling, yield optimization.

Structure your reply with these sections where applicable:
- Understanding the Problem
- Key Insights
- Solution (step-by-step)
- Prevention Tips
- Extra Advice

Always end with a JSON block on the last line:
SUGGESTIONS_JSON: ["question 1", "question 2", "question 3", "question 4"]`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      ...(history ?? []),
      { role: "user", content: message },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const suggestionsMatch = raw.match(/SUGGESTIONS_JSON:\s*(\[[\s\S]*?\])/);
  let suggestions: string[] = [];
  let reply = raw;

  if (suggestionsMatch) {
    try {
      suggestions = JSON.parse(suggestionsMatch[1]);
      reply = raw.slice(0, raw.indexOf("SUGGESTIONS_JSON:")).trim();
    } catch { reply = raw; }
  }

  if (!suggestions.length) {
    suggestions = [
      "How often should I irrigate?",
      "What fertilizer should I use at flowering?",
      "How do I identify disease early?",
      "When is the best time to harvest?",
    ];
  }

  return { reply, suggestions: suggestions.slice(0, 4) };
}
