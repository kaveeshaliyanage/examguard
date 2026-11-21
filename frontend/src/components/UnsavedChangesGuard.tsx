import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface UnsavedChangesGuardProps {
  /** True while there is work in this tab that has not reached the server yet. */
  when: boolean;
  title?: string;
  body?: string;
}

/**
 * Guards against losing unsaved work.
 *
 * * Closing or reloading the tab triggers the browser's native confirmation.
 * * Following an in-app link is intercepted and confirmed with a dialog before
 *   the router navigates.
 *
 * It deliberately avoids `useBlocker`, which requires a data router; the app
 * (and most tests) use a plain `BrowserRouter`/`MemoryRouter`.
 */
export function UnsavedChangesGuard({
  when,
  title = 'Leave with unsaved changes?',
  body = 'Some answers have not been saved to the server yet. If you leave now, the latest edits in this tab may be lost.',
}: UnsavedChangesGuardProps) {
  const navigate = useNavigate();
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!when) {
      return undefined;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      const anchor = target instanceof Element ? target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download')) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }
      event.preventDefault();
      setPendingTo(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [when]);

  return (
    <Dialog
      open={pendingTo !== null}
      onClose={() => setPendingTo(null)}
      maxWidth="xs"
      fullWidth
      PaperProps={{ 'aria-modal': 'true' }}
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={() => setPendingTo(null)}>
          Stay on this page
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => {
            const destination = pendingTo;
            setPendingTo(null);
            if (destination) {
              navigate(destination);
            }
          }}
        >
          Leave anyway
        </Button>
      </DialogActions>
    </Dialog>
  );
}
