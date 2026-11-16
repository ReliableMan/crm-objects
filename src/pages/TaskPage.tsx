import { useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Anchor, Button, Divider, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useDeleteTask, useTask } from '../api/tasks';
import { useAuth } from '../auth/context';
import { StatusBadge } from '../components/StatusBadge';
import { StatusHistory } from '../components/StatusHistory';
import { TaskActions } from '../components/TaskActions';
import { TaskFormModal } from '../components/TaskFormModal';
import { toUserMessage } from '../lib/errors';
import { DATE_FORMAT } from '../lib/status';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <div>{children}</div>
    </div>
  );
}

export function TaskPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const task = useTask(id);
  const remove = useDeleteTask();
  const [editOpen, setEditOpen] = useState(false);

  if (task.isPending) return <Loader />;
  if (task.isError) return <Alert color="red">{toUserMessage(task.error)}</Alert>;
  if (!task.data) return <Text>Задача не найдена или нет доступа</Text>;

  const t = task.data;

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Удалить задачу?',
      children: <Text size="sm">«{t.title}» будет удалена вместе с записью о создании.</Text>,
      labels: { confirm: 'Удалить', cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(
          { id: t.id, objectId: t.object_id },
          { onSuccess: () => navigate(`/objects/${t.object_id}`) },
        ),
    });

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2}>{t.title}</Title>
          <Group gap="xs">
            <StatusBadge status={t.status} />
          </Group>
        </Stack>
        {isManager && (
          <Group gap="xs">
            {t.status !== 'accepted' && (
              <Button variant="default" onClick={() => setEditOpen(true)}>
                Редактировать
              </Button>
            )}
            {t.status === 'new' && (
              <Button variant="light" color="red" onClick={confirmDelete}>
                Удалить
              </Button>
            )}
          </Group>
        )}
      </Group>

      <TaskActions task={t} />

      <Paper withBorder p="md" radius="md">
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Field label="Объект">
              {t.object ? (
                <Anchor component={Link} to={`/objects/${t.object.id}`}>
                  {t.object.name}
                </Anchor>
              ) : (
                '—'
              )}
            </Field>
            <Field label="Исполнитель">{t.assignee?.full_name ?? '—'}</Field>
            <Field label="Автор">{t.author?.full_name ?? '—'}</Field>
            <Field label="Создана">{dayjs(t.created_at).format(DATE_FORMAT)}</Field>
          </SimpleGrid>
          <Divider />
          <Field label="Описание">
            <Text style={{ whiteSpace: 'pre-wrap' }} c={t.description ? undefined : 'dimmed'}>
              {t.description || 'Нет описания'}
            </Text>
          </Field>
        </Stack>
      </Paper>

      <Title order={4}>История статусов</Title>
      <StatusHistory taskId={t.id} />

      {isManager && (
        <TaskFormModal
          opened={editOpen}
          onClose={() => setEditOpen(false)}
          task={{
            id: t.id,
            status: t.status,
            title: t.title,
            description: t.description,
            object_id: t.object_id,
            assignee_id: t.assignee_id,
          }}
        />
      )}
    </Stack>
  );
}
