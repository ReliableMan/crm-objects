import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, type Tables, type TaskStatus } from '../lib/supabase';
import { invalidate, notifyError, notifySuccess } from './common';
import { queryKeys } from './queryKeys';

export interface TaskInput {
  object_id: string;
  title: string;
  description: string;
  assignee_id: string;
}

async function fetchTask(id: string) {
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
}

export type TaskDetails = NonNullable<Awaited<ReturnType<typeof fetchTask>>>;

export function useTask(id: string) {
  return useQuery({ queryKey: queryKeys.task(id), queryFn: () => fetchTask(id) });
}

export function useMyTasks(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.myTasks(),
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
    onSuccess: async (_data, input) => {
      notifySuccess('Задача создана');
      await invalidate(qc, [queryKeys.object(input.object_id), queryKeys.objects(), queryKeys.myTasks()]);
    },
    onError: notifyError,
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: TaskInput & { id: string; previousObjectId: string }) => {
      const fields: TaskInput = {
        object_id: v.object_id,
        title: v.title,
        description: v.description,
        assignee_id: v.assignee_id,
      };
      const { data, error } = await supabase.from('tasks').update(fields).eq('id', v.id).select('id');
      if (error) throw error;
      if (data.length === 0) throw new Error('Задача не найдена или нет доступа');
    },
    onSuccess: async (_data, v) => {
      notifySuccess('Задача сохранена');
      // Задача могла переехать на другой объект — обновляем обе карточки
      await invalidate(qc, [
        queryKeys.task(v.id),
        queryKeys.object(v.previousObjectId),
        queryKeys.object(v.object_id),
        queryKeys.objects(),
        queryKeys.myTasks(),
      ]);
    },
    onError: notifyError,
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; objectId: string }) => {
      const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('id');
      if (error) throw error;
      if (data.length === 0) throw new Error('Задача не найдена или нет доступа');
    },
    onSuccess: async (_data, { objectId }) => {
      notifySuccess('Задача удалена');
      await invalidate(qc, [queryKeys.object(objectId), queryKeys.objects(), queryKeys.myTasks()]);
    },
    onError: notifyError,
  });
}

/** Единственный путь смены статуса — RPC; база проверит переход, роль и комментарий. */
export function useChangeStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { taskId: string; objectId: string; to: TaskStatus; comment?: string }) => {
      const { data, error } = await supabase
        .rpc('change_task_status', {
          p_task_id: args.taskId,
          p_to: args.to,
          ...(args.comment ? { p_comment: args.comment } : {}),
        })
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (row: Tables<'tasks'>, { taskId, objectId }) => {
      // а) RPC вернула обновлённую задачу — сразу кладём её в кэш:
      //    статус и кнопки меняются мгновенно, не дожидаясь перезапроса
      qc.setQueryData<TaskDetails | null>(queryKeys.task(taskId), (old) =>
        old ? { ...old, status: row.status, updated_at: row.updated_at } : old,
      );
      notifySuccess('Статус изменён');
      // б) и дожидаемся перезапроса всего, что зависит от статуса
      await invalidate(qc, [
        queryKeys.task(taskId),
        queryKeys.history(taskId),
        queryKeys.myTasks(),
        queryKeys.object(objectId),
        queryKeys.objects(),
      ]);
    },
    onError: notifyError,
  });
}
