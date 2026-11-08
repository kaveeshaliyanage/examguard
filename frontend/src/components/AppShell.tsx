import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthProvider';
import { useStudentAuth } from '../features/student/StudentAuthProvider';
import { layout, surfaces } from '../design/tokens';
import { humanize } from '../lib/format';

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  exact?: boolean;
}

export interface AppShellProps {
  children: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  area?: 'staff' | 'student';
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | false;
}

function staffNav(role: string | undefined): NavItem[] {
  const items: NavItem[] = [
    { label: 'Dashboard', to: '/dashboard', icon: <DashboardOutlinedIcon fontSize="small" />, exact: true },
    { label: 'Exams', to: '/exams', icon: <SchoolOutlinedIcon fontSize="small" /> },
  ];
  if (role === 'LECTURER' || role === 'ADMIN') {
    items.push({
      label: 'Create exam',
      to: '/exams/new',
      icon: <AddCircleOutlineIcon fontSize="small" />,
      exact: true,
    });
  }
  if (role === 'ADMIN') {
    items.push({
      label: 'Administration',
      to: '/admin',
      icon: <AdminPanelSettingsOutlinedIcon fontSize="small" />,
      exact: true,
    });
  }
  return items;
}

const studentNav: NavItem[] = [
  { label: 'Dashboard', to: '/student', icon: <DashboardOutlinedIcon fontSize="small" />, exact: true },
  { label: 'Join exam', to: '/join', icon: <AssignmentOutlinedIcon fontSize="small" />, exact: true },
];

function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.to;
  }
  if (item.to === '/exams') {
    return pathname === '/exams' || (pathname.startsWith('/exams/') && pathname !== '/exams/new');
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function AppShell({ children, breadcrumb, actions, area = 'staff', maxWidth = 'lg' }: AppShellProps) {
  const staffAuth = useAuth();
  const studentAuth = useStudentAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isStudent = area === 'student';
  const staffSession = staffAuth.session;
  const studentSession = studentAuth.session;
  const displayName = isStudent
    ? studentSession?.user.displayName ?? 'Guest candidate'
    : staffSession?.user.displayName ?? 'Signed out';
  const roleLabel = isStudent ? 'Student' : humanize(staffSession?.user.role ?? 'Reviewer');
  const nav = isStudent ? studentNav : staffNav(staffSession?.user.role);
  const homePath = isStudent ? '/student' : '/exams';

  const handleSignOut = () => {
    setAnchor(null);
    if (isStudent) {
      studentAuth.signOut();
      navigate('/student', { replace: true });
    } else {
      staffAuth.signOut();
      navigate('/login', { replace: true });
    }
  };

  const sidebar = (
    <Stack sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2.5, height: layout.topBarHeight }}>
        <Box
          aria-hidden
          sx={{
            width: 28,
            height: 28,
            borderRadius: '8px',
            bgcolor: 'primary.main',
            display: 'grid',
            placeItems: 'center',
            color: 'primary.contrastText',
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          EG
        </Box>
        <Box>
          <Typography
            component={RouterLink}
            to={homePath}
            variant="subtitle1"
            sx={{ fontWeight: 700, color: 'text.primary', textDecoration: 'none', lineHeight: 1.1, display: 'block' }}
          >
            ExamGuard
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isStudent ? 'Student portal' : 'Review workspace'}
          </Typography>
        </Box>
      </Stack>
      <Divider />
      <List dense sx={{ py: 1, flexGrow: 1 }} aria-label={isStudent ? 'Student navigation' : 'Staff navigation'}>
        {nav.map((item) => (
          <ListItem key={item.to} disablePadding>
            <ListItemButton
              component={RouterLink}
              to={item.to}
              selected={isActive(item, location.pathname)}
            >
              <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
          Review priority is not a finding of misconduct.
        </Typography>
      </Box>
    </Stack>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        color="inherit"
        sx={{
          width: { md: `calc(100% - ${layout.sidebarWidth}px)` },
          ml: { md: `${layout.sidebarWidth}px` },
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Toolbar sx={{ gap: 1.5, minHeight: `${layout.topBarHeight}px !important` }}>
          <IconButton
            edge="start"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            {breadcrumb ? (
              <Breadcrumbs aria-label="Breadcrumb" sx={{ '& .MuiBreadcrumbs-li': { minWidth: 0 } }}>
                <Typography
                  component={RouterLink}
                  to={homePath}
                  variant="body2"
                  sx={{ color: 'text.secondary', textDecoration: 'none' }}
                >
                  {isStudent ? 'Student' : 'Exams'}
                </Typography>
                {breadcrumb}
              </Breadcrumbs>
            ) : (
              <Typography variant="body2" color="text.secondary" noWrap>
                {isStudent ? 'Student portal' : 'Review workspace'}
              </Typography>
            )}
          </Box>
          {actions}
          <Tooltip title="Account">
            <Button
              color="inherit"
              onClick={(event) => setAnchor(event.currentTarget)}
              aria-haspopup="menu"
              aria-label="Account menu"
              sx={{ px: 1, minWidth: 0 }}
            >
              <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main' }}>
                {displayName.charAt(0).toUpperCase()}
              </Avatar>
              <Stack alignItems="flex-start" sx={{ textAlign: 'left', ml: 1, display: { xs: 'none', sm: 'flex' } }}>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                  {displayName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {roleLabel}
                </Typography>
              </Stack>
            </Button>
          </Tooltip>
          <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {displayName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {roleLabel}
              </Typography>
            </Box>
            <Divider />
            <MenuItem onClick={handleSignOut}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" aria-label="Sidebar" sx={{ width: { md: layout.sidebarWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: layout.sidebarWidth, boxSizing: 'border-box' },
          }}
        >
          {sidebar}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: layout.sidebarWidth,
              boxSizing: 'border-box',
              borderRight: 1,
              borderColor: 'divider',
              bgcolor: surfaces.raised,
            },
          }}
        >
          {sidebar}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          ml: { md: `${layout.sidebarWidth}px` },
          pt: `${layout.topBarHeight}px`,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Container maxWidth={maxWidth} sx={{ py: { xs: 2, md: 4 }, flexGrow: 1 }}>
          {children}
        </Container>
        <Box component="footer" sx={{ py: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Container maxWidth={maxWidth}>
            <Typography variant="caption" color="text.secondary">
              Review priority is not a finding of misconduct.
            </Typography>
          </Container>
        </Box>
      </Box>
    </Box>
  );
}
