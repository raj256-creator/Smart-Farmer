import { Router, type IRouter } from "express";
import { db, farms } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateFarmBody, UpdateFarmBody } from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

function parseId(params: Record<string, string>): number | null {
  const n = parseInt(params.id, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// ── Area unit conversions → acres ─────────────────────────────────────────────
const UNIT_TO_ACRES: Record<string, number> = {
  acres:    1,
  hectares: 2.47105,
  bigha:    0.619,        // standard North India bigha
  guntha:   0.025,        // 40 gunthas = 1 acre
  cent:     0.01,         // 100 cents = 1 acre
  kanal:    0.125,        // 8 kanals = 1 acre (Punjab/HP)
  marla:    0.00625,      // 160 marlas = 1 acre
  biswa:    0.031,        // 32 biswas = 1 bigha (varies)
  sqm:      0.000247105,  // square metres
  sqft:     0.0000229568, // square feet
};

const SQM_PER_ACRE = 4046.86;

// ── Crop data: spacing in metres, yield, price ─────────────────────────────
const CROP_DATA: Record<string, {
  spacingM: { low: [number, number]; medium: [number, number]; high: [number, number] };
  yieldKgPerPlant: number;
  priceInrPerKg: number;
  spacingLabel: { low: string; medium: string; high: string };
}> = {
  "Mango": {
    spacingM:    { low: [10, 10], medium: [6.5, 6.5], high: [5, 5] },
    yieldKgPerPlant: 80,
    priceInrPerKg: 50,
    spacingLabel: { low: "10×10 m", medium: "6.5×6.5 m", high: "5×5 m" },
  },
  "Dragon Fruit": {
    spacingM:    { low: [5, 2], medium: [3, 2], high: [2, 2] },
    yieldKgPerPlant: 15,
    priceInrPerKg: 120,
    spacingLabel: { low: "5×2 m", medium: "3×2 m", high: "2×2 m" },
  },
  "Chikoo": {
    spacingM:    { low: [8, 8], medium: [6, 6], high: [5, 5] },
    yieldKgPerPlant: 90,
    priceInrPerKg: 40,
    spacingLabel: { low: "8×8 m", medium: "6×6 m", high: "5×5 m" },
  },
  "Pomegranate": {
    spacingM:    { low: [5, 4], medium: [4, 3], high: [3, 2] },
    yieldKgPerPlant: 35,
    priceInrPerKg: 80,
    spacingLabel: { low: "5×4 m", medium: "4×3 m", high: "3×2 m" },
  },
  "Mulberry": {
    spacingM:    { low: [3, 2], medium: [2, 1.5], high: [1.5, 1] },
    yieldKgPerPlant: 12,
    priceInrPerKg: 30,
    spacingLabel: { low: "3×2 m", medium: "2×1.5 m", high: "1.5×1 m" },
  },
};

// ── Health condition yield multiplier bands ────────────────────────────────
const HEALTH_BANDS: Record<string, {
  worst: number; best: number; label: string; description: string;
}> = {
  excellent: { worst: 0.90, best: 1.05, label: "Excellent", description: "Optimal soil nutrients, consistent irrigation, and proactive pest management produce near-maximum yield." },
  good:      { worst: 0.68, best: 0.88, label: "Good",      description: "Crops are well-managed with minor stress; slightly below-peak conditions." },
  fair:      { worst: 0.42, best: 0.65, label: "Fair",      description: "Moderate disease pressure, water stress, or soil deficiencies limiting productivity." },
  poor:      { worst: 0.22, best: 0.40, label: "Poor",      description: "Severe stress from disease, drought, pest damage, or poor soil health significantly reduces yield." },
};

// Seasonal weather variance applied on top of health band (±5%)
const WEATHER_VARIANCE = 0.05;

// ── Farm CRUD ─────────────────────────────────────────────────────────────────
router.get("/farms", async (_req, res): Promise<void> => {
  const rows = await db.select().from(farms).orderBy(farms.createdAt);
  res.json(rows);
});

router.post("/farms", async (req, res): Promise<void> => {
  const body = CreateFarmBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [farm] = await db.insert(farms).values(body.data).returning();
  res.status(201).json(farm);
});

router.get("/farms/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [farm] = await db.select().from(farms).where(eq(farms.id, id));
  if (!farm) { res.status(404).json({ error: "Farm not found" }); return; }
  res.json(farm);
});

router.put("/farms/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdateFarmBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [farm] = await db
    .update(farms)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(farms.id, id))
    .returning();
  if (!farm) { res.status(404).json({ error: "Farm not found" }); return; }
  res.json(farm);
});

router.delete("/farms/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(farms).where(eq(farms.id, id));
  res.sendStatus(204);
});

