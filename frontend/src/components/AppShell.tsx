import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthProvider';
import { humanize } from '../lib/format';

interface AppShellProps {
  children: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}

export function AppShell({ children, breadcrumb, actions }: AppShellProps) {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const handleSignOut = () => {
    setAnchor(null);
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            component={RouterLink}
            to="/exams"
            variant="h6"
            color="primary"
            sx={{ textDecoration: 'none', fontWeight: 700 }}
          >
            ExamGuard
          </Typography>
          {breadcrumb ? (
            <>
              <Divider orientation="vertical" flexItem />
              <Box sx={{ minWidth: 0 }}>{breadcrumb}</Box>
            </>
          ) : null}
          <Box sx={{ flexGrow: 1 }} />
          {actions}
          {session ? (
            <>
              <Button
                color="inherit"
                onClick={(event) => setAnchor(event.currentTarget)}
                startIcon={<Avatar sx={{ width: 28, height: 28 }}>{session.user.displayName.charAt(0)}</Avatar>}
                aria-haspopup="menu"
              >
                <Stack alignItems="flex-start" sx={{ textAlign: 'left' }}>
                  <Typography variant="body2">{session.user.displayName}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {humanize(session.user.role)}
                  </Typography>
                </Stack>
              </Button>
              <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
                <MenuItem onClick={handleSignOut}>Sign out</MenuItem>
              </Menu>
            </>
          ) : null}
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        {children}
      </Container>

      <Box component="footer" sx={{ py: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Container maxWidth="lg">
          <Typography variant="caption" color="text.secondary">
            Review priority is not a finding of misconduct.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
