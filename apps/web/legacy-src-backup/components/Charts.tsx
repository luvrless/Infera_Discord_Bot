import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsPoint } from "../lib/types";

const axis = {
  stroke: "#3f3f4a",
  tick: { fill: "#71717a", fontSize: 11 },
  tickLine: false,
  axisLine: false,
};

const tooltipStyle = {
  backgroundColor: "#101014",
  border: "1px solid #26262f",
  borderRadius: 8,
  fontSize: 12,
  color: "#e4e4e7",
};

function day(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActivityChart({
  data,
  series,
  height = 220,
}: {
  data: AnalyticsPoint[];
  series: Array<{ key: keyof AnalyticsPoint; label: string; color: string }>;
  height?: number;
}) {
  const rows = data.map((entry) => ({ ...entry, label: day(entry.date) }));
  if (rows.length === 0) {
    return <div className="flex h-[220px] items-center justify-center text-xs text-zinc-500">No data for this period</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          {series.map((entry) => (
            <linearGradient key={entry.key} id={`grad-${entry.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={entry.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={entry.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="#1c1c24" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={38} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#a1a1aa" }} />
        {series.map((entry) => (
          <Area
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.label}
            stroke={entry.color}
            strokeWidth={1.8}
            fill={`url(#grad-${entry.key})`}
            dot={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CommandBarChart({ data }: { data: Array<{ command: string; uses: number }> }) {
  if (data.length === 0) {
    return <div className="flex h-[220px] items-center justify-center text-xs text-zinc-500">No command usage recorded yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="#1c1c24" horizontal={false} />
        <XAxis type="number" {...axis} />
        <YAxis type="category" dataKey="command" width={110} {...axis} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="uses" name="Uses" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.command} fill="#8b5cf6" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SparkLine({ data, dataKey }: { data: AnalyticsPoint[]; dataKey: keyof AnalyticsPoint }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data}>
        <Line type="monotone" dataKey={dataKey} stroke="#a78bfa" strokeWidth={1.6} dot={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={() => ""} />
      </LineChart>
    </ResponsiveContainer>
  );
}
