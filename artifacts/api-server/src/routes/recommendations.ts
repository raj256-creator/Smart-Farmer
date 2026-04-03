import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, recommendationsTable } from "@workspace/db";
import { ListRecommendationsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/recommendations", async (req, res): Promise<void> => {
  const query = ListRecommendationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { cropScanId } = query.data;
  const results = cropScanId
    ? await db.select().from(recommendationsTable).where(eq(recommendationsTable.cropScanId, cropScanId)).orderBy(desc(recommendationsTable.createdAt))
    : await db.select().from(recommendationsTable).orderBy(desc(recommendationsTable.createdAt));

  res.json(results);
});

export default router;
