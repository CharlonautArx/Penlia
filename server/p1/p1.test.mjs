import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('P1 HTTP integration on isolated PostgreSQL', async (t) => {
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
  const { runEnforcement } = await import('./moderation.mjs');
  const { default: pg } = await import('pg');
  const admin = new pg.Pool({
    user: 'postgres',
    password: process.env.PENLIA_P0_TEST_ADMIN_PASSWORD,
    ssl: false,
  });
  const closed = [];
  const rtc = {
    mintRoomToken: async ({ roomId, participantId }) => 'isolated-test:' + roomId + ':' + participantId,
    closeRoom: async ({ roomId }) => {
      closed.push(roomId);
    },
  };
  const off = createApiServer().listen(0, '127.0.0.1');
  const server = createApiServer({ rtc }).listen(0, '127.0.0.1');
  await Promise.all([once(server, 'listening'), once(off, 'listening')]);
  t.after(async () => {
    await Promise.all([server, off].map((http) => new Promise((resolve) => http.close(resolve))));
    await Promise.all([pool.end(), admin.end()]);
  });

  async function ask(who, path, method = 'GET', body, options = {}) {
    const response = await fetch('http://127.0.0.1:' + (options.off ? off : server).address().port + path, {
      method,
      headers: {
        ...(who ? { Authorization: 'Bearer ' + who.token } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: body && JSON.stringify(body),
    });
    const data = response.headers.get('content-type')?.includes('json')
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
          password: 'synthetic_p1_passphrase',
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
  await admin.query('INSERT INTO p1_reviewers(user_id) VALUES($1),($2)', [userId(re1), userId(re2)]);
  await assert.rejects(pool.query('INSERT INTO p1_reviewers(user_id) VALUES($1)', [userId(outside)]), {
    code: '42501',
  });

  async function upload(who, file, mime) {
    return ok(
      await api(who, '/moment-media', 'POST', {
        clientId: randomUUID(),
        mime,
        base64: file.toString('base64'),
      }),
      201,
    ).media;
  }
  const photo = await readFile(new URL('../../assets/demo/person-4.jpg', import.meta.url));
  const video = process.env.PENLIA_P0_VIDEO_FIXTURE
    ? await readFile(process.env.PENLIA_P0_VIDEO_FIXTURE)
    : null;
  assert.ok(video, 'Set PENLIA_P0_VIDEO_FIXTURE to a short MP4');
  const group = ok(await api(a, '/groups', 'POST', { name: '海边散步群' }), 201).id;
  const room = '/groups/' + group;
  for (const who of [b, c]) {
    const invite = ok(await api(a, room + '/invites', 'POST', { userId: userId(who) }), 201);
    ok(await api(who, '/group-invites/accept', 'POST', { id: invite.id }));
  }
  let anchor;

  await t.test(
    '10: text, photo and video flags persist independently and leave quiet policy intact',
    async () => {
      const files = [await upload(a, photo, 'image/jpeg'), await upload(a, video, 'video/mp4')];
      const plain = ok(
        await api(a, room + '/messages', 'POST', { clientId: randomUUID(), content: '今晚的晚霞' }),
        201,
      );
      for (const file of files) {
        const body = {
          clientId: randomUUID(),
          content: '',
          silent: true,
          noReply: true,
          mediaIds: [file.id],
        };
        const first = ok(await api(a, room + '/messages', 'POST', body), 201);
        assert.equal(ok(await api(a, room + '/messages', 'POST', body), 201).id, first.id);
      }
      anchor = ok(
        await api(b, room + '/messages', 'POST', {
          clientId: randomUUID(),
          content: '测试证据：今晚六点前交付项目表。',
          noReply: true,
        }),
        201,
      ).id;
      const lines = ok(await api(c, room + '/messages')).messages;
      assert.equal(lines.find((line) => line.id === plain.id).noReply, false);
      assert.equal(lines.find((line) => line.id === anchor).silent, false);
      assert.equal(lines.find((line) => line.id === anchor).noReply, true);
      for (const file of files) {
        const line = lines.find((item) => item.media.some((media) => media.id === file.id));
        assert.equal(line.silent, true);
        assert.equal(line.noReply, true);
        assert.equal((await api(c, '/moment-media/' + file.id)).status, 200);
        assert.equal((await api(outside, '/moment-media/' + file.id)).status, 404);
      }
      const timestamp = Date.now();
      const callId = process.env.EASEMOB_APP_KEY + '_' + randomUUID();
      const security = createHash('md5')
        .update(callId + process.env.PENLIA_IM_CALLBACK_SECRET + timestamp)
        .digest('hex');
      const im = (who) => 'penlia_' + userId(who).replaceAll('-', '');
      const result = ok(
        await ask(null, '/callbacks/easemob/' + process.env.PENLIA_IM_CALLBACK_PATH_KEY, 'POST', {
          timestamp,
          callId,
          security,
          chat_type: 'chat',
          from: im(a),
          to: im(b),
          payload: {
            bodies: [{ type: 'txt', msg: '测试' }],
            ext: { penlia_quiet: true, penlia_no_reply: true },
          },
        }),
      );
      assert.equal(result.payload.ext.penlia_no_reply, true);
      assert.equal(result.payload.ext.em_ignore_notification, true);
    },
  );

  await t.test('11: mutual opt-in, exact scope, edit, pause, delete and event ownership', async () => {
    const base = {
      category: 'film',
      scope: 'selected',
      place: '上海',
      description: '周六看电影',
      memberIds: [userId(b)],
    };
    const wishA = ok(await post(a, '/wishes', { ...base, clientId: randomUUID() }));
    const wishB = ok(
      await post(b, '/wishes', {
        ...base,
        clientId: randomUUID(),
        scope: 'private',
        description: '不会公开的详细描述',
      }),
    );
    assert.deepEqual(ok(await p1(a, '/wishes')).matches, []);
    assert.equal((await p1(a, '/wishes/' + wishB.id, 'DELETE')).status, 404);
    ok(
      await p1(b, '/wishes/' + wishB.id, 'PATCH', {
        ...base,
        description: '不会公开的详细描述',
        memberIds: [userId(a)],
      }),
    );
    const matched = ok(await p1(a, '/wishes'));
    assert.equal(matched.matches[0].friendId, userId(b));
    assert.ok(!JSON.stringify(matched).includes(wishB.id));
    assert.ok(!JSON.stringify(matched).includes('不会公开的详细描述'));
    assert.deepEqual(ok(await p1(outside, '/wishes')).matches, []);
    const event = ok(await p1(a, '/events')).events.find((item) => item.kind === 'wish_match');
    assert.equal(event.subjectId, wishA.id);
    ok(await post(b, '/events/' + event.id + '/open', {}));
    assert.equal(ok(await p1(a, '/events')).events.find((item) => item.id === event.id).readAt, null);
    ok(await post(a, '/events/' + event.id + '/open', {}));
    assert.ok(ok(await p1(a, '/events')).events.find((item) => item.id === event.id).readAt);
    ok(await post(b, '/wishes/' + wishB.id + '/pause', { active: false }));
    assert.deepEqual(ok(await p1(a, '/wishes')).matches, []);
    ok(await p1(b, '/wishes/' + wishB.id, 'DELETE'));
  });

  let finished;
  await t.test('12: anonymous intent seals once, all/free formation, withdrawal and completion', async () => {
    const options = [
      { startsAt: new Date(Date.now() + 72e5).toISOString(), place: '河边剧场' },
      { startsAt: new Date(Date.now() + 108e5).toISOString(), place: '河边剧场' },
    ];
    async function create(mode, invitees, minimum = 2) {
      const body = {
        clientId: randomUUID(),
        mode,
        category: 'film',
        title: '周末看电影',
        memberIds: invitees.map(userId),
        minimum,
        options,
      };
      const result = ok(await post(a, '/gatherings', body));
      assert.equal(ok(await post(a, '/gatherings', body)).id, result.id);
      return '/gatherings/' + result.id;
    }
    const address = await create('open', [b, c, d]);
    const initial = ok(await p1(a, address));
    const option = initial.options[0].id;
    assert.equal((await p1(outside, address)).status, 404);
    assert.equal((await post(b, address + '/organize', { action: 'seal' })).status, 404);
    for (const who of [b, c, d])
      ok(await post(who, address + '/intention', { intention: 'interested', optionIds: [option] }));
    const before = ok(await p1(a, address));
    assert.deepEqual(before.gathering.votes, []);
    assert.equal(before.suggestion, undefined);
    assert.deepEqual(before.attendees, []);
    ok(await post(a, address + '/organize', { action: 'seal' }));
    assert.equal(ok(await p1(a, address)).suggestion, option);
    assert.equal(ok(await p1(b, address)).suggestion, undefined);
    assert.equal((await post(b, address + '/intention', { intention: 'unavailable' })).status, 409);
    ok(await post(a, address + '/organize', { action: 'choose', optionId: option }));
    assert.deepEqual(ok(await p1(c, address)).attendees, []);
    ok(await post(b, address + '/confirm', { attend: true }));
    assert.deepEqual(
      ok(await p1(c, address))
        .attendees.map((item) => item.id)
        .sort(),
      [userId(a), userId(b)].sort(),
    );
    ok(await post(b, address + '/confirm', { attend: false }));
    assert.deepEqual(ok(await p1(c, address)).attendees, []);
    ok(await post(b, address + '/confirm', { attend: true }));
    const all = await create('all', [b, c]);
    const row = ok(await p1(a, all));
    const allOption = row.options[0].id;
    ok(await post(b, all + '/intention', { intention: 'interested', optionIds: [allOption] }));
    ok(await post(c, all + '/intention', { intention: 'unavailable' }));
    ok(await post(a, all + '/organize', { action: 'choose', optionId: allOption }));
    assert.equal(ok(await p1(a, all)).suggestion, undefined);
    ok(await post(b, all + '/confirm', { attend: true }));
    assert.equal(ok(await p1(a, all)).gathering.state, 'confirming');
    assert.deepEqual(ok(await p1(a, all)).attendees, []);
    ok(await post(c, all + '/confirm', { attend: true }));
    assert.equal(ok(await p1(a, all)).gathering.state, 'formed');
    ok(await post(a, all + '/organize', { action: 'reschedule', options }));
    assert.equal(ok(await p1(a, all)).gathering.state, 'interest');
    ok(await post(a, all + '/organize', { action: 'cancel' }));
    assert.equal(ok(await p1(c, all)).gathering.state, 'cancelled');
    assert.equal((await post(a, address + '/organize', { action: 'complete' })).status, 409);
    await admin.query("UPDATE p1_gathering_options SET starts_at=now()-interval '1 hour' WHERE id=$1", [
      option,
    ]);
    ok(await post(a, address + '/organize', { action: 'complete' }));
    finished = initial.gathering.id;
  });

  await t.test(
    '13: evidence consent, encryption, minimum staff scope, protection window, appeal and urgent handling',
    async () => {
      const base = {
        clientId: randomUUID(),
        kind: 'boundary',
        groupId: group,
        anchorId: anchor,
        messageIds: [anchor],
      };
      assert.equal((await post(outside, '/reports', base)).status, 404);
      assert.equal((await p1(a, '/reviews')).status, 404);
      const report = ok(await post(a, '/reports', base));
      assert.equal(ok(await post(a, '/reports', base)).id, report.id);
      assert.equal((await p1(b, '/reviews/' + report.id + '/evidence')).status, 404);
      const record = (await admin.query('SELECT evidence FROM p1_reports WHERE id=$1', [report.id])).rows[0];
      assert.ok(Buffer.isBuffer(record.evidence));
      assert.ok(!record.evidence.includes(Buffer.from('今晚六点前交付')));
      assert.equal(
        ok(await p1(re1, '/reviews/' + report.id + '/evidence')).evidence.messages[0].senderId,
        userId(b),
      );
      assert.equal((await post(re1, '/reviews/' + report.id + '/suggestion', {})).status, 503);
      const decision = {
        decision: 'confirm',
        penalty: 'limit_sending',
        durationHours: 12,
        reason: '内部审核依据，不应出现在公开响应',
      };
      assert.equal(
        (await post(re1, '/reviews/' + report.id + '/decision', { ...decision, urgent: true })).status,
        400,
      );
      ok(await post(re1, '/reviews/' + report.id + '/decision', decision));
      assert.equal((await post(re1, '/reviews/' + report.id + '/decision', decision)).status, 409);
      assert.deepEqual(ok(await p1(b, '/boundary')).actions, []);
      const outcome = (
        await admin.query(
          `SELECT e.id,extract(epoch FROM e.execute_at-r.submitted_at)::int seconds
      FROM p1_enforcement e JOIN p1_reports r ON r.id=e.report_id WHERE e.report_id=$1`,
          [report.id],
        )
      ).rows[0];
      assert.ok(outcome.seconds >= 86400 && outcome.seconds <= 604800, outcome.seconds);
      assert.equal((await ask(a, '/ops/p1/moderation/run', 'POST')).status, 404);
      assert.equal(
        ok(
          await ask(null, '/ops/p1/moderation/run', 'POST', undefined, {
            headers: { Authorization: 'Bearer ' + process.env.PENLIA_MODERATION_JOB_TOKEN },
          }),
        ).applied,
        0,
      );
      await admin.query("UPDATE p1_enforcement SET execute_at=now()-interval '1 minute' WHERE id=$1", [
        outcome.id,
      ]);
      const runs = await Promise.all([runEnforcement(), runEnforcement()]);
      assert.equal(runs[0].applied + runs[1].applied, 1);
      const own = ok(await p1(b, '/boundary')).actions[0];
      assert.ok(!JSON.stringify(own).includes(userId(a)));
      assert.ok(!JSON.stringify(own).includes(decision.reason));
      assert.equal(
        (await api(b, room + '/messages', 'POST', { clientId: randomUUID(), content: '应被拒绝' })).status,
        403,
      );
      ok(await post(b, '/enforcement/' + own.id + '/appeal', { explanation: '请求复核上下文' }));
      assert.equal((await p1(re1, '/appeals/' + report.id)).status, 404);
      assert.equal(ok(await p1(re2, '/appeals/' + report.id)).appeal.explanation, '请求复核上下文');
      ok(
        await post(re2, '/appeals/' + report.id + '/decision', {
          decision: 'overturned',
          resolution: '独立测试复核',
        }),
      );
      ok(
        await api(b, room + '/messages', 'POST', { clientId: randomUUID(), content: '复核后可以发送' }),
        201,
      );
      const audit = ok(await p1(re2, '/reviews/' + report.id + '/audit')).audit;
      assert.equal(audit.filter((entry) => entry.action === 'scheduled_applied').length, 1);
      const privateReport = ok(
        await post(a, '/reports', {
          clientId: randomUUID(),
          kind: 'boundary',
          peerId: userId(b),
          anchorId: 'local-123',
          messages: [{ id: 'local-123', content: '待核验的提供者证据', mine: false }],
        }),
      );
      assert.equal((await post(re1, '/reviews/' + privateReport.id + '/decision', decision)).status, 409);
      assert.equal((await post(re1, '/reviews/' + privateReport.id + '/verify', {})).status, 503);
      const urgent = ok(await post(a, '/reports', { ...base, clientId: randomUUID(), kind: 'threat' }));
      ok(
        await post(re1, '/reviews/' + urgent.id + '/decision', {
          ...decision,
          penalty: 'warning',
          urgent: true,
        }),
      );
      assert.equal(
        ok(await p1(b, '/boundary')).actions.some((item) => item.kind === 'warning'),
        true,
      );
      const temporary = ok(
        await post(c, '/reports', { ...base, clientId: randomUUID(), kind: 'harassment' }),
      );
      ok(await post(re1, '/reviews/' + temporary.id + '/decision', { ...decision, urgent: true }));
      assert.equal(
        (await api(b, room + '/messages', 'POST', { clientId: randomUUID(), content: '处置仍生效' })).status,
        403,
      );
      await admin.query("UPDATE p1_enforcement SET expires_at=now()-interval '1 minute' WHERE report_id=$1", [
        temporary.id,
      ]);
      ok(await api(b, room + '/messages', 'POST', { clientId: randomUUID(), content: '期满自动解除' }), 201);
    },
  );

  await t.test(
    '14: group grants fail closed without provider and authorize actual memberships before minting',
    async () => {
      const path = '/groups/' + group + '/call';
      assert.deepEqual(ok(await p1(a, path, 'GET', undefined, { off: true })), {
        available: false,
        call: null,
      });
      assert.equal((await p1(a, path, 'POST', {}, { off: true })).status, 503);
      assert.equal((await p1(outside, path)).status, 404);
      const active = ok(await post(a, path, {}));
      assert.equal(ok(await post(a, path, {})).id, active.id);
      const url = '/calls/' + active.id;
      assert.equal((await post(outside, url + '/join', {})).status, 404);
      assert.equal((await post(b, url + '/renew', {})).status, 409);
      assert.equal(ok(await post(a, url + '/join', {})).participantId, userId(a));
      assert.equal(ok(await post(b, url + '/join', {})).participantId, userId(b));
      assert.equal(ok(await post(b, url + '/renew', {})).roomId, active.id);
      assert.equal((await post(b, url + '/end', {})).status, 404);
      ok(await api(c, '/friends/block', 'POST', { userId: userId(b) }));
      assert.equal((await post(c, url + '/join', {})).status, 403);
      ok(await api(c, '/friends/unblock', 'POST', { userId: userId(b) }));
      ok(await post(c, url + '/decline', {}));
      assert.equal((await post(c, url + '/join', {})).status, 409);
      ok(await api(b, room + '/leave', 'POST', {}));
      assert.equal((await post(b, url + '/renew', {})).status, 404);
      ok(await post(a, url + '/end', {}));
      assert.deepEqual(closed, [active.id]);
    },
  );

  await t.test('15: journals, opt-in, versioning, media revocation and published P0 scope', async () => {
    const diary = ok(
      await post(a, '/collections', {
        clientId: randomUUID(),
        kind: 'journal',
        title: '电影以后',
        gatheringId: finished,
      }),
    );
    assert.equal((await p1(b, '/collections/' + diary.id)).status, 404);
    assert.equal(
      ok(await p1(b, '/collections')).collections.find((item) => item.id === diary.id).state,
      'invited',
    );
    assert.equal(
      (await post(c, '/collections/' + diary.id + '/membership', { action: 'accept' })).status,
      404,
    );
    ok(await post(b, '/collections/' + diary.id + '/membership', { action: 'accept' }));
    const entry = ok(
      await post(a, '/collections/' + diary.id + '/entries', {
        clientId: randomUUID(),
        title: '周六电影',
        category: 'film',
        eventDate: '2026-11-21',
      }),
    );
    const file = await upload(b, photo, 'image/jpeg');
    const add = { clientId: randomUUID(), body: '第一版日记', mediaIds: [file.id] };
    const line = ok(await post(b, '/entries/' + entry.id + '/contributions', add));
    assert.equal(ok(await post(b, '/entries/' + entry.id + '/contributions', add)).id, line.id);
    assert.equal((await api(c, '/moment-media/' + file.id)).status, 404);
    assert.equal((await api(a, '/moment-media/' + file.id)).status, 200);
    assert.equal(
      (
        await api(b, '/moments', 'POST', {
          clientId: randomUUID(),
          body: '',
          scope: 'private',
          mediaIds: [file.id],
        })
      ).status,
      404,
    );
    assert.equal(
      (await p1(a, '/contributions/' + line.id, 'PATCH', { body: '不能改他人记录', revision: 1 })).status,
      404,
    );
    ok(await p1(b, '/contributions/' + line.id, 'PATCH', { body: '第二版日记', revision: 1 }));
    assert.equal(
      (await p1(b, '/contributions/' + line.id, 'PATCH', { body: '过期版本', revision: 1 })).status,
      409,
    );
    assert.deepEqual(
      ok(await p1(a, '/contributions/' + line.id + '/history')).history.map((version) => version.revision),
      [2, 1],
    );
    assert.equal(ok(await p1(a, '/collections/' + diary.id + '/album')).media[0].id, file.id);
    ok(await post(b, '/collections/' + diary.id + '/membership', { action: 'leave' }));
    assert.equal((await p1(b, '/entries/' + entry.id)).status, 404);
    assert.equal((await api(b, '/moment-media/' + file.id)).status, 404);
    ok(await p1(b, '/contributions/' + line.id, 'DELETE'));
    assert.equal((await api(a, '/moment-media/' + file.id)).status, 404);
    assert.ok(
      ok(await p1(a, '/contributions/' + line.id + '/history')).history.every(
        (version) => version.body === '',
      ),
    );

    const collab = ok(
      await post(a, '/collections', {
        clientId: randomUUID(),
        kind: 'collaboration',
        title: '一起写晚霞',
        memberIds: [userId(b)],
      }),
    );
    const base = '/collections/' + collab.id;
    ok(await post(b, base + '/membership', { action: 'accept' }));
    const page = ok(await p1(a, base));
    const draft = page.entries[0];
    const picture = await upload(b, photo, 'image/jpeg');
    ok(
      await post(b, '/entries/' + draft.id + '/contributions', {
        clientId: randomUUID(),
        body: '我的照片',
        mediaIds: [picture.id],
      }),
    );
    assert.equal((await p1(c, base)).status, 404);
    assert.equal((await post(b, base + '/publish', { scope: 'friends' })).status, 404);
    const moment = ok(await post(a, base + '/publish', { scope: 'selected', memberIds: [userId(c)] }));
    const feed = ok(await api(c, '/moments')).moments;
    assert.equal(feed.find((item) => item.id === moment.id).collaborationId, collab.id);
    assert.equal(ok(await p1(c, '/entries/' + draft.id)).contributions[0].body, '我的照片');
    assert.equal((await api(c, '/moment-media/' + picture.id)).status, 200);
    assert.equal((await p1(outside, base)).status, 404);
    ok(await api(a, '/moments/' + moment.id, 'PATCH', { body: '一起写晚霞', scope: 'private', revision: 1 }));
    assert.equal((await api(c, '/moment-media/' + picture.id)).status, 404);
    assert.equal((await p1(c, base)).status, 404);
  });
});
