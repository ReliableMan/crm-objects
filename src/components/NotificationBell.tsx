import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Indicator,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { notifications as toast } from '@mantine/notifications';
import {
  describeNotification,
  fetchNotification,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
  type NotificationItem,
} from '../api/notifications';
import { invalidate } from '../api/common';
import { queryKeys } from '../api/queryKeys';
import { useAuth } from '../auth/context';
import { supabase, type Tables } from '../lib/supabase';

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * Подписка Realtime на новые уведомления текущего пользователя.
 * Если WebSocket недоступен, список всё равно обновится опросом (refetchInterval).
 */
function useRealtimeNotifications(userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    // Уникальное имя канала: в StrictMode эффект монтируется дважды
    const channel = supabase
      .channel(`notifications:${userId}:${crypto.randomUUID()}`)
      .on<Tables<'notifications'>>(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const { id, task_id } = payload.new;
          void (async () => {
            const n = await fetchNotification(id).catch(() => null);
            if (n) {
              const { text, comment } = describeNotification(n);
              toast.show({ title: 'Новое уведомление', message: comment ? `${text}. ${comment}` : text });
            }
            // Задача изменилась у другого пользователя — обновляем её данные
            await invalidate(qc, [
              queryKeys.notifications(),
              queryKeys.task(task_id),
              queryKeys.history(task_id),
              queryKeys.myTasks(),
              queryKeys.objectAll(),
              queryKeys.objects(),
            ]);
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);
  const enabled = Boolean(user);
  const list = useNotifications(enabled);
  const unread = useUnreadCount(enabled);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  useRealtimeNotifications(user?.id);

  const count = unread.data ?? 0;

  const open = (n: NotificationItem) => {
    setOpened(false);
    if (!n.read_at) markRead.mutate(n.id);
    navigate(`/tasks/${n.task_id}`);
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={360} shadow="md" withArrow>
      <Popover.Target>
        <Indicator label={count > 99 ? '99+' : count} size={16} disabled={count === 0} offset={4} color="red">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label={count > 0 ? `Уведомления: ${count} непрочитанных` : 'Уведомления'}
            onClick={() => setOpened((o) => !o)}
          >
            <BellIcon />
          </ActionIcon>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p={0}>
        <Group justify="space-between" px="md" py="xs">
          <Text fw={600}>Уведомления</Text>
          <Button
            size="compact-xs"
            variant="subtle"
            disabled={count === 0}
            loading={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Прочитать все
          </Button>
        </Group>
        <Divider />
        {list.isPending ? (
          <Box p="md">
            <Loader size="sm" />
          </Box>
        ) : !list.data || list.data.length === 0 ? (
          <Text c="dimmed" size="sm" p="md">
            Уведомлений пока нет
          </Text>
        ) : (
          <ScrollArea.Autosize mah={420}>
            <Stack gap={0}>
              {list.data.map((n) => {
                const { text, comment } = describeNotification(n);
                const isUnread = !n.read_at;
                return (
                  <UnstyledButton
                    key={n.id}
                    onClick={() => open(n)}
                    px="md"
                    py="xs"
                    style={{
                      borderBottom: '1px solid var(--mantine-color-default-border)',
                      background: isUnread ? 'var(--mantine-color-blue-light)' : undefined,
                    }}
                  >
                    <Text size="sm" fw={isUnread ? 600 : 400}>
                      {text}
                    </Text>
                    {comment && (
                      <Text size="sm" fs="italic" c="dimmed">
                        {comment}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed" mt={2}>
                      {dayjs(n.created_at).fromNow()}
                    </Text>
                  </UnstyledButton>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
