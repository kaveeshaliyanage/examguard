import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FocusLossPoint } from '../../api/types';

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
        date,
      );
}

export function IntegrityTrendChart({ data }: { data: FocusLossPoint[] }) {
  const total = data.reduce((sum, point) => sum + point.focusLossSignals, 0);
  if (total === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No focus-loss signals in the last 14 days.
      </Typography>
    );
  }
  const points = data.map((point) => ({ ...point, label: shortDate(point.date) }));
  return (
    <Box
      role="img"
      aria-label="Focus-loss signals per day over the last 14 days"
      sx={{ width: '100%', height: 240 }}
    >
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value: number) => [`${value} signal${value === 1 ? '' : 's'}`, 'Focus loss']}
            labelFormatter={(label: string) => label}
          />
          <Area
            type="monotone"
            dataKey="focusLossSignals"
            stroke="#18538f"
            strokeWidth={2}
            fill="#e8f1fb"
          />
        </AreaChart>
      </ResponsiveContainer>
    </Box>
  );
}
