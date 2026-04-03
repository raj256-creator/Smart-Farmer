import { Router, type IRouter } from "express";
import { desc, avg, count, isNotNull, sql } from "drizzle-orm";
import { db, cropScansTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const allScans = await db.select().from(cropScansTable);
  const analyzed = allScans.filter((s) => s.analyzed);
  const healthy = analyzed.filter((s) => s.healthStatus === "Excellent" || s.healthStatus === "Good");
  const diseased = analyzed.filter((s) => s.diseaseDetected != null);

  const yieldValues = analyzed.filter((s) => s.yieldPredictionKg != null).map((s) => s.yieldPredictionKg as number);
  const harvestValues = analyzed.filter((s) => s.harvestDaysRemaining != null).map((s) => s.harvestDaysRemaining as number);

  const avgYieldKg = yieldValues.length > 0 ? yieldValues.reduce((a, b) => a + b, 0) / yieldValues.length : 0;
  const avgHarvestDays = harvestValues.length > 0 ? Math.round(harvestValues.reduce((a, b) => a + b, 0) / harvestValues.length) : 0;

  const cropTypes = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"];
  const cropBreakdown = cropTypes.map((ct) => {
    const forCrop = analyzed.filter((s) => s.cropType === ct);
    const yields = forCrop.filter((s) => s.yieldPredictionKg != null).map((s) => s.yieldPredictionKg as number);
    const healthScores = forCrop.map((s) => {
      const map: Record<string, number> = { Excellent: 100, Good: 75, Fair: 50, Poor: 25, Critical: 10 };
      return map[s.healthStatus ?? "Fair"] ?? 50;
    });
    return {
      cropType: ct,
      count: forCrop.length,
      avgYieldKg: yields.length > 0 ? Math.round(yields.reduce((a, b) => a + b, 0) / yields.length) : 0,
      avgHealthScore: healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0,
    };
  });

  res.json({
    totalScans: allScans.length,
    analyzedScans: analyzed.length,
    healthyCount: healthy.length,
    diseasedCount: diseased.length,
    avgYieldKg: Math.round(avgYieldKg),
    avgHarvestDays,
    cropBreakdown,
  });
});

router.get("/dashboard/recent", async (_req, res): Promise<void> => {
  const results = await db
    .select()
    .from(cropScansTable)
    .orderBy(desc(cropScansTable.createdAt))
    .limit(10);
  res.json(results);
});

router.get("/dashboard/crop-stats", async (_req, res): Promise<void> => {
  const allScans = await db.select().from(cropScansTable).where(sql`${cropScansTable.analyzed} = true`);

  const cropTypes = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"];
  const stats = cropTypes.map((ct) => {
    const forCrop = allScans.filter((s) => s.cropType === ct);
    const yields = forCrop.filter((s) => s.yieldPredictionKg != null).map((s) => s.yieldPredictionKg as number);
    const healthScores = forCrop.map((s) => {
      const map: Record<string, number> = { Excellent: 100, Good: 75, Fair: 50, Poor: 25, Critical: 10 };
      return map[s.healthStatus ?? "Fair"] ?? 50;
    });
    return {
      cropType: ct,
      count: forCrop.length,
      avgYieldKg: yields.length > 0 ? Math.round(yields.reduce((a, b) => a + b, 0) / yields.length) : 0,
      avgHealthScore: healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0,
    };
  });

  res.json(stats);
});

export default router;
