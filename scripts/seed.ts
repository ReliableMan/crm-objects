// Демо-данные: пользователи, объекты, задачи в разных статусах.
//
//   npm run seed        — создать недостающее; если объекты уже есть — данные не трогает
//   npm run seed:reset  — очистить объекты/задачи/историю (admin_reset_demo) и заполнить заново
//
// Сервисный ключ используется ТОЛЬКО для управления пользователями, профилями и сбросом.
// Объекты и задачи создаются от имени обычных пользователей через публичный ключ —
// так seed заодно проверяет, что RLS, права и триггеры пропускают легальные действия.
import type { User } from '@supabase/supabase-js';
import {
  DEMO_USERS,
  createAdminClient,
  fail,
  must,
  mustOk,
  requireEnv,
  signIn,
  type Db,
  type DemoUserKey,
  type TaskStatus,
} from './common.ts';

const env = requireEnv([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DEMO_PASSWORD',
] as const);

const RESET = process.argv.includes('--reset');

// ---------- Демо-данные ----------

type ObjectKey = 'north' | 'kuban' | 'east';

const OBJECTS: Record<ObjectKey, { name: string; address: string }> = {
  north: { name: 'ЖК «Северный», корпус 2', address: 'г. Краснодар, ул. Северная, 310' },
  kuban: { name: 'Офисный центр «Кубань»', address: 'г. Краснодар, ул. Красная, 150' },
  east: { name: 'Склад «Восточный»', address: 'г. Краснодар, ул. Уральская, 75' },
};

/** Шаг перехода: кто его делает определяется таблицей status_transitions, тут — только куда. */
interface Step {
  to: TaskStatus;
  comment?: string;
}

interface DemoTask {
  object: ObjectKey;
  title: string;
  description: string;
  assignee: Exclude<DemoUserKey, 'manager'>;
  path: Step[];
}

const START: Step[] = [{ to: 'in_progress' }];
const TO_REVIEW: Step[] = [{ to: 'in_progress' }, { to: 'review' }];

const TASKS: DemoTask[] = [
  {
    object: 'north',
    title: 'Залить фундамент секции А',
    description: 'Бетон B25, армирование по проекту КЖ-1.',
    assignee: 'ivan',
    path: [...TO_REVIEW, { to: 'accepted' }],
  },
  {
    object: 'north',
    title: 'Монтаж опалубки 3 этажа',
    description: 'Щитовая опалубка перекрытия, оси 1–6.',
    assignee: 'ivan',
    path: TO_REVIEW,
  },
  {
    object: 'north',
    title: 'Кладка перегородок 2 этажа',
    description: 'Газобетон D500, толщина 100 мм.',
    assignee: 'petr',
    path: START,
  },
  {
    object: 'kuban',
    title: 'Разводка электрики 1 этажа',
    description: 'Кабель ВВГнг-LS, щит ЩР-1.',
    assignee: 'ivan',
    path: [...TO_REVIEW, { to: 'rework', comment: 'Нет актов на скрытые работы, приложите фото' }],
  },
  {
    object: 'kuban',
    title: 'Вывоз строительного мусора',
    description: 'Контейнер 27 м³, согласовать время с охраной.',
    assignee: 'ivan',
    path: [],
  },
  {
    object: 'east',
    title: 'Гидроизоляция кровли',
    description: 'Наплавляемая мембрана в два слоя.',
    assignee: 'petr',
    path: [
      ...TO_REVIEW,
      { to: 'rework', comment: 'Протечка у водостока' },
      ...TO_REVIEW,
      { to: 'accepted' },
    ],
  },
  {
    object: 'east',
    title: 'Покраска фасада',
    description: 'Фасадная краска RAL 7035, два слоя.',
    assignee: 'petr',
    path: TO_REVIEW,
  },
  {
    object: 'east',
    title: 'Монтаж ворот',
    description: 'Секционные ворота 4×4 м, 2 шт.',
    assignee: 'petr',
    path: [],
  },
];

// Переходы, которые выполняет постановщик; остальные — назначенный исполнитель.
// База всё равно проверит (status_transitions + change_task_status).
const MANAGER_TARGETS: ReadonlySet<TaskStatus> = new Set(['accepted', 'rework']);

// ---------- Пользователи и профили (сервисный ключ) ----------

async function listAllUsers(admin: Db): Promise<User[]> {
  const users: User[] = [];
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Список пользователей: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < perPage) return users;
  }
}

async function ensureUsers(admin: Db): Promise<Record<DemoUserKey, string>> {
  const existing = await listAllUsers(admin);
  const ids = {} as Record<DemoUserKey, string>;

  for (const u of DEMO_USERS) {
    const found = existing.find((e) => e.email?.toLowerCase() === u.email);
    if (found) {
      ids[u.key] = found.id;
      console.log(`  · ${u.email} — уже есть`);
      continue;
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: env.DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: u.fullName },
    });
    if (error || !data.user) {
      fail(`Создание пользователя ${u.email}: ${error?.message ?? 'пустой ответ'}`);
    }
    ids[u.key] = data.user.id;
    console.log(`  + ${u.email} — создан`);
  }
  return ids;
}

/**
 * Профиль обычно создаёт триггер on_auth_user_created. Но после `db reset`
 * пользователи Auth остаются, а профилей нет — досоздаём их здесь.
 * Роль задаётся явно: постановщик — manager, остальные — executor.
 */
