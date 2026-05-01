import { pgTable, serial, text, timestamp, numeric, json } from "drizzle-orm/pg-core";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const farms = pgTable("farms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  description: text("description"),
  status: text("status").notNull().default("active"),
  acreage: numeric("acreage", { precision: 10, scale: 2 }),
  crops: json("crops").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertFarmSchema = createInsertSchema(farms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateFarmSchema = createUpdateSchema(farms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Farm = typeof farms.$inferSelect;
export type InsertFarm = z.infer<typeof insertFarmSchema>;
export type UpdateFarm = z.infer<typeof updateFarmSchema>;
