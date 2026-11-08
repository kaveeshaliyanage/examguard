import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FunnelStage } from '../../api/types';

export function AttemptFunnelChart({ data }: { data: FunnelStage[] }) {
  const total = data.reduce((sum, stage) => sum + stage.count, 0);
  if (total === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No attempts yet. Join activity appears here as candidates start exams.
      </Typography>
    );
  }
  return (
    <Box
      role="img"
      aria-label="Attempts by stage: attempts, submitted, graded, released"
      sx={{ width: '100%', height: 240 }}
    >
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="stage"
            width={80}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip formatter={(value: number) => [`${value}`, 'Attempts']} />
          <Bar dataKey="count" fill="#0f766e" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
