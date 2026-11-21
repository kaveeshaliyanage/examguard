import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { integrityTones } from '../../design/tokens';

export interface IntegrityWarningDialogProps {
  open: boolean;
  strikeCount: number;
  maxStrikes: number;
  onResume: () => void;
}

/**
 * Blocking dialog shown when the candidate returns after leaving the exam
 * window. There is exactly one way forward: Resume exam.
 */
export function IntegrityWarningDialog({
  open,
  strikeCount,
  maxStrikes,
  onResume,
}: IntegrityWarningDialogProps) {
  const remaining = Math.max(0, maxStrikes - strikeCount);
  return (
    <Dialog
      open={open}
      disableEscapeKeyDown
      // Backdrop clicks must not dismiss an integrity notice.
      onClose={() => undefined}
      maxWidth="xs"
      fullWidth
      aria-labelledby="integrity-warning-title"
      aria-describedby="integrity-warning-body"
      PaperProps={{ 'aria-modal': 'true' }}
    >
      <DialogTitle id="integrity-warning-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmberIcon sx={{ color: integrityTones.warning.main }} />
        Focus loss recorded
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert
            severity="warning"
            variant="outlined"
            id="integrity-warning-body"
            sx={{ '& .MuiAlert-message': { fontWeight: 600 } }}
          >
            You left the exam window. Strike {strikeCount} of {maxStrikes}. This was recorded.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            {remaining === 0
              ? 'You have used every strike. The attempt may be terminated.'
              : `${remaining} strike${remaining === 1 ? '' : 's'} remaining. If you leave the exam window ${remaining} more time${remaining === 1 ? '' : 's'}, the attempt is terminated automatically.`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your answers stay saved in this tab and any completed autosave has already reached the
            server. Resume to keep answering.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" size="large" fullWidth autoFocus onClick={onResume}>
          Resume exam
        </Button>
      </DialogActions>
    </Dialog>
  );
}
