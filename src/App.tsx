import { Navigate, Route, Routes } from 'react-router';
import { Stack, Text, Title } from '@mantine/core';
import { useAuth } from './auth/context';
import { RequireAuth } from './auth/RequireAuth';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { MyTasksPage } from './pages/MyTasksPage';
import { ObjectPage } from './pages/ObjectPage';
import { ObjectsPage } from './pages/ObjectsPage';
import { TaskPage } from './pages/TaskPage';

function HomeRedirect() {
  const { isManager } = useAuth();
  return <Navigate to={isManager ? '/objects' : '/my-tasks'} replace />;
}

function NotFound() {
  return (
    <Stack>
      <Title order={2}>Страница не найдена</Title>
      <Text c="dimmed">Проверьте адрес или вернитесь на главную.</Text>
    </Stack>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="objects" element={<ObjectsPage />} />
        <Route path="objects/:id" element={<ObjectPage />} />
        <Route path="tasks/:id" element={<TaskPage />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
