"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "#/lib/utils.ts";

export type ChartConfig = {
  [key: string]: {
    color?: string;
    label: React.ReactNode;
  };
};

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartStyle({ config, id }: { config: ChartConfig; id: string }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item.color);

  if (colorConfig.length === 0) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          [data-chart=${id}] {
            ${colorConfig.map(([key, item]) => `--color-${key}: ${item.color};`).join("\n")}
          }
        `,
      }}
    />
  );
}

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ReactElement<{ height?: number; width?: number }>;
};

function ChartContainer({ id, className, children, config, ...props }: ChartContainerProps) {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replaceAll(":", "")}`;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState<{ height: number; width: number } | null>(
    null,
  );

  React.useEffect(() => {
    const node = containerRef.current;

    if (!node) {
      return;
    }

    const updateReadiness = () => {
      const { height, width } = node.getBoundingClientRect();

      setDimensions(width > 0 && height > 0 ? { height, width } : null);
    };

    updateReadiness();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateReadiness);

      return () => window.removeEventListener("resize", updateReadiness);
    }

    const observer = new ResizeObserver(updateReadiness);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "relative flex min-h-0 min-w-0 justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/60 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
          className,
        )}
        ref={containerRef}
        {...props}
      >
        <ChartStyle config={config} id={chartId} />
        {dimensions
          ? React.cloneElement(children, {
              height: dimensions.height,
              width: dimensions.width,
            })
          : null}
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;
const ChartLegend = RechartsPrimitive.Legend;

type ChartTooltipContentProps = React.ComponentProps<"div"> &
  Partial<
    Pick<RechartsPrimitive.TooltipContentProps<number, string>, "active" | "label" | "payload">
  > & {
    hideIndicator?: boolean;
    hideLabel?: boolean;
    indicator?: "dot" | "line";
  };

function ChartTooltipContent({
  active,
  className,
  hideIndicator = false,
  hideLabel = false,
  indicator = "dot",
  label,
  payload,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-32 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
    >
      {!hideLabel && label ? <div className="font-medium">{label}</div> : null}
      <div className="grid gap-1.5">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "");
          const labelText = config[key]?.label ?? item.name ?? key;
          const color = item.color ?? config[key]?.color ?? `var(--color-${key})`;

          return (
            <div className="flex items-center gap-2" key={key}>
              {!hideIndicator && (
                <div
                  className={cn(
                    "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                    indicator === "dot" ? "size-2.5" : "h-0.5 w-3",
                  )}
                  style={
                    {
                      "--color-bg": color,
                      "--color-border": color,
                    } as React.CSSProperties
                  }
                />
              )}
              <div className="flex flex-1 items-center justify-between gap-4">
                <span className="text-muted-foreground">{labelText}</span>
                {item.value !== undefined && item.value !== null && (
                  <span className="font-mono font-medium tabular-nums">
                    {Number.isFinite(Number(item.value))
                      ? Number(item.value).toLocaleString()
                      : String(item.value)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ChartLegendPayloadItem = {
  color?: string;
  dataKey?: string | number;
  value?: string | number;
};

type ChartLegendContentProps = React.ComponentProps<"div"> & {
  payload?: ChartLegendPayloadItem[];
};

function ChartLegendContent({ className, payload }: ChartLegendContentProps) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div className={cn("flex items-center justify-center gap-4", className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value ?? "");

        return (
          <div className="flex items-center gap-1.5" key={key}>
            <div
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color ?? config[key]?.color }}
            />
            <span className="text-muted-foreground text-xs">{config[key]?.label ?? item.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent };
