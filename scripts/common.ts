// Общие помощники для локальных скриптов (seed, security-test).
// Файл выполняется только на машине разработчика через tsx и в сборку фронтенда не попадает.
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types.ts';

export type Db = SupabaseClient<Database>;
export type TaskStatus = Database['public']['Enums']['task_status'];
export type UserRole = Database['public']['Enums']['user_role'];

export type DemoUserKey = 'manager' | 'ivan' | 'petr';

export interface DemoUser {
  key: DemoUserKey;
  email: string;
  fullName: string;
  role: UserRole;
}

export const DEMO_USERS: readonly DemoUser[] = [
  { key: 'manager', email: 'manager@example.com', fullName: 'Анна Руководитель', role: 'manager' },
  { key: 'ivan', email: 'ivan@example.com', fullName: 'Иван Петров', role: 'executor' },
  { key: 'petr', email: 'petr@example.com', fullName: 'Пётр Сидоров', role: 'executor' },
];

export function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

/** Читает переменные окружения и падает с понятной ошибкой, если чего-то нет. */
export function requireEnv<K extends string>(names: readonly K[]): Record<K, string> {
  const missing = names.filter((n) => !process.env[n]?.trim());
  if (missing.length > 0) {
    fail(
      `Не заданы переменные окружения: ${missing.join(', ')}.\n` +
        '  Скопируйте .env.example в .env и заполните значения.',
    );
  }
  const env = {} as Record<K, string>;
  for (const n of names) env[n] = process.env[n]!.trim();
  return env;
}

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Клиент с публичным ключом — ровно то, что доступно браузеру. */
export function createPublicClient(url: string, anonKey: string): Db {
  return createClient<Database>(url, anonKey, { auth: NO_SESSION });
}

/** Клиент с сервисным ключом. Только для seed — обходит RLS. */
export function createAdminClient(url: string, serviceKey: string): Db {
  return createClient<Database>(url, serviceKey, { auth: NO_SESSION });
}

/** Входит под демо-пользователем и возвращает его клиент. */
export async function signIn(
  url: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<{ client: Db; userId: string }> {
  const client = createPublicClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    fail(
      `Не удалось войти как ${email}: ${error?.message ?? 'нет пользователя'}.\n` +
        '  Проверьте DEMO_PASSWORD в .env (пароль существующих пользователей seed не меняет).',
    );
  }
  return { client, userId: data.user.id };
}

interface SupabaseResult<T> {
  data: T;
  error: { message: string; code?: string } | null;
}

/** Для операций без данных в ответе: при ошибке печатает её и завершает процесс. */
export function mustOk(context: string, result: Pick<SupabaseResult<unknown>, 'error'>): void {
  if (result.error) {
    const code = result.error.code ? ` [${result.error.code}]` : '';
    fail(`${context}: ${result.error.message}${code}`);
  }
}

/** Разворачивает ответ Supabase: при ошибке печатает её и завершает процесс. */
export function must<T>(context: string, result: SupabaseResult<T>): NonNullable<T> {
  if (result.error) {
    const code = result.error.code ? ` [${result.error.code}]` : '';
    fail(`${context}: ${result.error.message}${code}`);
  }
  if (result.data === null || result.data === undefined) {
    fail(`${context}: пустой ответ`);
  }
  return result.data;
}
