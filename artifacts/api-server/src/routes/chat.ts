import { Router, type IRouter } from "express";
import { db, cropScansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SendChatMessageBody } from "@workspace/api-zod";
import { generateChatResponse } from "../lib/aiAnalysis";

const router: IRouter = Router();

router.post("/chat", async (req, res): Promise<void> => {
  const body = SendChatMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const { message, cropScanId, cropType: providedCropType } = body.data;

  let resolvedCropType = providedCropType ?? null;
  if (cropScanId && !resolvedCropType) {
    const [scan] = await db.select().from(cropScansTable).where(eq(cropScansTable.id, cropScanId));
    if (scan?.cropType) resolvedCropType = scan.cropType;
  }

  const response = await generateChatResponse(message, resolvedCropType);
  res.json(response);
});

export default router;
