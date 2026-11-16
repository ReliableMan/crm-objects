import { Link, Outlet, useLocation } from 'react-router';
import { AppShell, Badge, Button, Container, Group, Text, Title } from '@mantine/core';
import { useAuth } from '../auth/context';
import { ROLE_LABEL } from '../lib/status';
import { NotificationBell } from './NotificationBell';

export function AppLayout() {
  const { profile, isManager, signOut } = useAuth();
  const { pathname } = useLocation();

  const links = isManager
    ? [{ to: '/objects', label: 'Объекты' }]
    : [
        { to: '/my-tasks', label: 'Мои задачи' },
        { to: '/objects', label: 'Объекты' },
      ];

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="lg" wrap="nowrap">
            <Title order={4}>Объекты и задачи</Title>
            <Group gap={4} wrap="nowrap">
              {links.map((l) => (
                <Button
                  key={l.to}
                  component={Link}
                  to={l.to}
                  variant={pathname.startsWith(l.to) ? 'light' : 'subtle'}
                  size="compact-md"
                >
                  {l.label}
                </Button>
              ))}
            </Group>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <NotificationBell />
            <Text size="sm" visibleFrom="sm">
              {profile?.full_name}
            </Text>
            {profile && (
              <Badge variant="light" color={isManager ? 'violet' : 'blue'} visibleFrom="xs">
                {ROLE_LABEL[profile.role]}
              </Badge>
            )}
            <Button variant="default" size="compact-md" onClick={() => void signOut()}>
              Выйти
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg" px={0}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
