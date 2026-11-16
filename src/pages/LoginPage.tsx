import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Alert, Button, Center, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useAuth } from '../auth/context';
import { toUserMessage } from '../lib/errors';

export function LoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Введите корректный email'),
      password: (v) => (v.length > 0 ? null : 'Введите пароль'),
    },
  });

  if (session) return <Navigate to="/" replace />;

  const onSubmit = form.onSubmit(async ({ email, password }) => {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate('/', { replace: true });
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={380} maw="100%">
        <form onSubmit={onSubmit} noValidate>
          <Stack>
            <Title order={3}>Вход</Title>
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              key={form.key('email')}
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Пароль"
              autoComplete="current-password"
              key={form.key('password')}
              {...form.getInputProps('password')}
            />
            <Button type="submit" loading={submitting}>
              Войти
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
