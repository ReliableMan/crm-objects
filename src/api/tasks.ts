import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, type TaskStatus } from '../lib/supabase';
import { invalidateWorkData, notifyError, notifySuccess } from './common';

export interface TaskInput {
  object_id: string;
  title: string;
  description: string;
  assignee_id: string;
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          `id, title, description, status, created_at, updated_at, assignee_id, author_id, object_id,
           object:objects ( id, name ),
           assignee:profiles!tasks_assignee_id_fkey ( full_name ),
           author:profiles!tasks_author_id_fkey ( full_name )`,
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type TaskDetails = NonNullable<NonNullable<ReturnType<typeof useTask>['data']>>;

export function useMyTasks(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-tasks'],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, created_at, object:objects ( id, name )')
        .eq('assignee_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** status и author_id не передаём: их ставит база (и права на эти колонки у клиента нет). */
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      const { data, error } = await supabase.from('tasks').insert(input).select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      notifySuccess('Задача создана');
      return invalidateWorkData(qc);
    },
    onError: notifyError,
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: TaskInput & { id: string }) => {
      const { data, error } = await supabase.from('tasks').update(input).eq('id', id).select('id');
      if (error) throw error;
      if (data.length === 0) throw new Error('Задача не найдена или нет доступа');
    },
    onSuccess: () => {
      notifySuccess('Задача сохранена');
      return invalidateWorkData(qc);
    },
    onError: notifyError,
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id');
      if (error) throw error;
      if (data.length === 0) throw new Error('Задача не найдена или нет доступа');
    },
    onSuccess: () => {
      notifySuccess('Задача удалена');
      return invalidateWorkData(qc);
    },
    onError: notifyError,
  });
}

/** Единственный путь смены статуса — RPC; база проверит переход, роль и комментарий. */
export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { taskId: string; to: TaskStatus; comment?: string }) => {
      const { error } = await supabase.rpc('change_task_status', {
        p_task_id: args.taskId,
        p_to: args.to,
        ...(args.comment ? { p_comment: args.comment } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notifySuccess('Статус изменён');
      return invalidateWorkData(qc);
    },
    onError: notifyError,
  });
}
