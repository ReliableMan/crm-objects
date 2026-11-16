import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useHistory(taskId: string) {
  return useQuery({
    queryKey: ['history', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_status_history')
        .select('id, from_status, to_status, changed_at, comment, who:profiles ( full_name )')
        .eq('task_id', taskId)
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export type HistoryEntry = NonNullable<ReturnType<typeof useHistory>['data']>[number];
