-- =====================================================================
-- Миграция 5. Уведомления о смене статуса и назначении задачи (сверх ТЗ).
-- Уведомления создаёт только база (триггеры); клиент может лишь читать свои
-- и отмечать их прочитанными.
-- Плюс инструмент администратора admin_delete_task — уборка за тестом безопасности.
-- =====================================================================

create type public.notification_kind as enum ('status_changed', 'task_assigned');

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  -- null — уведомление о переназначении (смена исполнителя в историю статусов не пишется)
  history_id  bigint references public.task_status_history (id) on delete cascade,
  kind        public.notification_kind not null,
  created_at  timestamptz not null default now(),
  read_at     timestamptz                       -- null = не прочитано
);

comment on table public.notifications is 'Уведомления пользователя. Создаются только триггерами базы.';

create index notifications_user_read_created_idx
  on public.notifications (user_id, read_at, created_at desc);
create index notifications_task_id_idx on public.notifications (task_id);
create index notifications_history_id_idx on public.notifications (history_id);

-- ---------- Триггер: новая запись в истории статусов ----------
-- • создание задачи (from_status null)       → исполнителю, task_assigned
-- • переход выполнил исполнитель (assignee)  → всем постановщикам, status_changed
-- • переход выполнил постановщик (manager)   → исполнителю, status_changed
create or replace function private.notify_on_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignee  uuid;
  v_actor     public.transition_actor;
begin
  select assignee_id into v_assignee from public.tasks where id = new.task_id;

  if new.from_status is null then
    insert into public.notifications (user_id, task_id, history_id, kind)
    values (v_assignee, new.task_id, new.id, 'task_assigned');
    return null;
  end if;

  select actor into v_actor
  from public.status_transitions
  where from_status = new.from_status and to_status = new.to_status;

  if v_actor = 'assignee' then
    insert into public.notifications (user_id, task_id, history_id, kind)
    select p.id, new.task_id, new.id, 'status_changed'
    from public.profiles p
    where p.role = 'manager' and p.id <> new.changed_by;
  elsif v_actor = 'manager' and v_assignee <> new.changed_by then
    insert into public.notifications (user_id, task_id, history_id, kind)
    values (v_assignee, new.task_id, new.id, 'status_changed');
  end if;

  return null;
end;
$$;

create trigger task_status_history_after_insert_notify
  after insert on public.task_status_history
  for each row execute function private.notify_on_status_history();

-- ---------- Триггер: смена исполнителя → уведомление новому исполнителю ----------
create or replace function private.notify_on_reassign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, task_id, history_id, kind)
  values (new.assignee_id, new.id, null, 'task_assigned');
  return null;
end;
$$;

create trigger tasks_after_update_notify_reassign
  after update of assignee_id on public.tasks
  for each row
  when (old.assignee_id is distinct from new.assignee_id)
  execute function private.notify_on_reassign();

-- ---------- Триггер: read_at ставит сервер ----------
-- Клиент может только отметить прочитанным (или снять отметку);
-- время прочтения — серверное, повторная отметка не меняет исходное время.
create or replace function private.notifications_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.read_at := case when new.read_at is null then null else coalesce(old.read_at, now()) end;
  return new;
end;
$$;

create trigger notifications_before_update
  before update on public.notifications
  for each row execute function private.notifications_before_update();

revoke all on function private.notify_on_status_history()     from public, anon, authenticated;
revoke all on function private.notify_on_reassign()           from public, anon, authenticated;
revoke all on function private.notifications_before_update()  from public, anon, authenticated;

-- ---------- Права и RLS ----------
alter table public.notifications enable row level security;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- insert / delete клиенту не выдаются: уведомления пишет только база

-- Свои уведомления и только по задачам, которые пользователь сейчас видит
-- (после переназначения прежний исполнитель не видит ни задачу, ни уведомления о ней).
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t where t.id = notifications.task_id)
  );

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- Realtime ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ---------- Сброс демо-данных теперь чистит и уведомления ----------
-- (иначе TRUNCATE упадёт: notifications ссылается на tasks и task_status_history)
create or replace function public.admin_reset_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  truncate table public.notifications, public.task_status_history, public.tasks, public.objects
    restart identity;
end;
$$;

revoke all on function public.admin_reset_demo() from public, anon, authenticated;
grant execute on function public.admin_reset_demo() to service_role;

-- ---------- Инструмент администратора: удалить тестовую задачу ----------
-- Тест безопасности переводит свою задачу в «В работе», а такую задачу триггер
-- tasks_before_delete удалить не даёт. Функция выключает этот триггер только внутри
-- своей транзакции (DDL в Postgres транзакционен, таблица на это время заблокирована)
-- и удаляет ТОЛЬКО задачи с названием «security-test: …». Доступна только service_role.
create or replace function public.admin_delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tasks where id = p_task_id and title like 'security-test:%'
  ) then
    raise exception 'Удалять можно только тестовые задачи (security-test: …)' using errcode = 'P0001';
  end if;

  alter table public.tasks disable trigger tasks_before_delete;
  delete from public.tasks where id = p_task_id;
  alter table public.tasks enable trigger tasks_before_delete;
end;
$$;

comment on function public.admin_delete_task is
  'Удаление тестовой задачи (security-test: …) в любом статусе. Только service_role.';

revoke all on function public.admin_delete_task(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_task(uuid) to service_role;
