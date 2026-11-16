import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { toUserMessage } from '../lib/errors';

export function notifyError(e: unknown): void {
  notifications.show({ color: 'red', title: 'Ошибка', message: toUserMessage(e) });
}

export function notifySuccess(message: string): void {
  notifications.show({ color: 'green', message });
}

/** Инвалидирует ключи и дожидается перезапроса активных запросов. */
export async function invalidate(qc: QueryClient, keys: readonly QueryKey[]): Promise<void> {
  await Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}
