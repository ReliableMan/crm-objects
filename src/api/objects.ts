import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { invalidateWorkData, notifyError, notifySuccess } from './common';

export interface ObjectInput {
  name: string;
  address: string;
}

/** Для исполнителя RLS сам вернёт только «его» объекты, а tasks(count) — только его задачи. */
export function useObjects() {
  return useQuery({
    queryKey: ['objects'],
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
    queryKey: ['object', id],
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
    onSuccess: () => {
      notifySuccess('Объект создан');
      return invalidateWorkData(qc);
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
    onSuccess: () => {
      notifySuccess('Объект сохранён');
      return invalidateWorkData(qc);
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
    onSuccess: () => {
      notifySuccess('Объект удалён');
      return invalidateWorkData(qc);
    },
    onError: notifyError,
  });
}
