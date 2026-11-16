import dayjs from 'dayjs';
import { Alert, Loader, Text, Timeline } from '@mantine/core';
import { useHistory } from '../api/history';
import { toUserMessage } from '../lib/errors';
import { DATE_FORMAT, STATUS_COLOR, STATUS_LABEL } from '../lib/status';

export function StatusHistory({ taskId }: { taskId: string }) {
  const history = useHistory(taskId);

  if (history.isPending) return <Loader size="sm" />;
  if (history.isError) return <Alert color="red">{toUserMessage(history.error)}</Alert>;
  if (history.data.length === 0) return <Text c="dimmed">История пуста</Text>;

  return (
    <Timeline active={history.data.length - 1} bulletSize={14} lineWidth={2}>
      {history.data.map((h) => (
        <Timeline.Item
          key={h.id}
          color={STATUS_COLOR[h.to_status]}
          title={
            h.from_status === null
              ? 'Задача создана'
              : `${STATUS_LABEL[h.from_status]} → ${STATUS_LABEL[h.to_status]}`
          }
        >
          <Text size="sm" c="dimmed">
            {h.who?.full_name ?? '—'} · {dayjs(h.changed_at).format(DATE_FORMAT)}
          </Text>
          {h.comment && (
            <Text size="sm" fs="italic" mt={4}>
              {h.comment}
            </Text>
          )}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
