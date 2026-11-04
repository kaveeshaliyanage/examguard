import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useState } from 'react';
import { formatDateTime } from '../../lib/format';

interface ExtensionPanelProps {
  collectorToken: string;
  connected: boolean;
  lastSeenAt: string | null;
}

export function ExtensionPanel({ collectorToken, connected, lastSeenAt }: ExtensionPanelProps) {
  const extensionId = import.meta.env.VITE_EXTENSION_ID;
  const [copied, setCopied] = useState(false);

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(collectorToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="subtitle1">Connect monitoring extension</Typography>
          <Chip
            size="small"
            color={connected ? 'success' : 'default'}
            variant="outlined"
            label={connected ? 'Connected' : 'Not connected'}
          />
        </Stack>

        <Alert severity="info" variant="outlined">
          Only domain names and navigation times are collected. Page content, keystrokes and
          screenshots are never collected. If you do not connect, your coverage is marked as unknown,
          not clean.
        </Alert>

        <Typography variant="body2">
          Open the ExamGuard extension, paste this attempt's connection token, and set the API base
          URL. Then leave the extension running for the duration of the exam.
        </Typography>

        <Box>
          <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyToken} size="small">
            {copied ? 'Copied' : 'Copy connection token'}
          </Button>
        </Box>

        {extensionId ? (
          <Typography variant="caption" color="text.secondary">
            Extension ID: {extensionId}
          </Typography>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Extension ID not configured. Load the unpacked build from <code>extension/dist</code> in
            the browser's extensions page.
          </Typography>
        )}

        <Typography variant="caption" color="text.secondary">
          Last activity seen by the server: {formatDateTime(lastSeenAt)}
        </Typography>
      </Stack>
    </Paper>
  );
}
