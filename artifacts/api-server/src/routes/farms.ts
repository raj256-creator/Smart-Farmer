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

// ── Crop data for yield calculations ────────────────────────────────────────
const CROP_DATA: Record<string, {
  plantsPerAcre: { low: number; medium: number; high: number };
  yieldKgPerPlant: number;
  priceInrPerKg: number;
  spacing: { low: string; medium: string; high: string };
}> = {
  "Mango": {
    plantsPerAcre: { low: 40, medium: 100, high: 160 },
    yieldKgPerPlant: 80,
    priceInrPerKg: 50,
    spacing: { low: "10×10 m", medium: "6.5×6.5 m", high: "5×5 m" },
  },
  "Dragon Fruit": {
    plantsPerAcre: { low: 350, medium: 600, high: 800 },
    yieldKgPerPlant: 15,
    priceInrPerKg: 120,
    spacing: { low: "5×2 m", medium: "3×2 m", high: "2×2 m" },
  },
  "Chikoo": {
    plantsPerAcre: { low: 60, medium: 100, high: 130 },
    yieldKgPerPlant: 90,
    priceInrPerKg: 40,
    spacing: { low: "8×8 m", medium: "6×6 m", high: "5×5 m" },
  },
  "Pomegranate": {
    plantsPerAcre: { low: 130, medium: 200, high: 280 },
    yieldKgPerPlant: 35,
    priceInrPerKg: 80,
    spacing: { low: "5×4 m", medium: "4×3 m", high: "3×2 m" },
  },
  "Mulberry": {
    plantsPerAcre: { low: 800, medium: 1500, high: 2200 },
    yieldKgPerPlant: 12,
    priceInrPerKg: 30,
    spacing: { low: "3×2 m", medium: "2×1.5 m", high: "1.5×1 m" },
  },
};

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

  // Generate AI insights for this farm
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

// ── Yield Optimization ─────────────────────────────────────────────────────────
router.post("/farms/:id/yield-optimization", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const { acreage, selectedCrops, spacingPreference = "medium" } = req.body as {
    acreage: number;
    selectedCrops: string[];
    spacingPreference?: string;
  };

  if (!acreage || !selectedCrops?.length) {
    res.status(400).json({ error: "acreage and selectedCrops are required" });
    return;
  }

  const spacing = (spacingPreference as "low" | "medium" | "high") || "medium";
  const acresPerCrop = acreage / selectedCrops.length;

  let totalPlants = 0;
  let totalEstimatedYieldKg = 0;
  let estimatedRevenueInr = 0;

  const cropBreakdown = selectedCrops.map((crop) => {
    const data = CROP_DATA[crop] ?? {
      plantsPerAcre: { low: 100, medium: 200, high: 300 },
      yieldKgPerPlant: 20,
      priceInrPerKg: 50,
      spacing: { low: "5×5 m", medium: "3×3 m", high: "2×2 m" },
    };
    const ppa = data.plantsPerAcre[spacing];
    const plants = Math.round(acresPerCrop * ppa);
    const yieldKg = Math.round(plants * data.yieldKgPerPlant);
    const revenue = Math.round(yieldKg * data.priceInrPerKg);
    totalPlants += plants;
    totalEstimatedYieldKg += yieldKg;
    estimatedRevenueInr += revenue;
    return {
      crop,
      allocatedAcres: parseFloat(acresPerCrop.toFixed(2)),
      plantsPerAcre: ppa,
      totalPlants: plants,
      yieldKgPerPlant: data.yieldKgPerPlant,
      totalYieldKg: yieldKg,
      revenueInr: revenue,
      spacing: data.spacing[spacing],
    };
  });

  // Calculate optimal distribution (by revenue per acre)
  const sorted = [...cropBreakdown].sort((a, b) => b.revenueInr / b.allocatedAcres - a.revenueInr / a.allocatedAcres);
  const total = sorted.reduce((s, c) => s + c.revenueInr / c.allocatedAcres, 0);
  const optimalDistribution = sorted.map((c) => ({
    crop: c.crop,
    percentage: parseFloat(((c.revenueInr / c.allocatedAcres / total) * 100).toFixed(1)),
    reasoning: `Highest revenue: INR ${Math.round(c.revenueInr / c.allocatedAcres).toLocaleString()}/acre`,
  }));

  const suggestions = [
    `With ${spacing} density spacing, you can fit ${totalPlants.toLocaleString()} plants across ${acreage} acres.`,
    `Expected total yield: ${totalEstimatedYieldKg.toLocaleString()} kg/season.`,
    `Estimated gross revenue: INR ${estimatedRevenueInr.toLocaleString()}/season.`,
    sorted[0] ? `${sorted[0].crop} offers the highest return per acre — consider allocating more land to it.` : "",
    `For mixed cropping, maintain recommended spacing to avoid competition for nutrients and sunlight.`,
    `Install drip irrigation to reduce water usage by up to 40% while maintaining optimal soil moisture.`,
  ].filter(Boolean);

  res.json({
    totalPlants,
    totalEstimatedYieldKg,
    estimatedRevenueInr,
    cropBreakdown,
    optimizationSuggestions: suggestions,
    optimalDistribution,
  });
});

export default router;
