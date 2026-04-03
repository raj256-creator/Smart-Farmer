import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, climateDataTable } from "@workspace/db";
import {
  ListClimateRecordsQueryParams,
  CreateClimateDataBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/climate", async (req, res): Promise<void> => {
  const query = ListClimateRecordsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { cropScanId } = query.data;
  const results = cropScanId
    ? await db.select().from(climateDataTable).where(eq(climateDataTable.cropScanId, cropScanId))
    : await db.select().from(climateDataTable);

  res.json(results);
});

router.post("/climate", async (req, res): Promise<void> => {
  const body = CreateClimateDataBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [record] = await db.insert(climateDataTable).values(body.data).returning();
  res.status(201).json(record);
});

export default router;
