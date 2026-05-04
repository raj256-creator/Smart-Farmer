import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cropsRouter from "./crops";
import soilRouter from "./soil";
import climateRouter from "./climate";
import recommendationsRouter from "./recommendations";
import chatRouter from "./chat";
import conversationsRouter from "./conversations";
import farmsRouter from "./farms";
import dashboardRouter from "./dashboard";
import soilClimateRouter from "./soil-climate";
import farmSensorsRouter from "./farm-sensors";
import farmScansRouter from "./farm-scans";
import farmDetectCropRouter from "./farm-detect-crop";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cropsRouter);
router.use(soilRouter);
router.use(climateRouter);
router.use(recommendationsRouter);
router.use(chatRouter);
router.use(conversationsRouter);
router.use(farmsRouter);
router.use(dashboardRouter);
router.use(soilClimateRouter);
router.use(farmSensorsRouter);
router.use(farmScansRouter);
router.use(farmDetectCropRouter);

export default router;
