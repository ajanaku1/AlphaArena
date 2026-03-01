"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface PnlSparklineProps {
  data: number[];
  positive?: boolean;
  height?: number;
}

export function PnlSparkline({ data, positive = true, height = 40 }: PnlSparklineProps) {
  const chartData = data.map((value, index) => ({ index, value }));
  const color = positive ? "#10b981" : "#ef4444";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`sparkGrad-${positive ? "pos" : "neg"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sparkGrad-${positive ? "pos" : "neg"})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
