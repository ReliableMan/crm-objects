import { useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router';
import { Alert, Button, Group, Loader, SegmentedControl, Stack, Table, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useDeleteObject, useObject } from '../api/objects';
import { useAuth } from '../auth/context';
import { ObjectFormModal } from '../components/ObjectFormModal';
import { StatusBadge } from '../components/StatusBadge';
import { TaskFormModal } from '../components/TaskFormModal';
import { toUserMessage } from '../lib/errors';
import { DATE_FORMAT, STATUS_LABEL, STATUS_ORDER } from '../lib/status';
import type { TaskStatus } from '../lib/supabase';

export function ObjectPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const object = useObject(id);
  const remove = useDeleteObject();
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');

  if (object.isPending) return <Loader />;
  if (object.isError) return <Alert color="red">{toUserMessage(object.error)}</Alert>;
  if (!object.data) return <Text>Объект не найден или нет доступа</Text>;

  const o = object.data;
  const tasks = filter === 'all' ? o.tasks : o.tasks.filter((t) => t.status === filter);

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Удалить объект?',
      children: <Text size="sm">«{o.name}» будет удалён. Объект с задачами удалить нельзя.</Text>,
      labels: { confirm: 'Удалить', cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(o.id, { onSuccess: () => navigate('/objects') }),
    });

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{o.name}</Title>
          <Text c="dimmed">{o.address}</Text>
        </div>
        {isManager && (
          <Group gap="xs">
            <Button onClick={() => setTaskOpen(true)}>Новая задача</Button>
            <Button variant="default" onClick={() => setEditOpen(true)}>
              Изменить
            </Button>
            <Button variant="light" color="red" onClick={confirmDelete}>
              Удалить
            </Button>
          </Group>
        )}
      </Group>

      <Group justify="space-between">
        <Title order={4}>Задачи</Title>
        {o.tasks.length > 0 && (
          <SegmentedControl
            size="xs"
            value={filter}
            onChange={(v) => setFilter(v as TaskStatus | 'all')}
            data={[
              { value: 'all', label: 'Все' },
              ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
            ]}
          />
        )}
      </Group>

      {tasks.length === 0 ? (
        <Text c="dimmed">{o.tasks.length === 0 ? 'Задач пока нет' : 'Нет задач в этом статусе'}</Text>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Название</Table.Th>
                <Table.Th>Исполнитель</Table.Th>
                <Table.Th>Статус</Table.Th>
                <Table.Th>Создана</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tasks.map((t) => (
                <Table.Tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks/${t.id}`)}>
                  <Table.Td fw={500}>{t.title}</Table.Td>
                  <Table.Td>{t.assignee?.full_name ?? '—'}</Table.Td>
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

      {isManager && (
        <>
          <ObjectFormModal opened={editOpen} onClose={() => setEditOpen(false)} object={o} />
          <TaskFormModal
            opened={taskOpen}
            onClose={() => setTaskOpen(false)}
            defaultObjectId={o.id}
          />
        </>
      )}
    </Stack>
  );
}
