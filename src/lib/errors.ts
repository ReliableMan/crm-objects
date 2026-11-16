import { isAuthError } from '@supabase/supabase-js';
import { STATUS_LABEL } from './status';
import type { TaskStatus } from './supabase';

const CYRILLIC = /[а-яё]/i;

/** «Переход из статуса «review» в «accepted» запрещён» → «…«На проверке» в «Принята»…» */
function humanizeStatuses(message: string): string {
  return message.replace(/«(new|in_progress|review|accepted|rework)»/g, (_, s: TaskStatus) => `«${STATUS_LABEL[s]}»`);
}

function hasCode(e: unknown): e is { code: string; message: string } {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { code?: unknown }).code === 'string' &&
    typeof (e as { message?: unknown }).message === 'string'
  );
}

/**
 * Переводит ошибку Supabase (PostgrestError / AuthError) в понятный текст.
 * Решения о правах здесь не принимаются — только отображение того, что ответила база.
 */
export function toUserMessage(error: unknown): string {
  if (isAuthError(error)) {
    if (error.code === 'invalid_credentials') return 'Неверный email или пароль';
    console.error(error);
    return 'Не удалось войти. Попробуйте ещё раз';
  }

  if (hasCode(error)) {
    switch (error.code) {
      case '42501':
        // Наши функции и триггеры пишут понятные сообщения по-русски
        return CYRILLIC.test(error.message) ? error.message : 'Недостаточно прав для этого действия';
      case '23503':
        return 'Нельзя удалить: есть связанные задачи';
      case '23514':
        return 'Заполните обязательные поля';
      case 'P0001':
      case 'P0002':
        return humanizeStatuses(error.message);
    }
  }

  console.error(error);
  return 'Что-то пошло не так';
}
