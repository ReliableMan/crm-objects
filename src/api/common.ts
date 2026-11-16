import type { QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { toUserMessage } from '../lib/errors';

export function notifyError(e: unknown): void {
  notifications.show({ color: 'red', title: 'Ошибка', message: toUserMessage(e) });
}

export function notifySuccess(message: string): void {
  notifications.show({ color: 'green', message });
}

/**
 * Объекты, задачи и история связаны (счётчики задач, видимость объектов, статусы),
 * поэтому после любой мутации обновляем все ключи этих сущностей.
 */
export function invalidateWorkData(qc: QueryClient): Promise<void> {
  return Promise.all(
    [['objects'], ['object'], ['task'], ['history'], ['my-tasks']].map((queryKey) =>
      qc.invalidateQueries({ queryKey }),
    ),
  ).then(() => undefined);
}
