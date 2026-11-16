import type { TaskStatus, UserRole } from './supabase';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'gray',
  in_progress: 'blue',
  review: 'yellow',
  accepted: 'green',
  rework: 'red',
};

/** Порядок статусов для фильтров. */
export const STATUS_ORDER: readonly TaskStatus[] = ['new', 'in_progress', 'review', 'rework', 'accepted'];

export const ROLE_LABEL: Record<UserRole, string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
};

export const DATE_FORMAT = 'DD.MM.YYYY HH:mm';
