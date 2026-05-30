import { z } from "zod";

export const chartTypeSchema = z.enum(["area", "bar", "line", "pie", "table"]);
export const chartDatumSchema = z.object({}).catchall(z.union([z.string(), z.number(), z.null()]));
export const chartConfigItemSchema = z.object({
  color: z.string().optional(),
  label: z.string(),
});
export const chartConfigSchema = z.object({}).catchall(chartConfigItemSchema);

export const visualizeChartSchema = z.object({
  chartConfig: chartConfigSchema,
  chartType: chartTypeSchema,
  data: z.array(chartDatumSchema).max(200),
  description: z.string(),
  title: z.string(),
  xKey: z.string().nullable(),
  yKeys: z.array(z.string()).max(5),
});

export const visualizeNoDataSchema = z.object({
  description: z.string(),
  kind: z.literal("no-data"),
  rowCount: z.literal(0),
  sql: z.string(),
  title: z.string(),
});

export const visualizeGraphToolOutputSchema = z.union([
  visualizeChartSchema,
  visualizeNoDataSchema,
]);

export type VisualizeChart = z.infer<typeof visualizeChartSchema>;
export type VisualizeGraphToolOutput = z.infer<typeof visualizeGraphToolOutputSchema>;
export type VisualizeNoData = z.infer<typeof visualizeNoDataSchema>;
