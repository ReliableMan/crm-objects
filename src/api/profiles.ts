import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from './queryKeys';

export function useExecutors() {
  return useQuery({
    queryKey: queryKeys.executors(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'executor')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });
}
