-- =====================================================================
-- Миграция 2. Функции и триггеры: бизнес-правила на стороне базы.
-- Служебные функции лежат в схеме private — она не публикуется в API.
-- =====================================================================

create schema if not exists private;

-- ---------- Помощник: текущий пользователь — постановщик? ----------
-- SECURITY DEFINER, чтобы не зависеть от RLS на profiles и не ловить рекурсию.
create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager'
  );
$$;

-- ---------- Профиль создаётся автоматически при создании пользователя ----------
-- Роль всегда executor: постановщика назначает администратор вручную.
-- Роль из metadata НЕ берём — её задаёт клиент.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- Проверка, что исполнитель задачи имеет роль executor ----------
create or replace function private.assert_executor(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = p_user_id and role = 'executor'
  ) then
    raise exception 'Исполнителем можно назначить только пользователя с ролью «Исполнитель»'
      using errcode = 'P0001';
  end if;
end;
$$;

-- ---------- tasks: перед вставкой ----------
-- Не доверяем клиенту: статус всегда «Новая», автор — текущий пользователь.
create or replace function private.tasks_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status     := 'new';
  new.author_id  := coalesce(auth.uid(), new.author_id);
  new.created_at := now();
  new.updated_at := now();
  perform private.assert_executor(new.assignee_id);
  return new;
end;
$$;

create trigger tasks_before_insert
  before insert on public.tasks
  for each row execute function private.tasks_before_insert();

-- ---------- tasks: после вставки — первая запись в истории ----------
create or replace function private.tasks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_status_history (task_id, from_status, to_status, changed_by)
  values (new.id, null, 'new', new.author_id);
  return new;
end;
$$;

create trigger tasks_after_insert
  after insert on public.tasks
  for each row execute function private.tasks_after_insert();

-- ---------- tasks: перед изменением ----------
-- Второй рубеж защиты (первый — права на колонки, миграция 3):
-- срабатывает даже для сервисного ключа и SQL-редактора.
create or replace function private.tasks_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_via_rpc boolean := coalesce(current_setting('app.status_change', true), '') = 'on';
begin
  -- Статус меняется только функцией change_task_status (она же пишет историю)
  if new.status is distinct from old.status and not v_via_rpc then
    raise exception 'Статус меняется только через действие с задачей'
      using errcode = '42501';
  end if;

  -- Принятая задача закрыта для редактирования
  if old.status = 'accepted' then
    raise exception 'Принятую задачу нельзя изменить'
      using errcode = 'P0001';
  end if;

  -- Неизменяемые поля
  new.author_id  := old.author_id;
  new.created_at := old.created_at;

  -- Переназначить исполнителя можно, пока работа не начата или возвращена
  if new.assignee_id is distinct from old.assignee_id then
    if old.status not in ('new', 'rework') then
      raise exception 'Сменить исполнителя можно только в статусах «Новая» и «На доработке»'
        using errcode = 'P0001';
    end if;
    perform private.assert_executor(new.assignee_id);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function private.tasks_before_update();

-- ---------- tasks: перед удалением ----------
-- Удалить можно только задачу, по которой ещё не начиналась работа:
-- так история выполненной работы не теряется.
create or replace function private.tasks_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'new' then
    raise exception 'Удалить можно только задачу в статусе «Новая»'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger tasks_before_delete
  before delete on public.tasks
  for each row execute function private.tasks_before_delete();

-- ---------- RPC: смена статуса задачи ----------
-- Единственный способ изменить статус. Проверяет переход, роль,
-- исполнителя и комментарий; пишет историю в той же транзакции.
create or replace function public.change_task_status(
  p_task_id  uuid,
  p_to       public.task_status,
  p_comment  text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_is_manager  boolean := private.is_manager();
  v_task        public.tasks;
  v_rule        public.status_transitions;
  v_comment     text := nullif(trim(p_comment), '');
begin
  if v_uid is null then
    raise exception 'Требуется вход в систему' using errcode = '42501';
  end if;

  -- FOR UPDATE: блокируем строку, чтобы два одновременных запроса
  -- не провели два перехода из одного и того же статуса
  select * into v_task from public.tasks where id = p_task_id for update;

  -- Чужая задача для исполнителя «не существует» — не раскрываем лишнего
  if not found or not (v_is_manager or v_task.assignee_id = v_uid) then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  select * into v_rule
  from public.status_transitions
  where from_status = v_task.status and to_status = p_to;

  if not found then
    raise exception 'Переход из статуса «%» в «%» запрещён', v_task.status, p_to
      using errcode = 'P0001';
  end if;

  if v_rule.actor = 'assignee' and v_task.assignee_id <> v_uid then
    raise exception 'Это действие доступно только назначенному исполнителю'
      using errcode = '42501';
  end if;

  if v_rule.actor = 'manager' and not v_is_manager then
    raise exception 'Это действие доступно только постановщику'
      using errcode = '42501';
  end if;

  if v_rule.comment_required and v_comment is null then
    raise exception 'Для этого действия нужен комментарий'
      using errcode = 'P0001';
  end if;

  perform set_config('app.status_change', 'on', true);
  update public.tasks set status = p_to where id = p_task_id
  returning * into v_task;
  perform set_config('app.status_change', 'off', true);

  insert into public.task_status_history (task_id, from_status, to_status, changed_by, comment)
  values (v_task.id, v_rule.from_status, v_rule.to_status, v_uid, v_comment);

  return v_task;
end;
$$;

comment on function public.change_task_status is
  'Смена статуса задачи с проверкой правил перехода и записью в историю.';
