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

export type VisualizeChart = z.infer<typeof visualizeChartSchema>;
