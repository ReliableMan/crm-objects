// Тест безопасности: попытки обойти права так, как это может сделать злоумышленник
// с публичным ключом из браузера. Сервисный ключ НЕ используется.
//
//   npm run test:security
//
// Перед каждым сценарием нужная задача ищется заново (клиентом постановщика) —
// тест не полагается на исходное состояние seed. Нет подходящей задачи → сценарий пропущен.
// Все проверки негативные; единственное исключение — №20 создаёт и удаляет свою задачу.
import {
  DEMO_USERS,
  createPublicClient,
  requireEnv,
  signIn,
  type Db,
  type DemoUserKey,
  type TaskStatus,
} from './common.ts';
import type { Database } from '../src/lib/database.types.ts';

type TaskRow = Database['public']['Tables']['tasks']['Row'];

const env = requireEnv(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'DEMO_PASSWORD'] as const);

// ---------- Мини-фреймворк ----------

class Skip extends Error {}

const results = { passed: 0, failed: 0, skipped: 0 };

async function check(n: number, name: string, fn: () => Promise<void>): Promise<void> {
  const title = `${String(n).padStart(2)}. ${name}`;
  try {
    await fn();
    results.passed++;
    console.log(`✅ ${title}`);
  } catch (e) {
    if (e instanceof Skip) {
      results.skipped++;
      console.log(`⏭  ${title} — пропущен (${e.message})`);
    } else {
      results.failed++;
      console.log(`❌ ${title}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

interface Res {
  data?: unknown;
  error: { message: string; code?: string } | null;
}

/** Запрещено = ошибка ИЛИ операция не затронула/не вернула ни одной строки. */
function assertDenied(ctx: string, r: Res): void {
  if (r.error) return;
  if (r.data === null || r.data === undefined) return;
  if (Array.isArray(r.data) && r.data.length === 0) return;
  throw new Error(`${ctx}: операция прошла — ${JSON.stringify(r.data)}`);
}

/** Строго ошибка (для RPC и т. п.), опционально — с ожидаемым текстом. */
function assertError(ctx: string, r: Res, includes?: string): void {
  if (!r.error) throw new Error(`${ctx}: ожидалась ошибка, а запрос прошёл`);
  if (includes && !r.error.message.includes(includes)) {
    throw new Error(`${ctx}: не та ошибка — «${r.error.message}» (ждали «${includes}»)`);
  }
}

function assertEqual(ctx: string, before: unknown, after: unknown): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`${ctx}: данные изменились\n     было:  ${JSON.stringify(before)}\n     стало: ${JSON.stringify(after)}`);
  }
}

// ---------- Клиенты ----------

const anon = createPublicClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const clients = {} as Record<DemoUserKey, Db>;
const ids = {} as Record<DemoUserKey, string>;

// ---------- Чтение «правды» от имени постановщика ----------

async function allTasks(): Promise<TaskRow[]> {
  const { data, error } = await clients.manager.from('tasks').select('*').order('created_at');
  if (error) throw new Error(`manager не смог прочитать задачи: ${error.message}`);
  return data;
}

async function getTask(id: string): Promise<TaskRow | null> {
  const { data, error } = await clients.manager.from('tasks').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`manager не смог прочитать задачу: ${error.message}`);
  return data;
}

/** Находит задачу в нужном статусе (и у нужного исполнителя). Нет → сценарий пропускается. */
async function findTask(status: TaskStatus, assignee?: Exclude<DemoUserKey, 'manager'>): Promise<TaskRow> {
  const task = (await allTasks()).find(
    (t) => t.status === status && (!assignee || t.assignee_id === ids[assignee]),
  );
  if (!task) throw new Skip(`нет задачи в статусе ${status}${assignee ? ` у ${assignee}` : ''}`);
  return task;
}

async function anyTask(assignee: Exclude<DemoUserKey, 'manager'>): Promise<TaskRow> {
  const task = (await allTasks()).find((t) => t.assignee_id === ids[assignee]);
  if (!task) throw new Skip(`нет задач у ${assignee}`);
  return task;
}

async function history(taskId: string): Promise<unknown[]> {
  const { data, error } = await clients.manager
    .from('task_status_history')
    .select('*')
    .eq('task_id', taskId)
    .order('id');
  if (error) throw new Error(`manager не смог прочитать историю: ${error.message}`);
  return data;
}

async function dataCounts(): Promise<Record<string, number | null>> {
  const m = clients.manager;
  const [o, t, h] = await Promise.all([
    m.from('objects').select('id', { count: 'exact', head: true }),
    m.from('tasks').select('id', { count: 'exact', head: true }),
    m.from('task_status_history').select('id', { count: 'exact', head: true }),
  ]);
  for (const r of [o, t, h]) if (r.error) throw new Error(`manager: ${r.error.message}`);
  return { objects: o.count, tasks: t.count, history: h.count };
}

/** Снимок задачи до атаки, атака, проверка, что задача не изменилась. */
async function unchanged(task: TaskRow, attack: () => Promise<void>): Promise<void> {
  const before = await getTask(task.id);
  const historyBefore = await history(task.id);
  await attack();
  assertEqual('задача', before, await getTask(task.id));
  assertEqual('история', historyBefore, await history(task.id));
}

// ---------- Сценарии ----------

async function run(): Promise<void> {
  // --- anon ---
  await check(1, 'anon: select из tasks', async () => {
    const r = await anon.from('tasks').select('id');
    assertDenied('select tasks', r);
  });

  await check(2, 'anon: select из objects, profiles, task_status_history', async () => {
    assertDenied('objects', await anon.from('objects').select('id'));
    assertDenied('profiles', await anon.from('profiles').select('id'));
    assertDenied('history', await anon.from('task_status_history').select('id'));
  });

  await check(3, 'anon: rpc change_task_status', async () => {
    const task = await findTask('new');
    await unchanged(task, async () => {
      assertError('rpc', await anon.rpc('change_task_status', { p_task_id: task.id, p_to: 'in_progress' }));
    });
  });

  await check(4, 'anon: самостоятельная регистрация (signUp)', async () => {
    const email = `attacker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const { data, error } = await anon.auth.signUp({ email, password: `X-${crypto.randomUUID()}` });
    if (!error) throw new Error(`регистрация прошла: создан ${data.user?.id ?? '?'} (${email}) — выключите sign up`);
  });

  // --- ivan (исполнитель) ---
  await check(5, 'ivan: select из tasks — только свои', async () => {
    const { data, error } = await clients.ivan.from('tasks').select('id, assignee_id');
    if (error) throw new Error(error.message);
    const foreign = data.filter((t) => t.assignee_id !== ids.ivan);
    if (foreign.length > 0) throw new Error(`видит чужие задачи: ${foreign.length}`);
    const expected = (await allTasks()).filter((t) => t.assignee_id === ids.ivan).length;
    if (expected === 0) throw new Skip('у ivan нет задач');
    if (data.length !== expected) throw new Error(`видит ${data.length} из ${expected} своих задач`);
  });

  await check(6, 'ivan: select из objects — только объекты со своими задачами', async () => {
    const { data, error } = await clients.ivan.from('objects').select('id, name');
    if (error) throw new Error(error.message);
    const expected = [...new Set((await allTasks()).filter((t) => t.assignee_id === ids.ivan).map((t) => t.object_id))];
    if (expected.length === 0) throw new Skip('у ivan нет задач');
    assertEqual('набор объектов', expected.sort(), data.map((o) => o.id).sort());
  });

  await check(7, 'ivan: select задачи Петра по id', async () => {
    const task = await anyTask('petr');
    assertDenied('select', await clients.ivan.from('tasks').select('id').eq('id', task.id));
  });

  await check(8, 'ivan: select истории задачи Петра', async () => {
    const task = await anyTask('petr');
    assertDenied('select', await clients.ivan.from('task_status_history').select('id').eq('task_id', task.id));
  });

  await check(9, "ivan: update tasks set status='accepted' своей задачи на проверке", async () => {
    const task = await findTask('review', 'ivan');
    await unchanged(task, async () => {
      const r = await clients.ivan.from('tasks').update({ status: 'accepted' }).eq('id', task.id).select('id');
      assertError('update status', r);
    });
  });

  await check(10, "ivan: update tasks set title='hack' своей задачи", async () => {
    const task = await anyTask('ivan');
    await unchanged(task, async () => {
      const r = await clients.ivan.from('tasks').update({ title: 'hack' }).eq('id', task.id).select('id');
      assertDenied('update title', r);
    });
  });

  await check(11, 'ivan: переназначить свою новую задачу на Петра', async () => {
    const task = await findTask('new', 'ivan');
    await unchanged(task, async () => {
      const r = await clients.ivan.from('tasks').update({ assignee_id: ids.petr }).eq('id', task.id).select('id');
      assertDenied('update assignee', r);
    });
  });

  await check(12, 'ivan: rpc new → accepted своей задачи', async () => {
    const task = await findTask('new', 'ivan');
    await unchanged(task, async () => {
      const r = await clients.ivan.rpc('change_task_status', { p_task_id: task.id, p_to: 'accepted' });
      assertError('rpc', r, 'запрещён');
    });
  });

  await check(13, 'ivan: rpc review → accepted своей задачи (приёмка самому себе)', async () => {
    const task = await findTask('review', 'ivan');
    await unchanged(task, async () => {
      const r = await clients.ivan.rpc('change_task_status', { p_task_id: task.id, p_to: 'accepted' });
      assertError('rpc', r, 'только постановщику');
    });
  });

  await check(14, 'ivan: rpc для новой задачи Петра (new → in_progress)', async () => {
    const task = await findTask('new', 'petr');
    await unchanged(task, async () => {
      const r = await clients.ivan.rpc('change_task_status', { p_task_id: task.id, p_to: 'in_progress' });
      assertError('rpc', r, 'Задача не найдена');
    });
  });

  await check(15, 'ivan: insert в task_status_history', async () => {
    const task = await anyTask('ivan');
    await unchanged(task, async () => {
      const r = await clients.ivan
        .from('task_status_history')
        .insert({ task_id: task.id, from_status: task.status, to_status: 'accepted', changed_by: ids.manager })
        .select('id');
      assertError('insert history', r);
    });
  });

  await check(16, 'ivan: update / delete в task_status_history', async () => {
    const task = await anyTask('ivan');
    await unchanged(task, async () => {
      const u = await clients.ivan
        .from('task_status_history')
        .update({ comment: 'hack', to_status: 'accepted' })
        .eq('task_id', task.id)
        .select('id');
      assertDenied('update history', u);
      const d = await clients.ivan.from('task_status_history').delete().eq('task_id', task.id).select('id');
      assertDenied('delete history', d);
    });
  });

  await check(17, "ivan: update profiles set role='manager' себе", async () => {
    const r = await clients.ivan.from('profiles').update({ role: 'manager' }).eq('id', ids.ivan).select('id');
    assertDenied('update profile', r);
    const { data, error } = await clients.manager.from('profiles').select('role').eq('id', ids.ivan).single();
    if (error) throw new Error(error.message);
    if (data.role !== 'executor') throw new Error(`роль ivan стала ${data.role}`);
  });

  await check(18, 'ivan: insert в objects и tasks', async () => {
    const before = await dataCounts();
    const o = await clients.ivan.from('objects').insert({ name: 'hack', address: 'hack' }).select('id');
    assertDenied('insert object', o);
    const task = await anyTask('ivan');
    const t = await clients.ivan
      .from('tasks')
      .insert({ object_id: task.object_id, title: 'hack', assignee_id: ids.ivan })
      .select('id');
    assertDenied('insert task', t);
    assertEqual('количество строк', before, await dataCounts());
  });

  // --- manager (постановщик) ---
  await check(19, "manager: update tasks set status='accepted' напрямую", async () => {
    const task = await findTask('review');
    await unchanged(task, async () => {
      const r = await clients.manager.from('tasks').update({ status: 'accepted' }).eq('id', task.id).select('id');
      assertError('update status', r);
    });
  });

  await check(20, 'manager: insert с подделанными status/author_id; обычный insert → new; delete', async () => {
    const objectId = (await anyTask('ivan')).object_id;
    const forged = await clients.manager
      .from('tasks')
      .insert({
        object_id: objectId,
        title: 'security-test: подделка',
        assignee_id: ids.ivan,
        status: 'accepted',
        author_id: ids.ivan,
      })
      .select('id');
    assertError('insert с status/author_id', forged);

    let createdId: string | null = null;
    try {
      const { data, error } = await clients.manager
        .from('tasks')
        .insert({ object_id: objectId, title: 'security-test: временная задача', assignee_id: ids.ivan })
        .select('id, status, author_id')
        .single();
      if (error) throw new Error(`обычный insert: ${error.message}`);
      createdId = data.id;
      if (data.status !== 'new') throw new Error(`статус новой задачи ${data.status}`);
      if (data.author_id !== ids.manager) throw new Error('автор — не manager');
      const h = await history(data.id);
      if (h.length !== 1) throw new Error(`в истории ${h.length} записей вместо 1`);

      const del = await clients.manager.from('tasks').delete().eq('id', data.id).select('id');
      if (del.error) throw new Error(`delete: ${del.error.message}`);
      if (del.data.length !== 1) throw new Error('delete не удалил задачу');
      createdId = null;
    } finally {
      if (createdId) await clients.manager.from('tasks').delete().eq('id', createdId);
    }
  });

  await check(21, 'manager: rpc review → rework без комментария и с пробелами', async () => {
    const task = await findTask('review');
    await unchanged(task, async () => {
      const a = await clients.manager.rpc('change_task_status', { p_task_id: task.id, p_to: 'rework' });
      assertError('без комментария', a, 'комментарий');
      const b = await clients.manager.rpc('change_task_status', { p_task_id: task.id, p_to: 'rework', p_comment: '   ' });
      assertError('комментарий из пробелов', b, 'комментарий');
    });
  });

  await check(22, 'manager: rpc new → in_progress за исполнителя', async () => {
    const task = await findTask('new');
    await unchanged(task, async () => {
      const r = await clients.manager.rpc('change_task_status', { p_task_id: task.id, p_to: 'in_progress' });
      assertError('rpc', r, 'только назначенному исполнителю');
    });
  });

  await check(23, 'manager: update принятой задачи', async () => {
    const task = await findTask('accepted');
    await unchanged(task, async () => {
      const r = await clients.manager.from('tasks').update({ title: 'hack' }).eq('id', task.id).select('id');
      assertError('update accepted', r);
    });
  });

  await check(24, 'manager: delete задачи не в статусе «Новая»', async () => {
    const task = await findTask('in_progress');
    await unchanged(task, async () => {
      const r = await clients.manager.from('tasks').delete().eq('id', task.id).select('id');
      assertError('delete', r);
    });
  });

  await check(25, 'manager: delete объекта с задачами', async () => {
    const task = (await allTasks())[0];
    if (!task) throw new Skip('нет задач');
    const before = await dataCounts();
    const r = await clients.manager.from('objects').delete().eq('id', task.object_id).select('id');
    assertError('delete object', r);
    assertEqual('количество строк', before, await dataCounts());
  });

  await check(26, 'manager: назначить исполнителем постановщика', async () => {
    const task = await findTask('new');
    await unchanged(task, async () => {
      const r = await clients.manager.from('tasks').update({ assignee_id: ids.manager }).eq('id', task.id).select('id');
      assertError('update assignee', r);
    });
  });

  await check(27, 'manager: сменить исполнителя задачи «В работе»', async () => {
    const task = await findTask('in_progress');
    const other = task.assignee_id === ids.ivan ? ids.petr : ids.ivan;
    await unchanged(task, async () => {
      const r = await clients.manager.from('tasks').update({ assignee_id: other }).eq('id', task.id).select('id');
      assertError('update assignee', r);
    });
  });

  await check(28, 'manager: update / delete в task_status_history', async () => {
    const task = (await allTasks())[0];
    if (!task) throw new Skip('нет задач');
    await unchanged(task, async () => {
      const u = await clients.manager
        .from('task_status_history')
        .update({ comment: 'hack' })
        .eq('task_id', task.id)
        .select('id');
      assertDenied('update history', u);
      const d = await clients.manager.from('task_status_history').delete().eq('task_id', task.id).select('id');
      assertDenied('delete history', d);
    });
  });

  // --- инструмент администратора ---
  await check(29, 'anon, ivan, manager: rpc admin_reset_demo', async () => {
    const before = await dataCounts();
    assertError('anon', await anon.rpc('admin_reset_demo'));
    assertError('ivan', await clients.ivan.rpc('admin_reset_demo'));
    assertError('manager', await clients.manager.rpc('admin_reset_demo'));
    assertEqual('количество строк', before, await dataCounts());
  });
}

async function main(): Promise<void> {
  for (const u of DEMO_USERS) {
    const { client, userId } = await signIn(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, u.email, env.DEMO_PASSWORD);
    clients[u.key] = client;
    ids[u.key] = userId;
  }

  console.log('Тест безопасности (публичный ключ, без сервисного)\n');
  await run();

  for (const c of Object.values(clients)) await c.auth.signOut();

  const total = results.passed + results.failed + results.skipped;
  const skipped = results.skipped > 0 ? `, пропущено ${results.skipped}` : '';
  console.log(`\n${results.passed}/${total} passed${skipped}`);
  if (results.failed > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
