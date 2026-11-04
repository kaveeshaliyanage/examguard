import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <Stack spacing={1.5} aria-label="Loading">
      <Skeleton variant="text" width="35%" height={36} />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} variant="rounded" height={56} />
      ))}
    </Stack>
  );
}
