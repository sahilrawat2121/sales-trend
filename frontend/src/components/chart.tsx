"use client";

import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compact, formatTooltipValue } from "../lib/sales";

type Series = { key: string; label: string; color: string; dashed?: boolean; area?: boolean };
export function Chart({ rows, series, label, interval = false, currency }: {
  rows: object[]; series: Series[]; label: string; interval?: boolean; currency?: string;
}) {
  return <div className="chart" role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#e3e9e3" vertical={false} />
        <XAxis dataKey="month" axisLine={false} tickLine={false} minTickGap={35} tick={{ fill: "#647067", fontSize: 11 }} />
        <YAxis axisLine={false} tickLine={false} width={64} tickFormatter={compact.format} tick={{ fill: "#647067", fontSize: 11 }} />
        <Tooltip formatter={value => formatTooltipValue(value, currency)} contentStyle={{ borderRadius: 5, border: "1px solid #e1e7e0", fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {interval && <Area type="linear" dataKey="interval" name="95% prediction interval" fill="#5484a5" fillOpacity={0.16} stroke="none" isAnimationActive={false} connectNulls={false} />}
        {series.map(item => item.area
          ? <Area key={item.key} type="linear" dataKey={item.key} name={item.label} stroke={item.color} fill={item.color} fillOpacity={0.07} strokeWidth={2} isAnimationActive={false} connectNulls={false} />
          : <Line key={item.key} type="linear" dataKey={item.key} name={item.label} stroke={item.color} dot={false} strokeWidth={2} strokeDasharray={item.dashed ? "5 4" : undefined} isAnimationActive={false} connectNulls={false} />)}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}