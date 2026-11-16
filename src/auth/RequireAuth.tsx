import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Button, Center, Loader, Stack, Text } from '@mantine/core';
import { useAuth } from './context';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  if (!profile) {
    return (
      <Center h="100vh">
        <Stack align="center">
          <Text>Профиль сотрудника не найден. Обратитесь к администратору.</Text>
          <Button variant="default" onClick={() => void signOut()}>
            Выйти
          </Button>
        </Stack>
      </Center>
    );
  }

  return children;
}
