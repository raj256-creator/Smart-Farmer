import { pgTable, text, serial, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cropScansTable = pgTable("crop_scans", {
  id: serial("id").primaryKey(),
  cropType: text("crop_type"),
  growthStage: text("growth_stage"),
  imageUrl: text("image_url"),
  healthStatus: text("health_status"),
  diseaseDetected: text("disease_detected"),
  nutrientDeficiency: text("nutrient_deficiency"),
  yieldPredictionKg: real("yield_prediction_kg"),
  harvestDaysRemaining: integer("harvest_days_remaining"),
  harvestWindow: text("harvest_window"),
  confidence: real("confidence"),
  analysisNotes: text("analysis_notes"),
  analyzed: boolean("analyzed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCropScanSchema = createInsertSchema(cropScansTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCropScan = z.infer<typeof insertCropScanSchema>;
export type CropScan = typeof cropScansTable.$inferSelect;
