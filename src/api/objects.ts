import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invalidate, notifyError, notifySuccess } from './common';
import { queryKeys } from './queryKeys';

export interface ObjectInput {
  name: string;
  address: string;
}

/** Для исполнителя RLS сам вернёт только «его» объекты, а tasks(count) — только его задачи. */
export function useObjects() {
  return useQuery({
    queryKey: queryKeys.objects(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objects')
        .select('id, name, address, created_at, tasks(count)')
        .order('name');
      if (error) throw error;
      return data.map(({ tasks, ...o }) => ({ ...o, taskCount: tasks[0]?.count ?? 0 }));
    },
  });
}

export type ObjectListItem = NonNullable<ReturnType<typeof useObjects>['data']>[number];

export function useObject(id: string) {
  return useQuery({
    queryKey: queryKeys.object(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objects')
        .select(
          `id, name, address, created_at,
           tasks ( id, title, status, created_at,
                   assignee:profiles!tasks_assignee_id_fkey ( full_name ) )`,
        )
        .eq('id', id)
        .order('created_at', { referencedTable: 'tasks', ascending: true })
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ObjectInput) => {
      const { data, error } = await supabase.from('objects').insert(input).select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      notifySuccess('Объект создан');
      await invalidate(qc, [queryKeys.objects()]);
    },
    onError: notifyError,
  });
}

export function useUpdateObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ObjectInput & { id: string }) => {
      const { data, error } = await supabase.from('objects').update(input).eq('id', id).select('id');
      if (error) throw error;
      if (data.length === 0) throw new Error('Объект не найден или нет доступа');
    },
    onSuccess: async (_data, { id }) => {
      notifySuccess('Объект сохранён');
      // Название объекта показывается и в карточках задач, и в «Моих задачах»
      await invalidate(qc, [queryKeys.objects(), queryKeys.object(id), queryKeys.taskAll(), queryKeys.myTasks()]);
    },
    onError: notifyError,
  });
}

export function useDeleteObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('objects').delete().eq('id', id).select('id');
      if (error) throw error;
      if (data.length === 0) throw new Error('Объект не найден или нет доступа');
    },
    onSuccess: async () => {
      notifySuccess('Объект удалён');
      await invalidate(qc, [queryKeys.objects()]);
    },
    onError: notifyError,
  });
}
