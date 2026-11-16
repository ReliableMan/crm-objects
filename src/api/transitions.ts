import { useQuery } from '@tanstack/react-query';
import { supabase, type Tables, type TaskStatus } from '../lib/supabase';
import { queryKeys } from './queryKeys';

export type Transition = Tables<'status_transitions'>;

export function useTransitions() {
  return useQuery({
    queryKey: queryKeys.transitions(),
    staleTime: Infinity,
    queryFn: async (): Promise<Transition[]> => {
      const { data, error } = await supabase.from('status_transitions').select('*');
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Какие кнопки показать. Это только UX: те же правила проверяет база
 * в change_task_status по той же таблице status_transitions.
 */
export function availableActions(
  task: { status: TaskStatus; assignee_id: string },
  transitions: readonly Transition[],
  userId: string | undefined,
  isManager: boolean,
): Transition[] {
  return transitions.filter(
    (t) =>
      t.from_status === task.status &&
      (t.actor === 'manager' ? isManager : task.assignee_id === userId),
  );
}
