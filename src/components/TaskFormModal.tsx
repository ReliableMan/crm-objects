import { Button, Group, Modal, Select, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useObjects } from '../api/objects';
import { useExecutors } from '../api/profiles';
import { useCreateTask, useUpdateTask, type TaskInput } from '../api/tasks';
import type { TaskStatus } from '../lib/supabase';

interface EditableTask extends TaskInput {
  id: string;
  status: TaskStatus;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Передана — редактирование, нет — создание */
  task?: EditableTask;
  /** Предвыбранный объект при создании из карточки объекта */
  defaultObjectId?: string;
  onCreated?: (id: string) => void;
}

export function TaskFormModal({ opened, onClose, task, defaultObjectId, onCreated }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={task ? 'Редактировать задачу' : 'Новая задача'} size="lg">
      {opened && (
        <TaskForm
          key={task?.id ?? 'new'}
          task={task}
          defaultObjectId={defaultObjectId}
          onDone={onClose}
          onCreated={onCreated}
        />
      )}
    </Modal>
  );
}

interface FormProps {
  task?: EditableTask;
  defaultObjectId?: string;
  onDone: () => void;
  onCreated?: (id: string) => void;
}

function TaskForm({ task, defaultObjectId, onDone, onCreated }: FormProps) {
  const objects = useObjects();
  const executors = useExecutors();
  const create = useCreateTask();
  const update = useUpdateTask();

  // Подсказка интерфейса; то же правило проверяет триггер tasks_before_update
  const assigneeLocked = task !== undefined && task.status !== 'new' && task.status !== 'rework';

  const form = useForm({
    initialValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      object_id: task?.object_id ?? defaultObjectId ?? null,
      assignee_id: task?.assignee_id ?? null,
    } as { title: string; description: string; object_id: string | null; assignee_id: string | null },
    validate: {
      title: (v) => (v.trim().length > 0 ? null : 'Обязательное поле'),
      object_id: (v) => (v ? null : 'Выберите объект'),
      assignee_id: (v) => (v ? null : 'Выберите исполнителя'),
    },
  });

  const submit = form.onSubmit((v) => {
    const input: TaskInput = {
      title: v.title.trim(),
      description: v.description.trim(),
      object_id: v.object_id!,
      assignee_id: v.assignee_id!,
    };
    if (task) {
      update.mutate({ id: task.id, previousObjectId: task.object_id, ...input }, { onSuccess: onDone });
    } else {
      create.mutate(input, {
        onSuccess: (row) => {
          onDone();
          onCreated?.(row.id);
        },
      });
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <TextInput label="Название" withAsterisk data-autofocus {...form.getInputProps('title')} />
        <Textarea label="Описание" autosize minRows={3} {...form.getInputProps('description')} />
        <Select
          label="Объект"
          withAsterisk
          searchable
          placeholder={objects.isPending ? 'Загрузка…' : 'Выберите объект'}
          data={(objects.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
          {...form.getInputProps('object_id')}
        />
        <Select
          label="Исполнитель"
          withAsterisk
          placeholder={executors.isPending ? 'Загрузка…' : 'Выберите исполнителя'}
          data={(executors.data ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
          disabled={assigneeLocked}
          description={
            assigneeLocked ? 'Сменить исполнителя можно в статусах «Новая» и «На доработке»' : undefined
          }
          {...form.getInputProps('assignee_id')}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Отмена
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
