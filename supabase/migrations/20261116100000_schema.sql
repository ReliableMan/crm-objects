-- =====================================================================
-- Миграция 1. Схема данных: типы, таблицы, связи, индексы,
-- справочник разрешённых переходов статусов.
-- =====================================================================

-- ---------- Типы ----------
create type public.user_role as enum ('manager', 'executor');

create type public.task_status as enum (
  'new',          -- Новая
  'in_progress',  -- В работе
  'review',       -- На проверке
  'accepted',     -- Принята
  'rework'        -- На доработке
);

-- Кто может выполнить переход: любой постановщик или назначенный исполнитель
create type public.transition_actor as enum ('manager', 'assignee');

-- ---------- Профили пользователей ----------
-- Роль хранится здесь, а НЕ в user_metadata: метаданные пользователь
-- может изменить сам через supabase.auth.updateUser().
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  role        public.user_role not null default 'executor',
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'Профиль и роль пользователя. Меняется только администратором через SQL.';

-- ---------- Объекты (стройки) ----------
create table public.objects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  address     text not null check (length(trim(address)) > 0),
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);

-- ---------- Задачи ----------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  -- RESTRICT: нельзя удалить объект, по которому есть задачи
  object_id    uuid not null references public.objects (id) on delete restrict,
  title        text not null check (length(trim(title)) > 0),
  description  text not null default '',
  assignee_id  uuid not null references public.profiles (id),
  author_id    uuid not null default auth.uid() references public.profiles (id),
  status       public.task_status not null default 'new',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index tasks_assignee_id_idx on public.tasks (assignee_id);
create index tasks_object_id_idx   on public.tasks (object_id);
create index tasks_status_idx      on public.tasks (status);

-- ---------- История статусов ----------
create table public.task_status_history (
  id           bigint generated always as identity primary key,
  -- CASCADE безопасен: удалить можно только задачу в статусе «Новая»
  -- (см. триггер tasks_before_delete), у неё в истории лишь запись о создании.
  task_id      uuid not null references public.tasks (id) on delete cascade,
  from_status  public.task_status,              -- null = создание задачи
  to_status    public.task_status not null,
  changed_by   uuid not null references public.profiles (id),
  changed_at   timestamptz not null default now(),
  comment      text
);

create index task_status_history_task_id_idx on public.task_status_history (task_id, changed_at);

-- ---------- Справочник переходов ----------
-- Единый источник правды: по нему проверяет база и по нему же
-- интерфейс рисует кнопки доступных действий.
create table public.status_transitions (
  from_status       public.task_status not null,
  to_status         public.task_status not null,
  actor             public.transition_actor not null,
  comment_required  boolean not null default false,
  action_label      text not null,
  primary key (from_status, to_status)
);

insert into public.status_transitions (from_status, to_status, actor, comment_required, action_label) values
  ('new',         'in_progress', 'assignee', false, 'Взять в работу'),
  ('in_progress', 'review',      'assignee', false, 'Отправить на проверку'),
  ('review',      'accepted',    'manager',  false, 'Принять'),
  ('review',      'rework',      'manager',  true,  'Вернуть на доработку'),
  ('rework',      'in_progress', 'assignee', false, 'Взять в работу');
