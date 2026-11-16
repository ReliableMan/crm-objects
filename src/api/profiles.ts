import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useExecutors() {
  return useQuery({
    queryKey: ['executors'],
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
