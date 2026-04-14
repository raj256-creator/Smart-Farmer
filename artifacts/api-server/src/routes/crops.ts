import { Router, type IRouter } from "express";
import { eq, desc, avg, count } from "drizzle-orm";
import { db, cropScansTable, soilDataTable, climateDataTable, recommendationsTable } from "@workspace/db";
import {
  ListCropScansQueryParams,
  CreateCropScanBody,
  GetCropScanParams,
  DeleteCropScanParams,
  AnalyzeCropScanParams,
  DetectCropFromImageBody,
} from "@workspace/api-zod";
import { runAIAnalysis } from "../lib/aiAnalysis";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.get("/crops", async (req, res): Promise<void> => {
  const query = ListCropScansQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { cropType, limit = 50, offset = 0 } = query.data;

  let q = db.select().from(cropScansTable).orderBy(desc(cropScansTable.createdAt));

  const results = await db
    .select()
    .from(cropScansTable)
    .orderBy(desc(cropScansTable.createdAt))
    .limit(limit ?? 50)
    .offset(offset ?? 0);

  const filtered = cropType ? results.filter((r) => r.cropType === cropType) : results;

  res.json(filtered);
});

router.post("/crops", async (req, res): Promise<void> => {
  const body = CreateCropScanBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [scan] = await db
    .insert(cropScansTable)
    .values({
      cropType: body.data.cropType ?? null,
      imageUrl: body.data.imageUrl ?? null,
      analyzed: false,
    })
    .returning();

  res.status(201).json(scan);
});

router.get("/crops/:id", async (req, res): Promise<void> => {
  const params = GetCropScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [scan] = await db.select().from(cropScansTable).where(eq(cropScansTable.id, params.data.id));
  if (!scan) {
    res.status(404).json({ error: "Crop scan not found" });
    return;
  }

  res.json(scan);
});

router.delete("/crops/:id", async (req, res): Promise<void> => {
  const params = DeleteCropScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(cropScansTable)
    .where(eq(cropScansTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Crop scan not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/crops/detect-image", async (req, res): Promise<void> => {
  const body = DetectCropFromImageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { imageUrl } = body.data;
  const CROPS = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 256,
      messages: [
        {
          role: "system",
          content: `You are an expert crop identification AI. You can only identify these five crops: Mango, Dragon Fruit, Chikoo, Pomegranate, Mulberry.

Analyze the image and respond ONLY with a JSON object in this format (no extra text):
{"cropType": "Mango", "confidence": 0.94, "message": "Clear mango leaves and fruit clusters detected."}

If the image does not clearly show one of the five crops, set cropType to null and confidence to 0.
confidence must be a decimal between 0.0 and 1.0.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "What crop is shown in this image? Choose only from: Mango, Dragon Fruit, Chikoo, Pomegranate, Mulberry." },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let result: { cropType: string | null; confidence: number; message: string };

    try {
      result = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      if (!CROPS.includes(result.cropType ?? "")) result.cropType = null;
    } catch {
      result = { cropType: null, confidence: 0, message: "Could not identify crop from image." };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ cropType: null, confidence: 0, message: "Image detection failed. Please select crop type manually." });
  }
});

router.post("/crops/:id/analyze", async (req, res): Promise<void> => {
  const params = AnalyzeCropScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [scan] = await db.select().from(cropScansTable).where(eq(cropScansTable.id, params.data.id));
  if (!scan) {
    res.status(404).json({ error: "Crop scan not found" });
    return;
  }

  const [soilRecord] = await db.select().from(soilDataTable).where(eq(soilDataTable.cropScanId, params.data.id));
  const [climateRecord] = await db.select().from(climateDataTable).where(eq(climateDataTable.cropScanId, params.data.id));

  const analysis = await runAIAnalysis(scan.cropType, scan.imageUrl, soilRecord ?? {}, climateRecord ?? {});

  await db
    .update(cropScansTable)
    .set({
      cropType: analysis.cropType,
      growthStage: analysis.growthStage,
      healthStatus: analysis.healthStatus,
      diseaseDetected: analysis.diseaseDetected,
      nutrientDeficiency: analysis.nutrientDeficiency,
      yieldPredictionKg: analysis.yieldPredictionKg,
      harvestDaysRemaining: analysis.harvestDaysRemaining,
      harvestWindow: analysis.harvestWindow,
      confidence: analysis.confidence,
      analysisNotes: analysis.analysisNotes,
      analyzed: true,
    })
    .where(eq(cropScansTable.id, params.data.id));

  if (analysis.recommendations.length > 0) {
    const recTypes = ["irrigation", "fertilizer", "disease", "harvest", "general"];
    const recInserts = analysis.recommendations.map((msg, i) => ({
      cropScanId: params.data.id,
      type: recTypes[i % recTypes.length],
      message: msg,
      priority: i === 0 ? "high" : i < 3 ? "medium" : "low",
    }));
    await db.insert(recommendationsTable).values(recInserts);
  }

  res.json({
    cropType: analysis.cropType,
    growthStage: analysis.growthStage,
    healthStatus: analysis.healthStatus,
    diseaseDetected: analysis.diseaseDetected,
    nutrientDeficiency: analysis.nutrientDeficiency,
    yieldPredictionKg: analysis.yieldPredictionKg,
    harvestDaysRemaining: analysis.harvestDaysRemaining,
    harvestWindow: analysis.harvestWindow,
    confidence: analysis.confidence,
    analysisNotes: analysis.analysisNotes,
    recommendations: analysis.recommendations,
  });
});

export default router;
