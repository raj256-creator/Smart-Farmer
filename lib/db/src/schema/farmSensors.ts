import { pgTable, serial, integer, numeric, text, timestamp, json } from "drizzle-orm/pg-core";
import { farms } from "./farms";

export const farmSensorReadings = pgTable("farm_sensor_readings", {
  id:          serial("id").primaryKey(),
  farmId:      integer("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  label:       text("label"),
  ph:          numeric("ph",          { precision: 5, scale: 2 }),
  moisture:    numeric("moisture",    { precision: 6, scale: 2 }),
  temperature: numeric("temperature", { precision: 6, scale: 2 }),
  humidity:    numeric("humidity",    { precision: 6, scale: 2 }),
  source:      text("source").default("manual"),
  batchId:     text("batch_id"),
  recordedAt:  timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt:   timestamp("created_at",  { withTimezone: true }).defaultNow().notNull(),
});

export const farmSensorBatches = pgTable("farm_sensor_batches", {
  id:          serial("id").primaryKey(),
  farmId:      integer("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  batchId:     text("batch_id").notNull(),
  source:      text("source").notNull().default("manual"),
  fileName:    text("file_name"),
  rowCount:    integer("row_count").notNull(),
  summary:     json("summary"),
  aiAnalysis:  json("ai_analysis"),
  createdAt:   timestamp("created_at",  { withTimezone: true }).defaultNow().notNull(),
});

export type FarmSensorReading = typeof farmSensorReadings.$inferSelect;
export type FarmSensorBatch   = typeof farmSensorBatches.$inferSelect;
