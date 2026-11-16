-- =====================================================================
-- Миграция 4. Инструмент администратора: сброс демо-данных.
-- Вызывается только скриптом `npm run seed:reset` под сервисным ключом.
-- Пользователям (anon / authenticated) недоступна.
-- Пользователей и профили не трогает.
-- =====================================================================

create or replace function public.admin_reset_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- TRUNCATE не запускает построчные триггеры, поэтому удаляет и принятые задачи
  -- (триггер tasks_before_delete при этом не ослабляется).
  truncate table public.task_status_history, public.tasks, public.objects restart identity;
end;
$$;

comment on function public.admin_reset_demo is
  'Сброс демо-данных (объекты, задачи, история). Только service_role.';

revoke all on function public.admin_reset_demo() from public, anon, authenticated;
grant execute on function public.admin_reset_demo() to service_role;
