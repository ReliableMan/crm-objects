import { useState } from 'react';
import { Button, Group } from '@mantine/core';
import { availableActions, useTransitions, type Transition } from '../api/transitions';
import { useChangeStatus } from '../api/tasks';
import { useAuth } from '../auth/context';
import type { TaskStatus } from '../lib/supabase';
import { CommentModal } from './CommentModal';

interface Props {
  task: { id: string; object_id: string; status: TaskStatus; assignee_id: string };
}

/** Кнопки переходов из status_transitions. База проверит каждый переход повторно. */
export function TaskActions({ task }: Props) {
  const { user, isManager } = useAuth();
  const transitions = useTransitions();
  const change = useChangeStatus();
  const [commentFor, setCommentFor] = useState<Transition | null>(null);

  const actions = availableActions(task, transitions.data ?? [], user?.id, isManager);
  if (actions.length === 0) return null;

  const run = (t: Transition, comment?: string) => {
    change.mutate(
      { taskId: task.id, objectId: task.object_id, to: t.to_status, comment },
      { onSuccess: () => setCommentFor(null) },
    );
  };

  return (
    <>
      <Group gap="sm">
        {actions.map((t) => (
          <Button
            key={t.to_status}
            color={t.to_status === 'rework' ? 'red' : t.to_status === 'accepted' ? 'green' : undefined}
            variant={t.to_status === 'rework' ? 'light' : 'filled'}
            loading={change.isPending && change.variables?.to === t.to_status}
            disabled={change.isPending}
            onClick={() => (t.comment_required ? setCommentFor(t) : run(t))}
          >
            {t.action_label}
          </Button>
        ))}
      </Group>

      <CommentModal
        key={commentFor?.to_status ?? 'none'}
        opened={commentFor !== null}
        title={commentFor?.action_label ?? ''}
        submitLabel={commentFor?.action_label ?? 'Отправить'}
        loading={change.isPending}
        onClose={() => setCommentFor(null)}
        onSubmit={(comment) => commentFor && run(commentFor, comment)}
      />
    </>
  );
}
