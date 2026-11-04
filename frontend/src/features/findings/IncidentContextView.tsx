import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { IncidentContext, ObservedEvent, ResourceCategory } from '../../api/types';
import { CoverageBanner } from '../../components/CoverageBanner';
import { formatDateTime, formatPercent, humanize } from '../../lib/format';

const categoryColor: Record<ResourceCategory, string> = {
  PROHIBITED: 'error.main',
  UNCLASSIFIED: 'warning.main',
  PERMITTED: 'success.main',
};

function dotColor(event: ObservedEvent): string {
  if (event.eventType !== 'NAVIGATION') {
    return 'grey.500';
  }
  return event.classification ? categoryColor[event.classification] : 'grey.500';
}

function EventRow({ event }: { event: ObservedEvent }) {
  return (
    <Box sx={{ display: 'flex', gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: dotColor(event),
            mt: 0.75,
            flexShrink: 0,
          }}
        />
        <Box sx={{ width: 2, bgcolor: 'divider', flexGrow: 1, minHeight: 16 }} />
      </Box>
      <Box sx={{ pb: 2, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle2">{humanize(event.eventType)}</Typography>
          {event.domain ? <Chip size="small" variant="outlined" label={event.domain} /> : null}
          {event.classification ? (
            <Chip
              size="small"
              color={
                event.classification === 'PROHIBITED'
                  ? 'error'
                  : event.classification === 'UNCLASSIFIED'
                    ? 'warning'
                    : 'success'
              }
              variant="outlined"
              label={humanize(event.classification)}
            />
          ) : null}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(event.occurredAt)}
          {event.rulePattern ? ` · rule ${event.rulePattern}` : ''}
        </Typography>
      </Box>
    </Box>
  );
}

export function IncidentContextView({ context }: { context: IncidentContext }) {
  const visible = context.events.filter((event) => event.eventType !== 'HEARTBEAT');
  const heartbeats = context.events.length - visible.length;

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle1">{context.candidateCode}</Typography>
        <Typography variant="caption" color="text.secondary">
          Monitoring window: {formatDateTime(context.monitoringStart)} –{' '}
          {formatDateTime(context.monitoringEnd)} · Observed coverage: {formatPercent(context.coveragePercent)}
        </Typography>
      </Paper>

      <CoverageBanner warning={context.coverageWarning} percent={context.coveragePercent} />

      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Candidate activity timeline
        </Typography>
        {visible.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No navigation or connection events were recorded.
          </Typography>
        ) : (
          visible.map((event, index) => (
            <EventRow key={`${event.eventType}-${event.occurredAt}-${index}`} event={event} />
          ))
        )}
        {heartbeats > 0 ? (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'grey.300', mt: 0.75 }} />
            </Box>
            <Typography variant="body2" color="text.secondary">
              {heartbeats} heartbeat{heartbeats === 1 ? '' : 's'} collapsed
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Stack>
  );
}
