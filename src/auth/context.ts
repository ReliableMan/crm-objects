import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Tables } from '../lib/supabase';

export type Profile = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'role'>;

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** null — сессии нет или профиль не найден */
  profile: Profile | null;
  /** Только для отображения (какие кнопки рисовать). Права проверяет база. */
  isManager: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вызван вне AuthProvider');
  return ctx;
}
