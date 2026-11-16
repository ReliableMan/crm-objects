import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert, Button, Group, Loader, Table, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useDeleteObject, useObjects, type ObjectListItem } from '../api/objects';
import { useAuth } from '../auth/context';
import { ObjectFormModal } from '../components/ObjectFormModal';
import { toUserMessage } from '../lib/errors';

export function ObjectsPage() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const objects = useObjects();
  const remove = useDeleteObject();
  const [form, setForm] = useState<{ object?: ObjectListItem } | null>(null);

  const confirmDelete = (o: ObjectListItem) =>
    modals.openConfirmModal({
      title: 'Удалить объект?',
      children: <Text size="sm">«{o.name}» будет удалён. Объект с задачами удалить нельзя.</Text>,
      labels: { confirm: 'Удалить', cancel: 'Отмена' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(o.id),
    });

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Объекты</Title>
        {isManager && <Button onClick={() => setForm({})}>Новый объект</Button>}
      </Group>

      {objects.isPending ? (
        <Loader />
      ) : objects.isError ? (
        <Alert color="red">{toUserMessage(objects.error)}</Alert>
      ) : objects.data.length === 0 ? (
        <Text c="dimmed">Объектов пока нет</Text>
      ) : (
        <Table.ScrollContainer minWidth={600}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Название</Table.Th>
                <Table.Th>Адрес</Table.Th>
                <Table.Th ta="right">Задач</Table.Th>
                {isManager && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {objects.data.map((o) => (
                <Table.Tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/objects/${o.id}`)}>
                  <Table.Td fw={500}>{o.name}</Table.Td>
                  <Table.Td>{o.address}</Table.Td>
                  <Table.Td ta="right">{o.taskCount}</Table.Td>
                  {isManager && (
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Group gap="xs" justify="flex-end" wrap="nowrap">
                        <Button size="compact-sm" variant="default" onClick={() => setForm({ object: o })}>
                          Изменить
                        </Button>
                        <Button size="compact-sm" variant="light" color="red" onClick={() => confirmDelete(o)}>
                          Удалить
                        </Button>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {isManager && (
        <ObjectFormModal opened={form !== null} onClose={() => setForm(null)} object={form?.object} />
      )}
    </>
  );
}
