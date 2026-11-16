import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Во фронтенде — только публичный ключ (anon / publishable).
// Права проверяет база: RLS, права на колонки, триггеры и RPC.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY. Скопируйте .env.example в .env и заполните.',
  );
}

export const supabase = createClient<Database>(url, anonKey);

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TaskStatus = Database['public']['Enums']['task_status'];
export type UserRole = Database['public']['Enums']['user_role'];
