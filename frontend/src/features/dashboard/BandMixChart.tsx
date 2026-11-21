import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { BandCount } from '../../api/types';
import { priorityBands } from '../../design/tokens';

export function BandMixChart({ data }: { data: BandCount[] }) {
  const total = data.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No open integrity findings to review.
      </Typography>
    );
  }
  return (
    <Box
      role="img"
      aria-label="Open findings by review priority band"
      sx={{ width: '100%', height: 240 }}
    >
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="band"
            innerRadius={44}
            outerRadius={78}
            paddingAngle={2}
          >
            {data.map((row) => (
              <Cell key={row.band} fill={priorityBands[row.band].main} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number, name: string) => [`${value}`, name]} />
          <Legend verticalAlign="bottom" height={24} />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
}
