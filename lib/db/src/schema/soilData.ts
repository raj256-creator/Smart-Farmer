import { pgTable, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cropScansTable } from "./cropScans";

export const soilDataTable = pgTable("soil_data", {
  id: serial("id").primaryKey(),
  cropScanId: integer("crop_scan_id").notNull().references(() => cropScansTable.id, { onDelete: "cascade" }),
  phLevel: real("ph_level"),
  moisturePercent: real("moisture_percent"),
  nitrogenPpm: real("nitrogen_ppm"),
  phosphorusPpm: real("phosphorus_ppm"),
  potassiumPpm: real("potassium_ppm"),
  organicMatterPercent: real("organic_matter_percent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSoilDataSchema = createInsertSchema(soilDataTable).omit({ id: true, createdAt: true });
export type InsertSoilData = z.infer<typeof insertSoilDataSchema>;
export type SoilData = typeof soilDataTable.$inferSelect;
