import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, soilDataTable } from "@workspace/db";
import {
  ListSoilRecordsQueryParams,
  CreateSoilDataBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/soil", async (req, res): Promise<void> => {
  const query = ListSoilRecordsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { cropScanId } = query.data;
  const results = cropScanId
    ? await db.select().from(soilDataTable).where(eq(soilDataTable.cropScanId, cropScanId))
    : await db.select().from(soilDataTable);

  res.json(results);
});

router.post("/soil", async (req, res): Promise<void> => {
  const body = CreateSoilDataBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [record] = await db.insert(soilDataTable).values(body.data).returning();
  res.status(201).json(record);
});

export default router;