async function ensureProfiles(admin: Db, ids: Record<DemoUserKey, string>): Promise<void> {
  const rows = DEMO_USERS.map((u) => ({ id: ids[u.key], full_name: u.fullName, role: u.role }));
  const existing = must(
    'Чтение профилей',
    await admin.from('profiles').select('id').in('id', rows.map((r) => r.id)),
  );
  const have = new Set(existing.map((p) => p.id));
  const created = rows.filter((r) => !have.has(r.id)).length;

  mustOk('Профили', await admin.from('profiles').upsert(rows, { onConflict: 'id' }));
  console.log(`  профили: ${created > 0 ? `досоздано ${created}, ` : ''}роли выставлены`);
}

// ---------- Демо-данные (от имени пользователей, публичный ключ) ----------

async function seedData(
  ids: Record<DemoUserKey, string>,
  clients: Record<DemoUserKey, Db>,
): Promise<void> {
  const manager = clients.manager;

  const objectIds = {} as Record<ObjectKey, string>;
  for (const key of Object.keys(OBJECTS) as ObjectKey[]) {
    const row = must(
      `Создание объекта «${OBJECTS[key].name}»`,
      await manager.from('objects').insert(OBJECTS[key]).select('id').single(),
    );
    objectIds[key] = row.id;
  }
  console.log(`  объекты: ${Object.keys(objectIds).length}`);

  for (const t of TASKS) {
    // status и author_id не передаём: их ставит база
    const task = must(
      `Создание задачи «${t.title}»`,
      await manager
        .from('tasks')
        .insert({
          object_id: objectIds[t.object],
          title: t.title,
          description: t.description,
          assignee_id: ids[t.assignee],
        })
        .select('id')
        .single(),
    );

    for (const step of t.path) {
      const actor = MANAGER_TARGETS.has(step.to) ? 'manager' : t.assignee;
      must(
        `«${t.title}»: переход в ${step.to} от ${actor}`,
        await clients[actor].rpc('change_task_status', {
          p_task_id: task.id,
          p_to: step.to,
          ...(step.comment ? { p_comment: step.comment } : {}),
        }),
      );
    }
    const final = t.path.at(-1)?.to ?? 'new';
    console.log(`  задача «${t.title}» → ${final}`);
  }
}

// ---------- Сводка ----------

async function printSummary(admin: Db): Promise<void> {
  const profiles = must(
    'Сводка: профили',
    await admin.from('profiles').select('full_name, role').order('role').order('full_name'),
  );
  const objects = must('Сводка: объекты', await admin.from('objects').select('name').order('name'));
  const tasks = must('Сводка: задачи', await admin.from('tasks').select('id, title, status'));
  const history = must('Сводка: история', await admin.from('task_status_history').select('task_id'));

  const byStatus = new Map<TaskStatus, number>();
  for (const t of tasks) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);

  const historyByTask = new Map<string, number>();
  for (const h of history) historyByTask.set(h.task_id, (historyByTask.get(h.task_id) ?? 0) + 1);

  console.log('\n=== Сводка ===');
  console.log(`Пользователи (${profiles.length}):`);
  for (const p of profiles) console.log(`  ${p.full_name} — ${p.role}`);
  console.log(`Объекты (${objects.length}):`);
  for (const o of objects) console.log(`  ${o.name}`);
  console.log(`Задачи (${tasks.length}) по статусам:`);
  const order: TaskStatus[] = ['new', 'in_progress', 'review', 'rework', 'accepted'];
  for (const s of order) console.log(`  ${s.padEnd(12)} ${byStatus.get(s) ?? 0}`);
  console.log(`История: ${history.length} записей`);
  for (const t of tasks) {
    if (t.title === 'Гидроизоляция кровли') {
      console.log(`  «${t.title}»: ${historyByTask.get(t.id) ?? 0} записей (ожидается 7)`);
    }
  }
}

// ---------- main ----------

async function main(): Promise<void> {
  const admin = createAdminClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  console.log('Пользователи:');
  const ids = await ensureUsers(admin);
  await ensureProfiles(admin, ids);

  if (RESET) {
    mustOk('Сброс демо-данных', await admin.rpc('admin_reset_demo'));
    console.log('\nДемо-данные очищены (объекты, задачи, история).');
  }

  const { count, error } = await admin.from('objects').select('id', { count: 'exact', head: true });
  if (error) fail(`Проверка объектов: ${error.message}`);
  if ((count ?? 0) > 0) {
    console.log('\nДанные уже есть, пропускаю. (Пересоздать: npm run seed:reset)');
    await printSummary(admin);
    return;
  }

  const clients = {} as Record<DemoUserKey, Db>;
  for (const u of DEMO_USERS) {
    const { client, userId } = await signIn(
      env.VITE_SUPABASE_URL,
      env.VITE_SUPABASE_ANON_KEY,
      u.email,
      env.DEMO_PASSWORD,
    );
    if (userId !== ids[u.key]) fail(`Вошли как ${u.email}, но id не совпал`);
    clients[u.key] = client;
  }

  console.log('\nДемо-данные:');
  await seedData(ids, clients);

  for (const c of Object.values(clients)) await c.auth.signOut();
  await printSummary(admin);
}

main().catch((e: unknown) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)));
