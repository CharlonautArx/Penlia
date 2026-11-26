import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Together HTTP integration on isolated PostgreSQL', async (t) => {
  if (
    process.env.PGHOST !== '127.0.0.1' ||
    process.env.PGDATABASE !== 'penlia_p1_test' ||
    process.env.PGUSER !== 'penlia_app' ||
    !/^55\d{3}$/.test(process.env.PGPORT ?? '') ||
    !process.env.PENLIA_P0_TEST_ADMIN_PASSWORD ||
    !process.env.PENLIA_EVIDENCE_KEY
  ) {
    throw new Error('Run against isolated loopback penlia_p1_test PostgreSQL');
  }
  const { pool } = await import('../db.mjs');
  const { createApiServer } = await import('../http.mjs');
  const { default: pg } = await import('pg');
  const admin = new pg.Pool({
    user: 'postgres',
    password: process.env.PENLIA_P0_TEST_ADMIN_PASSWORD,
    ssl: false,
  });
  const server = createApiServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await Promise.all([pool.end(), admin.end()]);
  });

  async function ask(who, path, method = 'GET', body, options = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
      method,
      headers: {
        ...(who ? { Authorization: 'Bearer ' + who.token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: body && JSON.stringify(body),
    });
    const data =
      method === 'HEAD'
        ? undefined
        : response.headers.get('content-type')?.includes('json')
          ? await response.json()
          : Buffer.from(await response.arrayBuffer());
    return { status: response.status, data, headers: response.headers };
  }
  const api = (who, path, method, body, options) => ask(who, '/v1' + path, method, body, options);
  const p1 = (who, path, method, body, options) => api(who, '/p1' + path, method, body, options);
  function ok(result, status = 200) {
    assert.equal(result.status, status, JSON.stringify(result.data).slice(0, 400));
    return result.data;
  }
  const post = (who, path, body) => p1(who, path, 'POST', body);
  const userId = (who) => who.user.id;
  const names = ['青禾', '阿岚', '书晴', '冬雨', '路人', '审核甲', '审核乙'];
  const users = [];
  for (const [index, name] of names.entries()) {
    users.push(
      ok(
        await api(null, '/register', 'POST', {
          username: 'p1_account_' + index,
          name,
          password: randomUUID(),
        }),
        201,
      ),
    );
  }
  const [a, b, c, d, outside, re1, re2] = users;
  for (const friend of [b, c, d]) {
    const relation = ok(await api(a, '/friends', 'POST', { userId: userId(friend) }));
    ok(await api(friend, '/friends/accept', 'POST', { id: relation.id }));
  }
  await t.test(
    'Optional reminders, private decisions, opted-in messages and membership changes',
    async () => {
      const members = [];
      for (const name of ['host', 'guest1', 'guest2', 'guest3'])
        members.push(
          ok(
            await api(null, '/register', 'POST', {
              username: 'discussion_' + name,
              name,
              password: randomUUID(),
            }),
            201,
          ),
        );
      const [a, b, c, d] = members;
      for (const guest of [b, c, d]) {
        const relation = ok(await api(a, '/friends', 'POST', { userId: userId(guest) }));
        ok(await api(guest, '/friends/accept', 'POST', { id: relation.id }));
      }
      const start = new Date(Date.now() + 8 * 60000).toISOString();
      const { id } = ok(
        await post(a, '/gatherings', {
          clientId: randomUUID(),
          title: '一起吃饭',
          planning: true,
          category: 'food',
          mode: 'open',
          minimum: 2,
          decision: '去哪家店',
          choices: ['甲店', '乙店'],
          memberIds: [b, c, d].map(userId),
          options: [{ startsAt: start }],
        }),
      );
      const base = '/gatherings/' + id,
        notes = base + '/discussion',
        due = async (who) => ok(await p1(who, '/activity-reminders')).reminders.some((r) => r.id === id);
      for (const who of [b, c, d])
        ok(await post(who, base + '/personal', { action: 'answer', answer: '甲店' }));
      ok(await post(a, base + '/roster', { action: 'remove', userId: userId(d) }), 409);
      assert.equal(ok(await p1(b, base)).gathering.confirmed, false);
      assert.equal(ok(await p1(a, base)).gathering.agreedChoice, null);
      const message = { action: 'post', text: '我会带茶', clientId: randomUUID() };
      ok(await post(b, notes, message), 409);
      ok(await p1(outside, notes), 404);
      for (const who of [a, b]) ok(await post(who, notes, { action: 'join' }));
      ok(await post(b, notes, message));
      ok(await post(b, notes, message));
      assert.equal(ok(await p1(a, notes)).messages.length, 1);
      ok(await post(c, notes, { action: 'join' }));
      assert.equal(ok(await p1(c, notes)).messages.length, 0);
      ok(await post(b, notes, { action: 'leave' }));
      assert.equal(ok(await p1(a, notes)).messages.length, 0);
      const choiceId = ok(await p1(a, base)).options[0].id;
      ok(await post(a, base + '/organize', { action: 'choose', optionId: choiceId }));
      assert.equal(ok(await p1(a, base)).gathering.agreedChoice, '甲店');
      const updates = ok(await p1(b, base)).updates;
      const inbox = ok(await p1(b, '/events')).events.filter((event) => event.subjectId === id);
      for (const kind of ['gathering_invited', 'gathering_updated']) {
        const notice = updates.find((event) => event.kind === kind);
        assert.ok(notice);
        assert.ok(inbox.some((event) => event.id === notice.id && event.kind === kind));
      }
      assert.ok(!ok(await p1(outside, '/events')).events.some((event) => event.subjectId === id));
      ok(await p1(outside, base), 404);
      ok(await post(b, base + '/confirm', { attend: true, choiceId }));
      assert.equal(await due(b), false);
      ok(await post(b, base + '/personal', { action: 'reminder', minutes: 15 }));
      assert.equal(await due(b), true);
      assert.equal(await due(c), false);
      for (const [temporary, expected] of [
        ['30', false],
        ['off', true],
      ]) {
        const { settings } = ok(await api(b, '/privacy'));
        ok(await api(b, '/privacy', 'PATCH', { version: settings.version, temporary }));
        assert.equal(await due(b), expected);
      }
      ok(await post(b, base + '/personal', { action: 'reminder', minutes: null }));
      assert.equal(await due(b), false);
      ok(await post(b, base + '/personal', { action: 'reminder', minutes: 60 }));
      ok(await post(a, base + '/organize', { action: 'cancel' }));
      assert.equal(await due(b), false);
      assert.equal(ok(await p1(b, base)).gathering.reminderMinutes, null);
    },
  );
  await t.test('Together planning, private calendar, authorized roster and capacity', async () => {
    const body = {
      clientId: randomUUID(),
      category: 'food',
      title: '等大家商量',
      decision: '喝什么',
      choices: ['茶', '咖啡'],
      mode: 'open',
      minimum: 2,
      capacity: 2,
      planning: true,
      options: [],
      memberIds: [userId(b)],
    };
    const { id } = ok(await post(a, '/gatherings', body));
    assert.equal(ok(await post(a, '/gatherings', body)).id, id);
    const chat = async (viewer, peer) => ok(await p1(viewer, '/gathering-chat/' + userId(peer)))
      .invitations.filter((entry) => entry.gatheringId === id);
    const [sent] = await chat(a, b);
    assert.equal((await chat(a, b)).length, 1);
    assert.equal(sent.mine, true);
    assert.deepEqual(await chat(b, a), [{ ...sent, mine: false }]);
    assert.deepEqual(await chat(outside, a), []);
    assert.equal(sent.startsAt, null);
    const base = '/gatherings/' + id;
    ok(await p1(outside, base), 404);
    const edit = { title: '秋天下午喝杯茶', description: '带一本书', revision: 1 };
    ok(await post(b, base + '/details', edit), 404);
    ok(await post(a, base + '/details', edit));
    ok(await post(a, base + '/details', edit), 409);
    assert.equal(ok(await p1(b, base)).gathering.title, edit.title);
    assert.ok(ok(await p1(b, base)).updates.some((entry) => entry.kind === 'gathering_updated'));
    ok(await post(b, base + '/roster', { action: 'invite', memberIds: [userId(c)] }), 404);
    ok(await post(a, base + '/roster', { action: 'invite', memberIds: [userId(c)] }));
    const [oldInvite] = await chat(c, a);
    assert.equal(oldInvite.mine, false);
    ok(await post(a, base + '/roster', { action: 'remove', userId: userId(c) }));
    ok(await p1(c, base), 404);
    assert.deepEqual(await chat(c, a), []);
    ok(await post(a, base + '/roster', { action: 'invite', memberIds: [userId(c)] }));
    assert.notEqual((await chat(c, a))[0].id, oldInvite.id);
    const startsAt = new Date(Date.now() + 86400000).toISOString(),
      endsAt = new Date(Date.now() + 86400000 + 7200000).toISOString();
    ok(await post(a, base + '/organize', { action: 'propose', options: [{ startsAt, endsAt }] }));
    const [option] = ok(await p1(a, base)).options;
    assert.equal(option.place, '');
    assert.equal((await chat(b, a))[0].startsAt, startsAt);
    assert.equal((await chat(b, a))[0].title, edit.title);
    ok(await post(b, base + '/personal', { action: 'answer', answer: '茶' }));
    ok(await post(a, base + '/organize', { action: 'choose', optionId: option.id }));
    const confirmations = await Promise.all(
      [b, c].map((who) => post(who, base + '/confirm', { attend: true, choiceId: option.id })),
    );
    assert.deepEqual(confirmations.map((r) => r.status).sort(), [200, 409]);
    const attendee = confirmations[0].status === 200 ? b : c;
    ok(await post(attendee, base + '/calendar', { enabled: true }));
    ok(await post(attendee, base + '/calendar', { enabled: true }));
    assert.equal(ok(await p1(attendee, base)).gathering.inCalendar, true);
    ok(await post(attendee, base + '/personal', { action: 'answer', answer: '茶' }), 409);
    ok(await post(attendee, base + '/personal', { action: 'note', note: '忌花生' }));
    assert.equal(ok(await p1(a, base)).gathering.answer, null);
    assert.ok(ok(await p1(a, base)).roster.some((person) => person.note === '忌花生'));
    const other = attendee === b ? c : b;
    assert.ok(!JSON.stringify(ok(await p1(other, base))).includes('忌花生'));
    ok(await post(other, base + '/personal', { action: 'wait', join: true }));
    ok(await post(attendee, base + '/confirm', { attend: false, choiceId: option.id }));
    const offered = ok(await p1(other, base)).gathering;
    assert.equal(offered.offered, true);
    assert.equal(offered.confirmed, false);
    ok(await post(other, base + '/confirm', { attend: true, choiceId: option.id }));
    ok(await post(other, base + '/calendar', { enabled: true }));
    ok(await post(other, base + '/personal', { action: 'reminder', minutes: 60 }));
    assert.equal(
      (await admin.query('SELECT visibility FROM p2_calendar_events WHERE gathering_id=$1', [id])).rows[0]
        .visibility,
      'private',
    );
    ok(await post(a, base + '/organize', { action: 'reschedule', options: [{ startsAt }] }));
    assert.equal(ok(await p1(attendee, base)).gathering.confirmed, false);
    assert.equal(
      (await admin.query('SELECT id FROM p2_calendar_events WHERE gathering_id=$1', [id])).rowCount,
      0,
    );
    assert.equal(ok(await api(attendee, '/p2/availability/' + id)).options[0].allFree, false);
    const next = ok(await p1(other, base)).options[0];
    ok(await post(a, base + '/organize', { action: 'choose', optionId: next.id }));
    ok(await post(other, base + '/confirm', { attend: true, choiceId: option.id }), 409);
    assert.equal(ok(await p1(other, base)).gathering.reminderMinutes, null);
    ok(await post(a, base + '/organize', { action: 'cancel' }));
  });
  await t.test(
    'Activity covers, album bytes, entry titles and journal grants are independently scoped',
    async () => {
      const jpeg = await readFile(new URL('../../assets/demo/person-4.jpg', import.meta.url));
      const startsAt = new Date(Date.now() + 86400000).toISOString();
      const { id } = ok(
        await post(a, '/gatherings', {
          clientId: randomUUID(),
          title: '试验邀请',
          mode: 'open',
          minimum: 2,
          planning: true,
          cover: jpeg.toString('base64'),
          category: 'walk',
          memberIds: [userId(b)],
          options: [{ startsAt }],
        }),
      );
      const base = '/gatherings/' + id;
      assert.equal(ok(await p1(b, base)).gathering.cover, jpeg.toString('base64'));
      ok(await post(a, base + '/roster', { action: 'invite', memberIds: [userId(c)] }));
      assert.equal(ok(await p1(c, base)).gathering.cover, null);
      const choiceId = ok(await p1(a, base)).options[0].id;
      ok(await post(a, base + '/organize', { action: 'choose', optionId: choiceId }));
      ok(await post(b, base + '/confirm', { choiceId, attend: true }));
      ok(await post(c, base + '/confirm', { choiceId, attend: true }));
      await admin.query("UPDATE p1_gathering_options SET starts_at=now()-interval '5 minutes' WHERE id=$1", [
        choiceId,
      ]);
      const journal = ok(
        await post(a, '/collections', {
          clientId: randomUUID(),
          title: '活动记录',
          kind: 'journal',
          gatheringId: id,
          liveJournal: true,
          memberIds: [userId(b), userId(c)],
        }),
      ).id;
      for (const user of [b, c])
        ok(await post(user, '/collections/' + journal + '/membership', { action: 'accept' }));
      const entry = ok(
        await post(a, '/collections/' + journal + '/entries', {
          clientId: randomUUID(),
          title: '私下的现场记录',
          category: 'walk',
          eventDate: '2026-11-26',
        }),
      ).id;
      const asset = ok(
        await api(a, '/moment-media', 'POST', {
          clientId: randomUUID(),
          mime: 'image/jpeg',
          base64: jpeg.toString('base64'),
        }),
        201,
      ).media.id;
      const contribution = ok(
        await post(a, '/entries/' + entry + '/contributions', {
          clientId: randomUUID(),
          body: '现场照片',
          mediaIds: [asset],
        }),
      ).id;
      const viewers = '/contributions/' + contribution + '/audience?channel=workspace';
      assert.equal(ok(await p1(b, '/collections/' + journal)).entries.length, 0);
      ok(await p1(b, '/entries/' + entry), 404);
      assert.equal(ok(await p1(b, '/collections/' + journal + '/album')).media.length, 0);
      const version = ok(await p1(a, viewers)).version;
      ok(await p1(a, viewers, 'PATCH', { version, viewerIds: [userId(b)] }));
      assert.equal(ok(await p1(b, '/entries/' + entry)).contributions[0].body, '现场照片');
      assert.equal(ok(await p1(b, '/collections/' + journal + '/album')).media.length, 1);
      ok(await p1(c, '/entries/' + entry), 404);
      ok(await post(a, base + '/roster', { action: 'remove', userId: userId(b) }));
      ok(await p1(b, '/collections/' + journal + '/album'), 404);
      assert.equal(
        (
          await admin.query(
            'SELECT id FROM p1_contribution_workspace_readers r JOIN p1_contributions k ON k.id=r.contribution_id WHERE k.id=$1 AND viewer_id=$2',
            [contribution, userId(b)],
          )
        ).rowCount,
        0,
      );
      ok(await post(a, base + '/roster', { action: 'invite', memberIds: [userId(b)] }));
      ok(await p1(b, '/entries/' + entry), 404);
      ok(await p1(a, '/contributions/' + contribution, 'DELETE'));
      assert.equal(ok(await p1(a, '/collections/' + journal + '/album')).media.length, 0);
      ok(await p1(b, '/entries/' + entry), 404);
    },
  );
  await t.test('Referenced places and checklists keep their original readers', async () => {
    const p2 = (who, path, body) => api(who, '/p2' + path, body ? 'POST' : 'GET', body);
    const { id: space } = ok(
      await p2(a, '/spaces', {
        clientId: randomUUID(),
        kind: 'list',
        title: '野餐清单',
        memberIds: [userId(b)],
      }),
    );
    ok(await p2(b, '/spaces/' + space + '/membership', { action: 'accept' }));
    const { id: item } = ok(
      await p2(a, '/items', {
        clientId: randomUUID(),
        kind: 'saved',
        title: '水',
        scope: 'space',
        spaceId: space,
      }),
    );
    const action = '/items/' + item + '/checklist';
    ok(await p2(a, action, { action: 'quantity', quantity: 3 }));
    ok(await p2(b, action, { action: 'claim', enabled: true }));
    ok(await p2(a, action, { action: 'claim', enabled: true }), 409);
    ok(await p2(b, action, { action: 'claim', enabled: false }));
    ok(await p2(b, action, { action: 'check', done: true }));
    assert.equal(ok(await p2(a, '/items/' + item)).item.quantity, 3);
    ok(await p2(outside, action, { action: 'check', done: false }), 404);
    const { id: source } = ok(
      await p2(a, '/items', {
        clientId: randomUUID(),
        kind: 'place',
        title: '集合点',
        scope: 'private',
        latitude: 0,
        longitude: 0,
      }),
    );
    const { id } = ok(
      await post(a, '/gatherings', {
        clientId: randomUUID(),
        title: '野餐',
        category: 'food',
        minimum: 2,
        mode: 'open',
        source,
        checklistId: space,
        memberIds: [userId(b), userId(c)],
        options: [],
        planning: true,
      }),
    );
    const base = '/gatherings/' + id;
    assert.equal(ok(await p1(a, base)).gathering.source.id, source);
    assert.equal(ok(await p1(b, base)).gathering.source, null);
    assert.equal(ok(await p1(b, base)).gathering.checklist.id, space);
    assert.equal(ok(await p1(c, base)).gathering.checklist, null);
    ok(await p2(b, '/spaces/' + space + '/membership', { action: 'leave' }));
    assert.equal(ok(await p1(b, base)).gathering.checklist, null);
  });
});
