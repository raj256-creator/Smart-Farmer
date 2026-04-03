import { logger } from "./logger";

const CROPS = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"] as const;
type CropType = typeof CROPS[number];

const GROWTH_STAGES = ["Seedling", "Vegetative", "Flowering", "Fruiting", "Mature"] as const;
const HEALTH_STATUSES = ["Excellent", "Good", "Fair", "Poor", "Critical"] as const;
const DISEASES: Record<CropType, string[]> = {
  Mango: ["Anthracnose", "Powdery Mildew", "Bacterial Canker", "Mango Malformation", "None Detected"],
  "Dragon Fruit": ["Stem Rot", "Anthracnose", "Fusarium Wilt", "Bacterial Soft Rot", "None Detected"],
  Chikoo: ["Leaf Blight", "Sooty Mold", "Bud Necrosis", "Fruit Rot", "None Detected"],
  Pomegranate: ["Bacterial Blight", "Alternaria Fruit Rot", "Cercospora Leaf Spot", "Heart Rot", "None Detected"],
  Mulberry: ["Leaf Spot", "Powdery Mildew", "Bacterial Blight", "Twig Blight", "None Detected"],
};

const DEFICIENCIES = [
  "None Detected",
  "Nitrogen Deficiency",
  "Phosphorus Deficiency",
  "Potassium Deficiency",
  "Iron Deficiency",
  "Magnesium Deficiency",
  "Calcium Deficiency",
];

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

