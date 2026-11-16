import { useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router';
import { Alert, Loader, SegmentedControl, Stack, Table, Text, Title } from '@mantine/core';
import { useMyTasks } from '../api/tasks';
import { useAuth } from '../auth/context';
import { StatusBadge } from '../components/StatusBadge';
import { toUserMessage } from '../lib/errors';
import { DATE_FORMAT } from '../lib/status';
import type { TaskStatus } from '../lib/supabase';

const FILTERS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'review', label: 'На проверке' },
  { value: 'rework', label: 'На доработке' },
  { value: 'accepted', label: 'Принятые' },
];

export function MyTasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tasks = useMyTasks(user?.id);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');

  if (tasks.isPending) return <Loader />;
  if (tasks.isError) return <Alert color="red">{toUserMessage(tasks.error)}</Alert>;

  const count = (f: TaskStatus | 'all') =>
    f === 'all' ? tasks.data.length : tasks.data.filter((t) => t.status === f).length;
  const visible = filter === 'all' ? tasks.data : tasks.data.filter((t) => t.status === filter);

  return (
    <Stack>
      <Title order={2}>Мои задачи</Title>

      <SegmentedControl
        value={filter}
        onChange={(v) => setFilter(v as TaskStatus | 'all')}
        data={FILTERS.map((f) => ({ value: f.value, label: `${f.label} (${count(f.value)})` }))}
        style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}
      />

      {visible.length === 0 ? (
        <Text c="dimmed">{tasks.data.length === 0 ? 'Задач пока нет' : 'Нет задач в этом статусе'}</Text>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Задача</Table.Th>
                <Table.Th>Объект</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th>Создана</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((t) => (
                <Table.Tr
                  key={t.id}
                  style={{ cursor: 'pointer' }}
                  // «На доработке» — то, что требует внимания исполнителя
                  bg={t.status === 'rework' ? 'var(--mantine-color-red-light)' : undefined}
                  onClick={() => navigate(`/tasks/${t.id}`)}
                >
                  <Table.Td fw={t.status === 'rework' ? 600 : 500}>{t.title}</Table.Td>
                  <Table.Td>{t.object?.name ?? '—'}</Table.Td>
                  <Table.Td>
                    <StatusBadge status={t.status} />
                  </Table.Td>
                  <Table.Td>{dayjs(t.created_at).format(DATE_FORMAT)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
