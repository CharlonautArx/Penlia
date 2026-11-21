import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

function wave() {
  const wav = Buffer.alloc(16044);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  return wav;
}

test('P2 HTTP workflows against PostgreSQL with runtime grants', async (t) => {
  if (
    process.env.PGHOST !== '127.0.0.1' ||
    process.env.PGDATABASE !== 'penlia_p2_test' ||
    process.env.PGUSER !== 'penlia_app' ||
    !/^55\d{3}$/.test(process.env.PGPORT ?? '') ||
    !process.env.PENLIA_P0_TEST_ADMIN_PASSWORD
  )
    throw new Error('Use an isolated loopback penlia_p2_test database');
  const { pool } = await import('../db.mjs');
  const { createApiServer } = await import('../http.mjs');
  const { runLifeReminders } = await import('./memories.mjs');
  const { default: pg } = await import('pg');
  const admin = new pg.Pool({
    user: 'postgres',
    password: process.env.PENLIA_P0_TEST_ADMIN_PASSWORD,
    ssl: false,
  });
  const http = createApiServer().listen(0, '127.0.0.1');
  await once(http, 'listening');
  const origin = 'http://127.0.0.1:' + http.address().port;
  t.after(async () => {
    await new Promise((resolve) => http.close(resolve));
    await Promise.all([pool.end(), admin.end()]);
  });
  async function fetchAt(who, path, method = 'GET', body, headers = {}) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        ...(who ? { Authorization: 'Bearer ' + who.token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body && JSON.stringify(body),
    });
    const data =
      method === 'HEAD'
        ? undefined
        : response.headers.get('Content-Type')?.includes('json')
          ? await response.json()
          : Buffer.from(await response.arrayBuffer());
    return { status: response.status, data, headers: response.headers };
  }
  const api = (user, path, method, body, headers) => fetchAt(user, '/v1' + path, method, body, headers);
  const p2 = (user, path, method, body, headers) => api(user, '/p2' + path, method, body, headers);
  const write = (user, path, body) => p2(user, path, 'POST', body);
  const patch = (user, path, body) => p2(user, path, 'PATCH', body);
  function ok(result, status = 200) {
    assert.equal(result.status, status, JSON.stringify(result.data).slice(0, 560));
    return result.data;
  }
  const id = (person) => person.user.id;
  const users = [];
  for (const [index, name] of ['青禾', '书晴', '阿岚', '路人'].entries()) {
    users.push(
      ok(
        await api(null, '/register', 'POST', {
          name,
          password: 'p2_isolated_password',
          username: 'test_p2_' + index,
        }),
        201,
      ),
    );
  }
  const [a, b, c, outside] = users;
  for (const [x, y] of [
    [a, b],
    [a, c],
    [b, c],
  ]) {
    const relation = ok(await api(x, '/friends', 'POST', { userId: id(y) }));
    ok(await api(y, '/friends/accept', 'POST', { id: relation.id }));
  }
  const picture = await readFile(new URL('../../assets/demo/person-4.jpg', import.meta.url));
  const clip = await readFile(process.env.PENLIA_P0_VIDEO_FIXTURE);
  const upload = async (user, data = picture, mime = 'image/jpeg') =>
    ok(
      await api(user, '/moment-media', 'POST', {
        clientId: randomUUID(),
        base64: data.toString('base64'),
        mime,
      }),
      201,
    ).media;
  const base = '/moment-media/';
  const scheduled = (offset) => new Date(Date.now() + offset).toISOString();
  const space = async (user, kind, title, members = [], extra = {}) =>
    ok(
      await write(user, '/spaces', {
        kind,
        title,
        clientId: randomUUID(),
        memberIds: members.map(id),
        ...extra,
      }),
    ).id;
  const accept = (user, space) => write(user, '/spaces/' + space + '/membership', { action: 'accept' });
  const own = (user, kind = 'saved') => p2(user, '/items?kind=' + kind);
  const share = (owner, viewer, access) =>
    write(owner, '/calendar-shares', { action: 'share', userId: id(viewer), access });

  let travel, diary, birthday;
  await t.test('007: upgrade of a populated 006 table is repeatable and keeps existing places', async () => {
    const previous = await readFile(new URL('../migrations/006_life_p2.sql', import.meta.url), 'utf8');
    const current = await readFile(new URL('../migrations/007_p2_life_followup.sql', import.meta.url), 'utf8');
    const ddl = previous.match(/CREATE TABLE p2_items \([\s\S]*?\n\);/)[0];
    const db = await admin.connect();
    const insert = async (kind, title, latitude = null, longitude = null) =>
      db.query(`INSERT INTO p2_items(owner_id,client_id,kind,title,category,state,scope,latitude,longitude,location)
        VALUES($1,$2,$3,$4,'other','want','private',$5,$6,'原地址')`, [id(a), randomUUID(), kind, title, latitude, longitude]);
    try {
      await db.query('BEGIN');
      await db.query('CREATE SCHEMA migration_007_fixture');
      await db.query('SET LOCAL search_path TO migration_007_fixture, public');
      await db.query(ddl);
      await insert('place', '已有坐标', 0, 121.46);
      await insert('saved', '原收藏');
      await db.query(current);
      await insert('place', '新地点');
      await db.query(current);
      const { rows } = await db.query('SELECT title,latitude,longitude,city,location FROM p2_items ORDER BY latitude NULLS LAST,kind');
      assert.deepEqual(rows, [
        { title: '已有坐标', latitude: 0, longitude: 121.46, city: '', location: '原地址' },
        { title: '新地点', latitude: null, longitude: null, city: '', location: '原地址' },
        { title: '原收藏', latitude: null, longitude: null, city: '', location: '原地址' },
      ]);
      for (const [kind, latitude, longitude] of [['place', 0, null], ['place', null, 0], ['place', 0, 181], ['saved', 0, 0]]) {
        await db.query('SAVEPOINT invalid_coordinate');
        await assert.rejects(insert(kind, '无效坐标', latitude, longitude), { code: '23514' });
        await db.query('ROLLBACK TO SAVEPOINT invalid_coordinate');
        await db.query('RELEASE SAVEPOINT invalid_coordinate');
      }
    } finally {
      await db.query('ROLLBACK');
      db.release();
    }
  });
  await t.test(
    '16: calendar is private by default and replacements revoke details before opt-in',
    async () => {
      const from = '2026-11-27T08:00:00+08:00',
        until = '2026-11-27T18:00:00+08:00';
      const path = '/calendar?' + new URLSearchParams({ from, until });
      assert.equal((await p2(null, path)).status, 401);
      const sample = {
        title: '私人安排',
        details: '不要给朋友返回此备注',
        startsAt: '2026-11-27T14:00:00+08:00',
        endsAt: '2026-11-27T15:00:00+08:00',
      };
      const personal = ok(await write(a, '/calendar', { ...sample, clientId: randomUUID() }));
      ok(
        await write(a, '/calendar', {
          ...sample,
          clientId: randomUUID(),
          title: '允许分享详情',
          details: '在东门见',
          visibility: 'detail',
        }),
      );
      ok(
        await write(a, '/calendar', {
          ...sample,
          clientId: randomUUID(),
          title: '忙碌但原因私密',
          details: '只给自己',
          visibility: 'busy',
        }),
      );
      assert.equal(ok(await p2(a, path)).events.length, 3);
      assert.deepEqual(ok(await p2(b, path)).events, []);
      ok(await share(a, b, 'busy'));
      assert.deepEqual(ok(await p2(b, path)).events, []);
      assert.equal((await write(c, '/calendar-shares', { action: 'accept', userId: id(a) })).status, 404);
      ok(await write(b, '/calendar-shares', { action: 'accept', userId: id(a) }));
      const shared = ok(await p2(b, path));
      assert.equal(shared.events.length, 2);
      assert.equal(shared.basis, 'authorized_calendar_estimate');
      assert.equal(shared.windows.length, 2);
      assert.ok(shared.events.every((event) => event.title === '忙碌' && event.details === null));
      assert.ok(!JSON.stringify(shared).includes('私人安排'));
      assert.ok(shared.events.every((event) => event.startsAt === '2026-11-27T06:00:00.000Z'));
      ok(await share(a, b, 'detail'));
      assert.deepEqual(ok(await p2(b, path)).events, []);
      ok(await write(b, '/calendar-shares', { action: 'accept', userId: id(a) }));
      assert.equal(
        ok(await p2(b, path)).events.find((event) => event.title === '允许分享详情').details,
        '在东门见',
      );
      const detailView = ok(await p2(b, path));
      assert.ok(detailView.events.some((event) => event.title === '忙碌' && event.details === null));
      assert.doesNotMatch(JSON.stringify(detailView), /忙碌但原因私密|只给自己|私人安排/);
      assert.deepEqual(ok(await p2(c, path)).windows, []);
      assert.equal((await p2(b, '/calendar/' + personal.id, 'DELETE')).status, 404);
      const next = scheduled(7 * 86400000);
      const gathering = ok(
        await api(a, '/p1/gatherings', 'POST', {
          clientId: randomUUID(),
          category: 'travel',
          title: '和朋友去旅行',
          memberIds: [id(b)],
          mode: 'open',
          minimum: 2,
          options: [{ startsAt: next, place: '车站' }],
        }),
      );
      travel = gathering.id;
      ok(
        await write(b, '/calendar', {
          clientId: randomUUID(),
          title: '个人时段',
          startsAt: next,
          endsAt: new Date(+new Date(next) + 3600000).toISOString(),
        }),
      );
      ok(await share(b, a, 'busy'));
      ok(await write(a, '/calendar-shares', { action: 'accept', userId: id(b) }));
      const first = ok(await p2(a, '/availability/' + travel));
      assert.equal(first.basis, 'authorized_calendar_estimate');
      assert.equal(first.options[0].hasKnownConflict, false);
      ok(
        await write(b, '/calendar', {
          clientId: randomUUID(),
          startsAt: next,
          endsAt: new Date(+new Date(next) + 3600000).toISOString(),
          visibility: 'busy',
        }),
      );
      assert.deepEqual(ok(await p2(a, '/availability/' + travel)).options, [
        { id: first.options[0].id, includedCalendars: 2, hasKnownConflict: true, allFree: false },
      ]);
      ok(await write(b, '/calendar-shares', { action: 'revoke', userId: id(a) }));
      assert.deepEqual(ok(await p2(a, '/availability/' + travel)).options, [
        { id: first.options[0].id, includedCalendars: 1, hasKnownConflict: false, allFree: true },
      ]);
      assert.equal((await p2(c, '/availability/' + travel)).status, 404);
      ok(await write(a, '/calendar-shares', { action: 'revoke', userId: id(b) }));
      assert.deepEqual(ok(await p2(b, path)).events, []);
      ok(
        await api(a, '/p1/gatherings/' + travel + '/organize', 'POST', {
          action: 'choose',
          optionId: first.options[0].id,
        }),
      );
      ok(await api(b, '/p1/gatherings/' + travel + '/confirm', 'POST', { attend: true }));
    },
  );

  let trip;
  await t.test(
    '17: trip conversion, shared itinerary, ordering, voting and consent to create a diary',
    async () => {
      const values = {
        destination: '杭州',
        startDay: '2022-04-23',
        endDay: '2022-04-25',
        gatheringId: travel,
      };
      assert.equal(
        (await write(b, '/spaces', { clientId: randomUUID(), kind: 'trip', title: '越权尝试', ...values }))
          .status,
        404,
      );
      trip = await space(a, 'trip', '周末旅行', [], values);
      assert.equal(await space(a, 'trip', '重复提交', [], values), trip);
      assert.equal((await p2(b, '/trips/' + trip)).status, 404);
      assert.ok(
        ok(await p2(b, '/spaces?kind=trip')).spaces.some((s) => s.id === trip && s.state === 'invited'),
      );
      ok(await accept(b, trip));
      const route = '/trips/' + trip;
      const aCover = await upload(a);
      const add = {
        title: '湖边散步',
        eventDay: '2022-04-23',
        category: 'sight',
        details: '在入口集合',
        clientId: randomUUID(),
        mediaIds: [aCover.id],
      };
      const first = ok(await write(a, route + '/itinerary', add));
      assert.equal(ok(await write(a, route + '/itinerary', add)).id, first.id);
      const second = ok(
        await write(b, route + '/itinerary', {
          ...add,
          title: '去吃饭',
          category: 'food',
          clientId: randomUUID(),
          mediaIds: [],
        }),
      );
      assert.equal((await api(outside, base + aCover.id)).status, 404);
      assert.equal((await api(b, base + aCover.id)).status, 200);
      assert.equal(
        (await patch(b, route + '/itinerary/' + first.id, { ...add, mediaIds: [], revision: 1 })).status,
        403,
      );
      ok(
        await patch(b, route + '/itinerary/' + first.id, {
          ...add,
          mediaIds: undefined,
          title: '先到湖边',
          revision: 1,
        }),
      );
      assert.equal(
        (await patch(b, route + '/itinerary/' + first.id, { ...add, mediaIds: undefined, revision: 1 }))
          .status,
        409,
      );
      assert.equal(
        (await write(outside, route + '/action', { action: 'vote', itemId: first.id, prefer: true })).status,
        404,
      );
      ok(await write(b, route + '/action', { action: 'vote', itemId: first.id, prefer: true }));
      assert.equal(
        (
          await write(a, route + '/action', {
            action: 'reorder',
            eventDay: '2022-04-23',
            itemIds: [second.id],
          })
        ).status,
        409,
      );
      ok(
        await write(a, route + '/action', {
          action: 'reorder',
          eventDay: '2022-04-23',
          itemIds: [second.id, first.id],
        }),
      );
      const detail = ok(await p2(a, route));
      assert.deepEqual(
        detail.items.map((item) => item.id),
        [second.id, first.id],
      );
      assert.equal(detail.items[1].support, 1);
      assert.equal((await write(a, route + '/action', { action: 'journal', confirmed: true })).status, 409);
      for (const who of [a, b]) ok(await write(who, route + '/action', { action: 'agree', agree: true }));
      diary = ok(await write(a, route + '/action', { action: 'journal', confirmed: true })).id;
      assert.equal(ok(await write(a, route + '/action', { action: 'journal', confirmed: true })).id, diary);
      assert.equal((await api(b, '/p1/collections/' + diary)).status, 404);
      ok(await api(b, '/p1/collections/' + diary + '/membership', 'POST', { action: 'accept' }));
      assert.equal((await api(b, '/p1/collections/' + diary)).status, 200);
      assert.equal((await write(a, route + '/itinerary', { ...add, clientId: randomUUID() })).status, 409);
    },
  );

  await t.test(
    '18: user-written bookmarks and recommendation cards share only to their intended audience',
    async () => {
      const cover = await upload(a);
      const bare = ok(
        await write(a, '/items', { clientId: randomUUID(), kind: 'saved', title: '只有一个名称' }),
      );
      assert.equal(ok(await p2(a, '/items/' + bare.id)).item.scope, 'private');
      assert.equal((await p2(b, '/items/' + bare.id)).status, 404);
      const payload = {
        clientId: randomUUID(),
        kind: 'saved',
        title: '一家社区咖啡馆',
        category: 'food',
        notes: '二楼比较安静',
        tags: ['朋友聚会', '咖啡'],
        scope: 'selected',
        memberIds: [id(b)],
        state: 'recommended',
        sourceUrl: 'https://example.com/cafe',
        mediaIds: [cover.id],
      };
      const saved = ok(await write(a, '/items', payload));
      assert.equal(ok(await write(a, '/items', payload)).id, saved.id);
      const recommend = ok(await p2(b, '/items?kind=saved&tab=friends&category=food')).items[0];
      assert.equal(recommend.id, saved.id);
      assert.equal(recommend.notes, payload.notes);
      assert.ok(!JSON.stringify(recommend).includes(id(c)));
      assert.equal((await p2(c, '/items/' + saved.id)).status, 404);
      assert.equal((await api(c, base + cover.id)).status, 404);
      assert.equal((await api(b, base + cover.id)).status, 200);
      const copied = ok(await write(b, '/items/' + saved.id + '/copy', { clientId: randomUUID() }));
      assert.equal(ok(await p2(b, '/items/' + copied.id)).item.scope, 'private');
      assert.deepEqual(ok(await p2(b, '/items/' + copied.id)).item.media, []);
      assert.equal((await write(c, '/items/' + saved.id + '/copy', { clientId: randomUUID() })).status, 404);
      assert.equal(
        (await write(a, '/items', { ...payload, clientId: randomUUID(), sourceUrl: 'javascript:alert(1)' }))
          .status,
        400,
      );
      ok(await patch(a, '/items/' + saved.id, { ...payload, scope: 'private', revision: 1 }));
      assert.equal((await api(b, base + cover.id, 'HEAD')).status, 404);
      assert.equal((await p2(b, '/items/' + saved.id)).status, 404);
      assert.ok(ok(await own(b)).items.some((item) => item.id === copied.id));
      const list = await space(a, 'list', '晚饭清单', [b]);
      ok(await accept(b, list));
      const other = ok(
        await write(b, '/items', {
          clientId: randomUUID(),
          kind: 'saved',
          title: '晚饭备选',
          spaceId: list,
          scope: 'space',
        }),
      );
      assert.ok(
        ok(await p2(a, '/items?kind=saved&tab=space&space=' + list)).items.some(
          (item) => item.id === other.id,
        ),
      );
      assert.equal((await p2(outside, '/items/' + other.id)).status, 404);
      ok(await write(a, '/spaces/' + list + '/membership', { action: 'remove', userId: id(b) }));
      assert.equal((await p2(a, '/items/' + other.id)).status, 404);
      assert.equal((await p2(b, '/items/' + other.id)).status, 200);
    },
  );

  await t.test(
    '19: reminders and shares recheck original permission and monthly delivery is idempotent',
    async () => {
      const draft = {
        clientId: randomUUID(),
        sourceKind: 'journal',
        sourceId: diary,
        title: '那次短途旅行',
        confirmed: true,
      };
      assert.equal((await write(c, '/memories', draft)).status, 404);
      assert.equal((await write(a, '/memories', { ...draft, confirmed: false })).status, 400);
      const memory = ok(await write(a, '/memories', draft));
      assert.equal(
        (await write(a, '/memories/' + memory.id + '/share', { memberIds: [id(c)], confirmed: true })).status,
        400,
      );
      ok(await write(a, '/memories/' + memory.id + '/share', { memberIds: [id(b)], confirmed: true }));
      assert.ok(ok(await p2(b, '/memories')).memories.some((row) => row.id === memory.id));
      ok(await api(b, '/p1/collections/' + diary + '/membership', 'POST', { action: 'leave' }));
      assert.ok(!ok(await p2(b, '/memories')).memories.some((row) => row.id === memory.id));
      birthday = ok(
        await write(a, '/memories', {
          clientId: randomUUID(),
          sourceKind: 'birthday',
          title: '家人的生日',
          eventDay:
            '2020-' +
            new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' })
              .formatToParts(new Date())
              .filter((p) => p.type === 'month' || p.type === 'day')
              .map((p) => p.value)
              .join('-'),
          confirmed: true,
        }),
      );
      const momentAt = new Date();
      assert.equal((await runLifeReminders(id(a), momentAt)).memories, 0);
      ok(await write(a, '/memory-settings', { frequency: 'monthly' }));
      const jobs = await Promise.all([runLifeReminders(id(a), momentAt), runLifeReminders(id(a), momentAt)]);
      assert.equal(
        jobs.reduce((sum, result) => sum + result.memories, 0),
        1,
      );
      const saved = ok(await p2(a, '/reminders')).reminders.find((r) => r.subjectId === birthday.id);
      assert.ok(
        saved.dueDay.endsWith(
          ok(await p2(a, '/memories'))
            .memories.find((r) => r.id === birthday.id)
            .eventDay.slice(4),
        ),
      );
      assert.equal((await fetchAt(a, '/ops/p2/reminders/run', 'POST')).status, 404);
      assert.equal(
        (
          await fetchAt(null, '/ops/p2/reminders/run', 'POST', undefined, {
            Authorization: 'Bearer ' + process.env.PENLIA_LIFE_JOB_TOKEN,
          })
        ).status,
        200,
      );
      ok(await write(a, '/reminders/' + birthday.id + '/read', { kind: 'memory', dueDay: saved.dueDay }));
      assert.ok(ok(await p2(a, '/reminders')).reminders.find((r) => r.subjectId === birthday.id).readAt);
      ok(await write(a, '/memory-settings', { frequency: 'off' }));
      assert.ok(!ok(await p2(a, '/reminders')).reminders.some((r) => r.kind === 'memory'));
    },
  );

  await t.test('19 follow-up: memory discovery is read-only and rechecks original permissions', async () => {
    const createMoment = async (body, scope, memberIds = []) =>
      ok(await api(a, '/moments', 'POST', { clientId: randomUUID(), body, scope, memberIds, mediaIds: [] }), 201).id;
    const recent = await createMoment('只和书晴分享的近况', 'selected', [id(b)]);
    const own = await createMoment('仅自己可见的候选', 'private');
    const anniversary = await createMoment('往年的今天', 'friends');
    const older = await createMoment('不是周年的旧记录', 'friends');
    await admin.query(`UPDATE private_moments SET created_at=(
      (now() AT TIME ZONE 'Asia/Shanghai')::date - interval '4 years'
      - CASE WHEN id=$2 THEN interval '1 day' ELSE interval '0 day' END
    ) AT TIME ZONE 'UTC' WHERE id IN ($1,$2)`, [anniversary, older]);
    const counts = async () => (await admin.query(`SELECT
      (SELECT count(*) FROM p2_memories) AS saved,
      (SELECT count(*) FROM p2_memory_viewers) AS shared,
      (SELECT count(*) FROM p2_reminders) AS reminded`)).rows[0];
    const candidates = async (user) => ok(await p2(user, '/memory-candidates')).candidates;
    const before = await counts();
    assert.equal((await p2(null, '/memory-candidates')).status, 401);
    const forB = await candidates(b);
    assert.equal(forB.find((row) => row.id === recent).reason, 'recent');
    assert.equal(forB.find((row) => row.id === anniversary).reason, 'anniversary');
    assert.ok(!forB.some((row) => row.id === own || row.id === older));
    assert.ok((await candidates(a)).some((row) => row.id === own));
    assert.ok(!(await candidates(c)).some((row) => row.id === recent || row.id === own));
    assert.ok(!(await candidates(outside)).some((row) => [recent, own, anniversary].includes(row.id)));
    assert.deepEqual(await counts(), before);

    const draft = { clientId: randomUUID(), sourceKind: 'moment', sourceId: recent, title: '获授权的回忆' };
    assert.equal((await write(b, '/memories', draft)).status, 400);
    await api(a, '/moments/' + recent, 'PATCH', { scope: 'private', revision: 1 }).then((response) => ok(response));
    assert.ok(!(await candidates(b)).some((row) => row.id === recent));
    assert.equal((await write(b, '/memories', { ...draft, confirmed: true })).status, 404);
    const memory = ok(await write(b, '/memories', { ...draft, sourceId: anniversary, confirmed: true }));
    assert.ok(!(await candidates(b)).some((row) => row.id === anniversary));
    assert.ok(!ok(await p2(c, '/memories')).memories.some((row) => row.id === memory.id));
  });

  await t.test(
    '20: text, photo, video and audio stay sealed until database time and can be withdrawn',
    async () => {
      const capsule = await space(a, 'capsule', '给未来的一封信', [b], { opensAt: scheduled(86400000) });
      assert.equal((await p2(b, '/capsules/' + capsule)).status, 404);
      ok(await accept(b, capsule));
      const photo = await upload(b),
        movie = await upload(b, clip, 'video/mp4'),
        audio = wave();
      const contribution = ok(
        await write(b, '/capsules/' + capsule + '/entry', {
          body: '只在约定日期打开',
          mediaIds: [photo.id, movie.id],
        }),
      );
      const audioPath = '/capsule-entries/' + contribution.id + '/audio';
      ok(await write(b, audioPath, { base64: audio.toString('base64'), mime: 'audio/wav' }));
      assert.equal(
        (await write(a, audioPath, { base64: audio.toString('base64'), mime: 'audio/wav' })).status,
        404,
      );
      assert.equal(ok(await p2(a, '/capsules/' + capsule)).entries.length, 0);
      assert.equal((await api(a, base + movie.id)).status, 404);
      assert.equal((await p2(a, audioPath)).status, 404);
      assert.deepEqual(ok(await p2(b, audioPath)), audio);
      assert.equal(
        (await write(b, '/capsules/' + capsule + '/action', { action: 'seal', confirmed: true })).status,
        404,
      );
      ok(await write(a, '/capsules/' + capsule + '/action', { action: 'seal', confirmed: true }));
      for (const user of [a, b, c]) {
        assert.equal((await p2(user, audioPath, 'GET', undefined, { range: 'bytes=0-31' })).status, 404);
        assert.equal((await api(user, base + movie.id, 'HEAD')).status, 404);
      }
      assert.equal(
        (await write(b, '/capsules/' + capsule + '/entry', { body: '太早', revision: 1 })).status,
        409,
      );
      assert.equal(
        (
          await write(a, '/capsules/' + capsule + '/action', {
            action: 'reschedule',
            opensAt: scheduled(90000),
          })
        ).status,
        409,
      );
      await admin.query("UPDATE p2_capsules SET opens_at=now()-interval '1 second' WHERE space_id=$1", [
        capsule,
      ]);
      assert.equal(ok(await p2(a, '/capsules/' + capsule)).entries[0].body, '只在约定日期打开');
      assert.equal((await api(a, base + photo.id)).status, 200);
      assert.equal((await api(a, base + movie.id, 'GET', undefined, { range: 'bytes=0-19' })).status, 206);
      assert.deepEqual(
        ok(await p2(a, audioPath, 'GET', undefined, { range: 'bytes=0-31' }), 206),
        audio.subarray(0, 32),
      );
      assert.ok(
        ok(await p2(b, '/reminders')).reminders.some((r) => r.kind === 'capsule' && r.subjectId === capsule),
      );
      assert.equal((await p2(outside, audioPath)).status, 404);
      ok(await write(b, '/spaces/' + capsule + '/membership', { action: 'leave' }));
      assert.equal((await p2(b, '/capsules/' + capsule)).status, 404);
      ok(await p2(b, '/capsule-entries/' + contribution.id, 'DELETE'));
      assert.equal((await api(a, base + photo.id)).status, 404);
      assert.equal((await p2(a, audioPath)).status, 404);
      assert.ok(!ok(await p2(b, '/reminders')).reminders.some((r) => r.subjectId === capsule));
    },
  );

  await t.test(
    '21: active status uses explicit viewers, and expiry also closes the image route',
    async () => {
      const image = await upload(a);
      const value = { caption: '想喝咖啡', emoji: '☕', expiresAt: scheduled(3600000), mediaIds: [image.id] };
      ok(await write(a, '/status', value));
      assert.equal(ok(await p2(b, '/status/' + id(a))).status, null);
      assert.equal((await api(b, base + image.id)).status, 404);
      ok(await write(a, '/status', { ...value, scope: 'selected', memberIds: [id(b)], revision: 1 }));
      assert.equal(ok(await p2(b, '/status/' + id(a))).status.caption, '想喝咖啡');
      assert.equal(ok(await p2(c, '/status/' + id(a))).status, null);
      assert.equal((await api(b, base + image.id)).status, 200);
      assert.equal((await write(a, '/status', { ...value, revision: 1 })).status, 409);
      await admin.query("UPDATE p2_status SET expires_at=now()-interval '1 minute' WHERE user_id=$1", [
        id(a),
      ]);
      assert.equal(ok(await p2(b, '/status/' + id(a))).status, null);
      assert.equal((await api(b, base + image.id)).status, 404);
      ok(await p2(a, '/status', 'DELETE'));
      assert.equal((await api(a, base + image.id)).status, 404);
    },
  );

  await t.test(
    '22: private coordinates, independent map contributions, and mutually allowed matches',
    async () => {
      const map = await space(a, 'map', '我们想去的地方', [b, c]);
      ok(await accept(b, map));
      ok(await accept(c, map));
      const x = {
        title: '河畔公园',
        latitude: 31.2,
        longitude: 121.46,
        kind: 'place',
        state: 'want',
        category: 'leisure',
        spaceId: map,
      };
      const p = ok(
        await write(a, '/items', {
          ...x,
          clientId: randomUUID(),
          scope: 'selected',
          memberIds: [id(b)],
          tripId: trip,
          memoryId: birthday.id,
        }),
      ).id;
      const q = ok(await write(b, '/items', { ...x, clientId: randomUUID(), scope: 'private' })).id;
      assert.deepEqual(ok(await p2(a, '/place-resonance')).matches, []);
      assert.equal((await p2(c, '/items/' + p)).status, 404);
      assert.equal((await p2(a, '/items/' + q)).status, 404);
      assert.equal((await write(b, '/items', { ...x, clientId: randomUUID(), latitude: 93 })).status, 400);
      ok(await patch(b, '/items/' + q, { ...x, scope: 'selected', memberIds: [id(a)], revision: 1 }));
      assert.deepEqual(ok(await p2(a, '/place-resonance')).matches, [
        { id: p, title: x.title, friend: b.user.name, friendId: id(b) },
      ]);
      assert.equal(ok(await p2(b, '/items/' + p)).item.tripId, trip);
      assert.equal(ok(await p2(b, '/items/' + p)).item.memoryId, null);
      ok(await write(a, '/memories/' + birthday.id + '/share', { memberIds: [id(b)], confirmed: true }));
      assert.equal(ok(await p2(b, '/items/' + p)).item.memoryId, birthday.id);
      assert.equal((await p2(outside, '/spaces/' + map)).status, 404);
      assert.deepEqual(ok(await p2(c, '/items?kind=place&tab=space&space=' + map)).items, []);
      ok(await patch(b, '/items/' + q, { ...x, scope: 'private', revision: 2 }));
      assert.deepEqual(ok(await p2(a, '/place-resonance')).matches, []);
    },
  );

  await t.test('22 follow-up: name-only places are private by default and only valid pairs become coordinates', async () => {
    const nameOnly = { kind: 'place', title: '等以后再去' };
    const place = ok(await write(a, '/items', { ...nameOnly, clientId: randomUUID() })).id;
    const matching = await own(a, 'place');
    const first = ok(matching).items.find((item) => item.id === place);
    assert.deepEqual([first.scope, first.city, first.location, first.latitude, first.longitude], ['private', '', '', null, null]);
    assert.equal((await p2(b, '/items/' + place)).status, 404);
    assert.equal((await write(b, '/items/' + place + '/copy', { clientId: randomUUID() })).status, 404);
    assert.equal((await patch(b, '/items/' + place, { ...nameOnly, revision: 1 })).status, 409);
    for (const bad of [{ latitude: 0 }, { longitude: 0 }, { latitude: '0', longitude: 0 }, { latitude: 0, longitude: 181 }]) {
      assert.equal((await write(a, '/items', { ...nameOnly, clientId: randomUUID(), ...bad })).status, 400);
    }
    const shared = { ...nameOnly, scope: 'selected', memberIds: [id(b)], city: '上海', location: '浦东' };
    ok(await patch(a, '/items/' + place, { ...shared, latitude: 0, longitude: 0, revision: 1 }));
    const { item } = ok(await p2(b, '/items/' + place));
    assert.deepEqual([item.city, item.location, item.latitude, item.longitude], ['上海', '浦东', 0, 0]);
    ok(await patch(a, '/items/' + place, { ...shared, city: undefined, revision: 2 }));
    const unchanged = ok(await p2(a, '/items/' + place)).item;
    assert.deepEqual([unchanged.city, unchanged.latitude, unchanged.longitude], ['上海', 0, 0]);
    ok(await patch(a, '/items/' + place, { ...shared, latitude: null, longitude: null, revision: 3 }));
    const copy = ok(await write(b, '/items/' + place + '/copy', { clientId: randomUUID() })).id;
    const copied = ok(await p2(b, '/items/' + copy)).item;
    assert.deepEqual([copied.city, copied.scope, copied.latitude, copied.longitude], ['上海', 'private', null, null]);
    ok(await write(b, '/items', { ...nameOnly, clientId: randomUUID(), scope: 'selected', memberIds: [id(a)] }));
    assert.deepEqual(ok(await p2(a, '/place-resonance')).matches, []);
  });
  await t.test(
    'removing a friendship withdraws direct grants and blocking removes workspace roles',
    async () => {
      const shared = await space(a, 'map', '测试黑名单生效', [c]);
      ok(await accept(c, shared));
      const sample = ok(
        await write(a, '/items', {
          clientId: randomUUID(),
          kind: 'saved',
          title: '私密书单',
          scope: 'selected',
          memberIds: [id(c)],
        }),
      );
      ok(await share(a, c, 'busy'));
      ok(await write(c, '/calendar-shares', { action: 'accept', userId: id(a) }));
      ok(await api(a, '/friends/block', 'POST', { userId: id(c) }));
      assert.equal((await p2(c, '/spaces/' + shared)).status, 404);
      assert.equal((await p2(c, '/items/' + sample.id)).status, 404);
      ok(await api(a, '/friends/unblock', 'POST', { userId: id(c) }));
      await admin.query(
        `UPDATE friendships SET updated_at=now()-interval '2 days'
      WHERE first_user=least($1::uuid,$2::uuid) AND second_user=greatest($1::uuid,$2::uuid)`,
        [id(a), id(c)],
      );
      const relation = ok(await api(a, '/friends', 'POST', { userId: id(c) }));
      ok(await api(c, '/friends/accept', 'POST', { id: relation.id }));
      assert.equal((await p2(c, '/spaces/' + shared)).status, 404);
      assert.equal((await p2(c, '/items/' + sample.id)).status, 404);
      assert.deepEqual(ok(await p2(c, '/calendar-shares')).shares, []);
    },
  );
});
