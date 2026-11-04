import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

function ChipGroup({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) {
    return null;
  }
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {values.map((value) => (
          <Chip key={`${label}-${value}`} size="small" label={value} variant="outlined" />
        ))}
      </Stack>
    </Stack>
  );
}

export function PatternPanel({
  shingles,
  tokens,
  variants,
  crossQuestion,
  domains,
}: {
  shingles: string[];
  tokens: string[];
  variants: string[];
  crossQuestion: string[];
  domains: string[];
}) {
  return (
    <Stack spacing={1.5}>
      <ChipGroup label="Shared rare phrases" values={shingles} />
      <ChipGroup label="Shared distinctive tokens" values={tokens} />
      <ChipGroup label="Spelling variants" values={variants} />
      <ChipGroup label="Shared across different questions" values={crossQuestion} />
      <ChipGroup label="Distinct domains" values={domains} />
    </Stack>
  );
}