// ── Farm Dashboard ─────────────────────────────────────────────────────────────
router.get("/farms/:id/dashboard", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [farm] = await db.select().from(farms).where(eq(farms.id, id));
  if (!farm) { res.status(404).json({ error: "Farm not found" }); return; }

  const cropList = (farm.crops as string[]) ?? [];

  const aiPrompt = `You are an agriculture AI. Given this farm:
Farm: ${farm.name}, Location: ${farm.location}, Acreage: ${farm.acreage ?? "unknown"} acres
Crops: ${cropList.join(", ") || "not specified"}
Status: ${farm.status}

Return a JSON object (no markdown) with:
{
  "healthScore": <integer 60-95>,
  "cropHealthMap": [{"crop": "<name>", "health": "<Good|Fair|Poor>", "score": <int>}],
  "weatherInsights": {"temperature": "<range>", "humidity": "<range>", "rainfall": "<amount>", "advisory": "<1 sentence>"},
  "soilInsights": {"ph": "<value>", "nitrogen": "<level>", "phosphorus": "<level>", "potassium": "<level>", "advisory": "<1 sentence>"},
  "recentAlerts": [{"type": "<Disease|Pest|Weather|Soil>", "message": "<text>", "severity": "<low|medium|high>"}],
  "performanceTrend": [{"month": "<MMM>", "yield": <number>, "health": <int>}] (last 6 months),
  "aiInsights": "<2-3 sentence personalized insight>"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: aiPrompt }],
  });

  const dashData = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  res.json({ farm, ...dashData });
});

// ── Farm Analytics ─────────────────────────────────────────────────────────────
router.get("/farms/:id/analytics", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const [farm] = await db.select().from(farms).where(eq(farms.id, id));
  if (!farm) { res.status(404).json({ error: "Farm not found" }); return; }

  const cropList = (farm.crops as string[]) ?? [];
  const acreage = parseFloat(farm.acreage ?? "5");

  const aiPrompt = `You are an agriculture analytics AI. Analyze this farm:
Farm: ${farm.name}, Location: ${farm.location}, Acreage: ${acreage} acres
Crops: ${cropList.join(", ") || "mixed"}

Return a JSON object (no markdown) with:
{
  "yieldPrediction": {
    "totalEstimatedKg": <number>,
    "bycrops": [{"crop": "<name>", "estimatedKg": <number>, "confidence": "<Low|Medium|High>"}],
    "seasonalOutlook": "<1 sentence>"
  },
  "riskAlerts": [{"risk": "<title>", "level": "<low|medium|high>", "description": "<text>", "action": "<text>"}],
  "cropComparison": [{"crop": "<name>", "profitabilityScore": <1-100>, "marketDemand": "<Low|Medium|High>", "avgYieldKgPerAcre": <num>, "estimatedRevenuePerAcre": <num>}],
  "trendData": [{"month": "<MMM>", "yield": <number>, "rainfall": <number>, "healthScore": <int>}] (12 months),
  "aiRecommendations": "<3-4 personalized sentences>"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: aiPrompt }],
  });

  const analyticsData = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  res.json(analyticsData);
});

