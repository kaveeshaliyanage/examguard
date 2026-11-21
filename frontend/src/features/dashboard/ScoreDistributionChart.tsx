import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ScoreBucket } from '../../api/types';

export function ScoreDistributionChart({ data }: { data: ScoreBucket[] }) {
  const total = data.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No released results yet. Release grades on an exam to populate this chart.
      </Typography>
    );
  }
  return (
    <Box sx={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value: number) => [`${value} attempt${value === 1 ? '' : 's'}`, 'Released']}
            labelFormatter={(label: string) => `Score ${label}%`}
          />
          <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h6" component="h5" gutterBottom>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