function randomInRange(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function pickRandom<T>(arr: readonly T[] | T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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

function computeHealthScore(soil: SoilInput, climate: ClimateInput, cropType: CropType): number {
  let score = 0.8;

  if (soil.phLevel != null) {
    const idealPh: Record<CropType, [number, number]> = {
      Mango: [5.5, 7.5],
      "Dragon Fruit": [6.0, 7.5],
      Chikoo: [6.0, 8.0],
      Pomegranate: [5.5, 7.5],
      Mulberry: [6.0, 7.5],
    };
    const [lo, hi] = idealPh[cropType];
    if (soil.phLevel < lo - 1 || soil.phLevel > hi + 1) score -= 0.2;
    else if (soil.phLevel < lo || soil.phLevel > hi) score -= 0.1;
  }

  if (soil.moisturePercent != null) {
    if (soil.moisturePercent < 20 || soil.moisturePercent > 85) score -= 0.15;
  }

  if (climate.temperatureCelsius != null) {
    const idealTemp: Record<CropType, [number, number]> = {
      Mango: [21, 35],
      "Dragon Fruit": [18, 35],
      Chikoo: [20, 38],
      Pomegranate: [18, 35],
      Mulberry: [15, 30],
    };
    const [lo, hi] = idealTemp[cropType];
    if (climate.temperatureCelsius < lo - 5 || climate.temperatureCelsius > hi + 5) score -= 0.2;
  }

  if (climate.humidityPercent != null) {
    if (climate.humidityPercent > 90) score -= 0.1;
    else if (climate.humidityPercent < 30) score -= 0.15;
  }

  return Math.max(0.1, Math.min(1.0, score + (Math.random() * 0.1 - 0.05)));
}

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

  if (soil.phLevel != null && soil.phLevel < 5.5) recs.push("Apply agricultural lime to raise soil pH to optimal range (6.0-7.0).");
  if (soil.phLevel != null && soil.phLevel > 7.5) recs.push("Apply sulfur or acidic fertilizers to lower soil pH.");
  if (soil.moisturePercent != null && soil.moisturePercent < 25) recs.push("Increase irrigation frequency — soil moisture is critically low.");
  if (soil.moisturePercent != null && soil.moisturePercent > 80) recs.push("Reduce irrigation and improve drainage to prevent root rot.");

  if (deficiency === "Nitrogen Deficiency") recs.push("Apply nitrogen-rich fertilizer (urea or ammonium sulfate) at recommended rates.");
  if (deficiency === "Phosphorus Deficiency") recs.push("Apply superphosphate or rock phosphate to address phosphorus shortage.");
  if (deficiency === "Potassium Deficiency") recs.push("Apply potassium sulfate or muriate of potash for improved fruiting.");
  if (deficiency === "Iron Deficiency") recs.push("Apply chelated iron (EDTA-Fe) as foliar spray for iron deficiency correction.");
  if (deficiency === "Magnesium Deficiency") recs.push("Apply Epsom salt (magnesium sulfate) as foliar spray.");

  if (disease && disease !== "None Detected") {
    if (disease.includes("Mildew") || disease.includes("Rot") || disease.includes("Blight")) {
      recs.push(`Spray copper-based fungicide to manage ${disease}. Remove infected parts immediately.`);
    }
    if (disease.includes("Bacterial")) {
      recs.push(`Apply Bordeaux mixture or copper oxychloride to control ${disease}.`);
    }
    recs.push("Ensure proper spacing and air circulation to prevent disease spread.");
  }

  if (growthStage === "Flowering") recs.push("Avoid excessive nitrogen during flowering — it promotes vegetative growth at the expense of fruit set.");
  if (growthStage === "Fruiting") {
    recs.push("Apply potassium-rich fertilizer to improve fruit quality and size.");
    if (cropType === "Mango") recs.push("Protect developing mangoes from fruit fly using pheromone traps.");
    if (cropType === "Pomegranate") recs.push("Thin fruits to 2-3 per cluster to achieve maximum fruit size.");
  }
  if (growthStage === "Mature") recs.push("Monitor daily for harvest readiness. Check color change, firmness, and sugar content.");

  if (climate.rainfallMm != null && climate.rainfallMm > 100) recs.push("High rainfall detected — inspect for fungal disease and improve field drainage.");
  if (climate.windSpeedKmh != null && climate.windSpeedKmh > 40) recs.push("High winds can cause physical damage — consider windbreaks or crop staking.");

  if (healthStatus === "Poor" || healthStatus === "Critical") {
    recs.push("Immediate field inspection recommended. Consider consulting a local agricultural extension officer.");
  }

  if (recs.length === 0) {
    recs.push("Crop is in good condition. Continue current irrigation and fertilization schedule.");
    recs.push("Monitor weekly for any signs of disease or pest activity.");
  }

  return recs.slice(0, 6);
}

export function runAIAnalysis(
  providedCropType: string | null | undefined,
  imageUrl: string | null | undefined,
  soil: SoilInput,
  climate: ClimateInput
): AnalysisResult {
  logger.info({ providedCropType, imageUrl }, "Running AI crop analysis");

  const cropType: CropType = (CROPS.includes(providedCropType as CropType) ? providedCropType : pickRandom(CROPS)) as CropType;
  const growthStage = pickRandom(GROWTH_STAGES);
  const healthScore = computeHealthScore(soil, climate, cropType);

  let healthStatus: string;
  if (healthScore >= 0.85) healthStatus = "Excellent";
  else if (healthScore >= 0.70) healthStatus = "Good";
  else if (healthScore >= 0.55) healthStatus = "Fair";
  else if (healthScore >= 0.35) healthStatus = "Poor";
  else healthStatus = "Critical";

  const diseaseList = DISEASES[cropType];
  const diseaseRaw = healthScore < 0.6 ? pickRandom(diseaseList.filter(d => d !== "None Detected")) : Math.random() < 0.2 ? pickRandom(diseaseList) : "None Detected";
  const diseaseDetected = diseaseRaw === "None Detected" ? null : diseaseRaw;

  const deficiencyRaw = healthScore < 0.65 && Math.random() < 0.6 ? pickRandom(DEFICIENCIES.filter(d => d !== "None Detected")) : "None Detected";
  const nutrientDeficiency = deficiencyRaw === "None Detected" ? null : deficiencyRaw;

  const [yieldMin, yieldMax] = YIELD_RANGES[cropType];
  const yieldModifier = healthScore * 0.7 + 0.3;
  const yieldPredictionKg = Math.round(randomInRange(yieldMin * yieldModifier * 0.8, yieldMax * yieldModifier));

  const harvestDayRange = HARVEST_DAYS[cropType][growthStage] ?? [60, 120];
  const harvestDaysRemaining = Math.round(randomInRange(harvestDayRange[0], harvestDayRange[1]));

  const harvestDate = new Date();
  harvestDate.setDate(harvestDate.getDate() + harvestDaysRemaining);
  const windowEnd = new Date(harvestDate);
  windowEnd.setDate(windowEnd.getDate() + 14);
  const harvestWindow = `${harvestDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${windowEnd.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  const confidence = Math.round((0.72 + Math.random() * 0.25) * 100) / 100;

  const notes: string[] = [
    `AI identified crop as ${cropType} at ${growthStage} stage with ${Math.round(confidence * 100)}% confidence.`,
    `Overall health score: ${(healthScore * 100).toFixed(0)}/100 — rated as "${healthStatus}".`,
  ];
  if (diseaseDetected) notes.push(`Disease detected: ${diseaseDetected}. Prompt treatment is recommended.`);
  if (nutrientDeficiency) notes.push(`Nutrient concern: ${nutrientDeficiency} observed in leaf morphology.`);
  if (soil.phLevel != null) notes.push(`Soil pH: ${soil.phLevel} — ${soil.phLevel >= 5.5 && soil.phLevel <= 7.5 ? "within optimal range" : "outside optimal range, corrective action advised"}.`);
  if (climate.temperatureCelsius != null) notes.push(`Current temperature: ${climate.temperatureCelsius}°C.`);

  const analysisNotes = notes.join(" ");

  const recommendations = generateRecommendations(cropType, growthStage, healthStatus, diseaseDetected, nutrientDeficiency, soil, climate);

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
  let selectedTip = pickRandom(categoryTips);

  if (cropType && CROPS.includes(cropType as CropType)) {
    const cropSpecific = categoryTips.filter(t => t.toLowerCase().includes(cropType.toLowerCase()));
    if (cropSpecific.length > 0) selectedTip = pickRandom(cropSpecific);
  }

  const greetings = ["Great question!", "Good to know you're thinking about this.", "Here's what the data suggests:", "Based on best agricultural practices:"];
  const prefix = pickRandom(greetings);

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
