/**
 * Единственное место, где описаны ключи запросов. И useQuery, и invalidateQueries
 * берут ключи только отсюда — так ключ запроса и ключ инвалидации не разойдутся.
 *
 * id нормализуются (trim + нижний регистр): uuid из адресной строки (useParams)
 * может отличаться регистром от uuid из ответа базы.
 */
const norm = (id: string) => id.trim().toLowerCase();

export const queryKeys = {
  objects: () => ['objects'] as const,
  /** Префикс всех карточек объектов */
  objectAll: () => ['object'] as const,
  object: (id: string) => ['object', norm(id)] as const,
  /** Префикс всех карточек задач */
  taskAll: () => ['task'] as const,
  task: (id: string) => ['task', norm(id)] as const,
  history: (taskId: string) => ['history', norm(taskId)] as const,
  myTasks: () => ['my-tasks'] as const,
  transitions: () => ['transitions'] as const,
  executors: () => ['executors'] as const,
  profile: (userId: string | undefined) => ['profile', userId ? norm(userId) : null] as const,
  /** Префикс всех запросов уведомлений */
  notifications: () => ['notifications'] as const,
  notificationsList: () => ['notifications', 'list'] as const,
  notificationsUnread: () => ['notifications', 'unread'] as const,
};
