import { pgTable, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cropScansTable } from "./cropScans";

export const climateDataTable = pgTable("climate_data", {
  id: serial("id").primaryKey(),
  cropScanId: integer("crop_scan_id").notNull().references(() => cropScansTable.id, { onDelete: "cascade" }),
  temperatureCelsius: real("temperature_celsius"),
  humidityPercent: real("humidity_percent"),
  rainfallMm: real("rainfall_mm"),
  windSpeedKmh: real("wind_speed_kmh"),
  sunlightHours: real("sunlight_hours"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClimateDataSchema = createInsertSchema(climateDataTable).omit({ id: true, createdAt: true });
export type InsertClimateData = z.infer<typeof insertClimateDataSchema>;
export type ClimateData = typeof climateDataTable.$inferSelect;
