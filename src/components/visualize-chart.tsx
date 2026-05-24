"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "#/components/ui/chart.tsx";
import type { VisualizeChart } from "#/lib/chinook-visualize-types.ts";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

const fallbackColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function getChartConfig(chart: VisualizeChart) {
  const entries = chart.yKeys.map((key, index) => [
    key,
    {
      color: chart.chartConfig[key]?.color ?? fallbackColors[index % fallbackColors.length],
      label: chart.chartConfig[key]?.label ?? key,
    },
  ]);

  return Object.fromEntries(entries) satisfies ChartConfig;
}

function formatTick(value: unknown) {
  const text = String(value);
  return text.length > 14 ? `${text.slice(0, 12)}...` : text;
}

export function VisualizeChart({ chart }: { chart: VisualizeChart }) {
  const config = getChartConfig(chart);
  const xKey = chart.xKey ?? chart.yKeys[0];
  const firstYKey = chart.yKeys[0];

  if (chart.chartType === "table" || !firstYKey) {
    return (
      <div className="overflow-auto rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {Object.keys(chart.data[0] ?? {}).map((key) => (
                <th className="px-3 py-2 font-medium" key={key}>
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.data.map((row, index) => (
              <tr className="border-t" key={index}>
                {Object.entries(row).map(([key, value]) => (
                  <td className="px-3 py-2" key={key}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (chart.chartType === "pie") {
    return (
      <ChartContainer className="h-[280px] w-full" config={config}>
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie data={chart.data} dataKey={firstYKey} nameKey={xKey} outerRadius={96}>
            {chart.data.map((_entry, index) => (
              <Cell fill={fallbackColors[index % fallbackColors.length]} key={index} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent />} />
        </PieChart>
      </ChartContainer>
    );
  }

  if (chart.chartType === "bar") {
    return (
      <ChartContainer className="h-[280px] w-full" config={config}>
        <BarChart accessibilityLayer data={chart.data}>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey={xKey}
            tickFormatter={formatTick}
            tickLine={false}
            tickMargin={10}
          />
          <YAxis axisLine={false} tickLine={false} width={48} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {chart.yKeys.map((key) => (
            <Bar dataKey={key} fill={`var(--color-${key})`} key={key} radius={4} />
          ))}
        </BarChart>
      </ChartContainer>
    );
  }

  if (chart.chartType === "line") {
    return (
      <ChartContainer className="h-[280px] w-full" config={config}>
        <LineChart accessibilityLayer data={chart.data}>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey={xKey}
            tickFormatter={formatTick}
            tickLine={false}
            tickMargin={10}
          />
          <YAxis axisLine={false} tickLine={false} width={48} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {chart.yKeys.map((key) => (
            <Line
              dataKey={key}
              dot={false}
              key={key}
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              type="monotone"
            />
          ))}
        </LineChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer className="h-[280px] w-full" config={config}>
      <AreaChart accessibilityLayer data={chart.data}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey={xKey}
          tickFormatter={formatTick}
          tickLine={false}
          tickMargin={10}
        />
        <YAxis axisLine={false} tickLine={false} width={48} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {chart.yKeys.map((key) => (
          <Area
            dataKey={key}
            fill={`var(--color-${key})`}
            fillOpacity={0.18}
            key={key}
            stroke={`var(--color-${key})`}
            type="monotone"
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