// ── Yield Optimization (with unit conversion, plant-area calc, health range) ──
router.post("/farms/:id/yield-optimization", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const {
    areaValue,
    areaUnit = "acres",
    selectedCrops,
    spacingPreference = "medium",
    healthCondition = "good",
  } = req.body as {
    areaValue: number;
    areaUnit?: string;
    selectedCrops: string[];
    spacingPreference?: string;
    healthCondition?: string;
  };

  if (!areaValue || !selectedCrops?.length) {
    res.status(400).json({ error: "areaValue and selectedCrops are required" });
    return;
  }

  // Convert to acres
  const convFactor = UNIT_TO_ACRES[areaUnit] ?? 1;
  const totalAcres = areaValue * convFactor;
  const totalSqM   = totalAcres * SQM_PER_ACRE;

  const spacing = (["low", "medium", "high"].includes(spacingPreference)
    ? spacingPreference : "medium") as "low" | "medium" | "high";
  const health  = (["excellent", "good", "fair", "poor"].includes(healthCondition)
    ? healthCondition : "good") as keyof typeof HEALTH_BANDS;

  const band = HEALTH_BANDS[health];
  const sqmPerCrop = totalSqM / selectedCrops.length;
  const acresPerCrop = totalAcres / selectedCrops.length;

  let totalPlants = 0;
  let nominalYieldKg = 0;

  const cropBreakdown = selectedCrops.map((crop) => {
    const data = CROP_DATA[crop] ?? {
      spacingM: { low: [5, 4] as [number,number], medium: [4, 3] as [number,number], high: [3, 2] as [number,number] },
      yieldKgPerPlant: 20,
      priceInrPerKg: 50,
      spacingLabel: { low: "5×4 m", medium: "4×3 m", high: "3×2 m" },
    };

    const [rowM, plantM] = data.spacingM[spacing];
    const plantAreaSqM = rowM * plantM;
    const plants = Math.floor(sqmPerCrop / plantAreaSqM);

    const nominalKg = plants * data.yieldKgPerPlant;

    // Health + weather variance range
    const worstKg = Math.round(nominalKg * (band.worst - WEATHER_VARIANCE));
    const bestKg  = Math.round(nominalKg * (band.best  + WEATHER_VARIANCE));

    const worstRevenue = Math.round(worstKg * data.priceInrPerKg);
    const bestRevenue  = Math.round(bestKg  * data.priceInrPerKg);

    totalPlants   += plants;
    nominalYieldKg += nominalKg;

    return {
      crop,
      allocatedAcres:  parseFloat(acresPerCrop.toFixed(2)),
      plantAreaSqM:    parseFloat(plantAreaSqM.toFixed(2)),
      spacingInfo:     data.spacingLabel[spacing],
      totalPlants:     plants,
      yieldKgPerPlant: data.yieldKgPerPlant,
      nominalYieldKg:  Math.round(nominalKg),
      worstCaseYieldKg: worstKg,
      bestCaseYieldKg:  bestKg,
      worstCaseRevenueInr: worstRevenue,
      bestCaseRevenueInr:  bestRevenue,
      priceInrPerKg:   data.priceInrPerKg,
    };
  });

  const totalWorstKg  = cropBreakdown.reduce((s, c) => s + c.worstCaseYieldKg, 0);
  const totalBestKg   = cropBreakdown.reduce((s, c) => s + c.bestCaseYieldKg, 0);
  const totalWorstInr = cropBreakdown.reduce((s, c) => s + c.worstCaseRevenueInr, 0);
  const totalBestInr  = cropBreakdown.reduce((s, c) => s + c.bestCaseRevenueInr, 0);

  // Optimal distribution (by nominal revenue per acre)
  const sorted = [...cropBreakdown].sort((a, b) => {
    const ra = (a.worstCaseRevenueInr + a.bestCaseRevenueInr) / 2 / a.allocatedAcres;
    const rb = (b.worstCaseRevenueInr + b.bestCaseRevenueInr) / 2 / b.allocatedAcres;
    return rb - ra;
  });
  const totalAvgRev = sorted.reduce((s, c) =>
    s + (c.worstCaseRevenueInr + c.bestCaseRevenueInr) / 2 / c.allocatedAcres, 0);
  const optimalDistribution = sorted.map((c) => {
    const avg = (c.worstCaseRevenueInr + c.bestCaseRevenueInr) / 2 / c.allocatedAcres;
    return {
      crop: c.crop,
      percentage: parseFloat(((avg / totalAvgRev) * 100).toFixed(1)),
      reasoning: `Mid-range revenue: INR ${Math.round(avg).toLocaleString()}/acre`,
    };
  });

  // Explain the yield range
  const rangeReasons = [
    `Health condition is "${band.label}" — ${band.description}`,
    `Seasonal weather variation of ±5% applied on top of health factors (drought, unseasonal rain, heat waves).`,
    `Best case assumes timely irrigation, effective pest/disease control, and good pollination success.`,
    `Worst case accounts for 1-2 stress events (water deficit, moderate pest attack, or partial crop failure).`,
    `Per-plant area determines actual plant count: each ${spacing}-density plant occupies ${cropBreakdown[0]?.plantAreaSqM.toFixed(1) ?? "N/A"} sq.m on average.`,
  ];

  const suggestions = [
    `Total of ${totalPlants.toLocaleString()} plants across ${totalAcres.toFixed(2)} acres (${areaValue} ${areaUnit}).`,
    `Yield range: ${(totalWorstKg / 1000).toFixed(1)}t – ${(totalBestKg / 1000).toFixed(1)}t depending on health and weather.`,
    `Revenue range: INR ${totalWorstInr.toLocaleString()} – INR ${totalBestInr.toLocaleString()} per season.`,
    sorted[0] ? `${sorted[0].crop} offers the highest return per acre — consider allocating more land to it.` : "",
    `Improving crop health from "${band.label}" to "Excellent" could boost yield by up to ${Math.round((HEALTH_BANDS.excellent.best - band.worst) * 100)}%.`,
    `Install drip irrigation to reduce water usage by up to 40% while maintaining optimal soil moisture.`,
  ].filter(Boolean);

  res.json({
    inputSummary: {
      areaValue,
      areaUnit,
      totalAcres: parseFloat(totalAcres.toFixed(3)),
      totalSqM:   Math.round(totalSqM),
      spacingPreference: spacing,
      healthCondition: band.label,
      healthDescription: band.description,
    },
    totalPlants,
    yieldRangeKg:    { worst: totalWorstKg, best: totalBestKg },
    revenueRangeInr: { worst: totalWorstInr, best: totalBestInr },
    nominalYieldKg:  Math.round(nominalYieldKg),
    rangeReasons,
    cropBreakdown,
    optimalDistribution,
    optimizationSuggestions: suggestions,
  });
});

export default router;
