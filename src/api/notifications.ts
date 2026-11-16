import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STATUS_LABEL } from '../lib/status';
import { supabase } from '../lib/supabase';
import { invalidate, notifyError } from './common';
import { queryKeys } from './queryKeys';

/** Страховка на случай, если WebSocket (Realtime) недоступен. */
const POLL_MS = 30_000;
const LIMIT = 20;

const SELECT = `id, kind, created_at, read_at, task_id,
  task:tasks ( id, title ),
  history:task_status_history ( from_status, to_status, comment, who:profiles ( full_name ) )` as const;

async function fetchNotifications() {
  // RLS вернёт только свои уведомления и только по задачам, которые пользователь видит
  const { data, error } = await supabase
    .from('notifications')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return data;
}

export type NotificationItem = Awaited<ReturnType<typeof fetchNotifications>>[number];

export async function fetchNotification(id: number): Promise<NotificationItem | null> {
  const { data, error } = await supabase.from('notifications').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notificationsList(),
    enabled,
    refetchInterval: POLL_MS,
    queryFn: fetchNotifications,
  });
}

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notificationsUnread(),
    enabled,
    refetchInterval: POLL_MS,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Время прочтения ставит сервер (триггер), клиент лишь сообщает «прочитано». */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, [queryKeys.notifications()]),
    onError: notifyError,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // RLS ограничит обновление своими уведомлениями
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, [queryKeys.notifications()]),
    onError: notifyError,
  });
}

/** «Иван Петров: «Монтаж опалубки» → На проверке» и комментарий для «На доработке». */
export function describeNotification(n: NotificationItem): { text: string; comment: string | null } {
  const title = n.task ? `«${n.task.title}»` : 'задача';
  const who = n.history?.who?.full_name ?? 'Кто-то';

  if (n.kind === 'task_assigned') {
    return {
      text: n.history ? `${who}: новая задача ${title}` : `Вам назначена задача ${title}`,
      comment: null,
    };
  }
  if (!n.history) return { text: `Изменён статус: ${title}`, comment: null };
  return {
    text: `${who}: ${title} → ${STATUS_LABEL[n.history.to_status]}`,
    comment: n.history.to_status === 'rework' ? n.history.comment : null,
  };
}
