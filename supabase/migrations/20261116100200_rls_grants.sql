-- =====================================================================
-- Миграция 3. Права доступа: GRANT/REVOKE и RLS-политики.
-- Принцип: всё запрещено, кроме явно разрешённого.
-- =====================================================================

-- ---------- 1. Включаем RLS на всех таблицах ----------
alter table public.profiles            enable row level security;
alter table public.objects             enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_status_history enable row level security;
alter table public.status_transitions  enable row level security;

-- ---------- 2. Отзываем права, которые Supabase выдаёт по умолчанию ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

revoke all on schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- Чтобы будущие таблицы/функции тоже не открывались автоматически
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- ---------- 3. Выдаём минимально нужные права залогиненным ----------
-- Чтение (какие именно строки — решают RLS-политики ниже)
grant select on public.profiles, public.objects, public.tasks,
                public.task_status_history, public.status_transitions
  to authenticated;

-- Объекты: создавать / менять / удалять (только постановщик — см. политики)
grant insert (name, address) on public.objects to authenticated;
grant update (name, address) on public.objects to authenticated;
grant delete                 on public.objects to authenticated;

-- Задачи: колонки status, author_id, created_at клиенту недоступны вовсе
grant insert (object_id, title, description, assignee_id) on public.tasks to authenticated;
grant update (object_id, title, description, assignee_id) on public.tasks to authenticated;
grant delete                                              on public.tasks to authenticated;

-- История, профили, справочник переходов — только чтение (выдано выше).

-- Схема private нужна политикам (is_manager), но в API она не публикуется
grant usage on schema private to authenticated;
grant execute on function private.is_manager() to authenticated;

-- Единственная RPC, доступная клиенту
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;

-- ---------- 4. RLS-политики ----------
-- (select auth.uid()) вместо auth.uid() — рекомендация Supabase:
-- значение вычисляется один раз на запрос, а не для каждой строки.

-- profiles: видны всем сотрудникам (имена в истории и выборе исполнителя)
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

-- objects: постановщик видит всё, исполнитель — объекты, где у него есть задачи
create policy objects_select on public.objects
  for select to authenticated
  using (
    private.is_manager()
    or exists (
      select 1 from public.tasks t
      where t.object_id = objects.id
        and t.assignee_id = (select auth.uid())
    )
  );

create policy objects_insert on public.objects
  for insert to authenticated
  with check (private.is_manager());

create policy objects_update on public.objects
  for update to authenticated
  using (private.is_manager())
  with check (private.is_manager());

create policy objects_delete on public.objects
  for delete to authenticated
  using (private.is_manager());

-- tasks: постановщик видит всё, исполнитель — только свои
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    private.is_manager()
    or assignee_id = (select auth.uid())
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (private.is_manager());

create policy tasks_update on public.tasks
  for update to authenticated
  using (private.is_manager())
  with check (private.is_manager());

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (private.is_manager());

-- history: видна, если видна сама задача (RLS tasks применяется внутри exists)
-- Политик на insert/update/delete нет — писать может только база.
create policy history_select on public.task_status_history
  for select to authenticated
  using (
    exists (select 1 from public.tasks t where t.id = task_status_history.task_id)
  );

-- status_transitions: справочник, читают все
create policy transitions_select on public.status_transitions
  for select to authenticated
  using (true);
