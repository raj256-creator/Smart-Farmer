import { Router, type IRouter } from "express";
import { db, cropScansTable, farmSensorBatches } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router: IRouter = Router();

function parseId(p: Record<string, string>): number | null {
  const n = parseInt(p.id, 10);
  return isNaN(n) || n <= 0 ? null : n;
}

// GET /api/farms/:id/scans — list scans for a farm
router.get("/farms/:id/scans", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const scans = await db
    .select()
    .from(cropScansTable)
    .where(eq(cropScansTable.farmId, id))
    .orderBy(desc(cropScansTable.createdAt));

  res.json(scans);
});

// POST /api/farms/:id/scans — create a scan record for a farm
router.post("/farms/:id/scans", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const {
    cropType, growthStage, healthStatus, analysisNotes,
    yieldPredictionKg, harvestDaysRemaining, harvestWindow,
    diseaseDetected, nutrientDeficiency, confidence,
  } = req.body as Record<string, string | number | null>;

  const [scan] = await db.insert(cropScansTable).values({
    farmId: id,
    cropType: (cropType as string) ?? null,
    growthStage: (growthStage as string) ?? null,
    healthStatus: (healthStatus as string) ?? null,
    analysisNotes: (analysisNotes as string) ?? null,
    yieldPredictionKg: yieldPredictionKg != null ? Number(yieldPredictionKg) : null,
    harvestDaysRemaining: harvestDaysRemaining != null ? Number(harvestDaysRemaining) : null,
    harvestWindow: (harvestWindow as string) ?? null,
    diseaseDetected: (diseaseDetected as string) ?? null,
    nutrientDeficiency: (nutrientDeficiency as string) ?? null,
    confidence: confidence != null ? Number(confidence) : null,
    analyzed: true,
  }).returning();

  res.status(201).json(scan);
});

// DELETE /api/farms/:id/scans/:scanId
router.delete("/farms/:id/scans/:scanId", async (req, res): Promise<void> => {
  const id = parseId(req.params as Record<string, string>);
  const scanId = parseInt(req.params.scanId, 10);
  if (!id || isNaN(scanId)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(cropScansTable).where(
    and(eq(cropScansTable.farmId, id), eq(cropScansTable.id, scanId))
  );
  res.sendStatus(204);
});

export default router;
