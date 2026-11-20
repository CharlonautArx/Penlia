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
  const advisorCalls = [];
  const reviewAdvisor = {
    suggest: async (input) => {
      advisorCalls.push(input);
      return { focus: 'context' };
    },
  };
  const off = createApiServer().listen(0, '127.0.0.1');
  const server = createApiServer({ rtc, reviewAdvisor }).listen(0, '127.0.0.1');
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
    assert.equal(initial.gathering.directProposal, false);
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
    assert.equal(row.gathering.directProposal, true);
    assert.equal((await post(a, all + '/organize', { action: 'seal' })).status, 409);
    assert.equal(
      (await post(b, all + '/intention', { intention: 'interested', optionIds: [allOption] })).status,
      409,
    );
    assert.equal((await post(c, all + '/intention', { intention: 'unavailable' })).status, 409);
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
    const pair = await create('open', [c]);
    const pairDetail = ok(await p1(a, pair));
    assert.equal(pairDetail.gathering.directProposal, true);
    ok(await post(a, pair + '/organize', { action: 'choose', optionId: pairDetail.options[0].id }));
    ok(await post(c, pair + '/confirm', { attend: true }));
    assert.equal(ok(await p1(a, pair)).gathering.state, 'formed');
    const sparse = await create('open', [b, c, d]);
    const sparseOption = ok(await p1(a, sparse)).options[0].id;
    for (const who of [b, c])
      ok(await post(who, sparse + '/intention', { intention: 'interested', optionIds: [sparseOption] }));
    ok(await post(a, sparse + '/organize', { action: 'seal' }));
    assert.equal(ok(await p1(a, sparse)).suggestion, undefined);
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
      assert.equal(
        (await p1(re1, '/reviews/' + report.id + '/suggestion', 'POST', {}, { off: true })).status,
        503,
      );
      assert.equal((await post(re1, '/reviews/' + report.id + '/suggestion', {})).status, 403);
      await admin.query("UPDATE p1_reports SET submitted_at=now()-interval '12 days' WHERE id=$1", [
        report.id,
      ]);
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
          `SELECT e.id,r.submitted_at,r.decided_at,e.execute_at,extract(epoch FROM e.execute_at-r.decided_at)::int seconds
      FROM p1_enforcement e JOIN p1_reports r ON r.id=e.report_id WHERE e.report_id=$1`,
          [report.id],
        )
      ).rows[0];
      assert.ok(outcome.seconds >= 86400 && outcome.seconds <= 604800, outcome.seconds);
      assert.ok(outcome.decided_at - outcome.submitted_at >= 12 * 86400e3);
      assert.equal((await runEnforcement(new Date(+outcome.execute_at - 1000))).applied, 0);
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
          urgent: false,
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

  await t.test(
    '13: authority-scoped photo/video snapshots survive source removal, and an advisor gets only consented redacted excerpts',
    async () => {
      const image = await upload(a, photo, 'image/jpeg');
      const clip = await upload(a, video, 'video/mp4');
      const unselected = await upload(a, photo, 'image/jpeg');
      const line = async (file, content) =>
        ok(
          await api(a, room + '/messages', 'POST', {
            clientId: randomUUID(),
            content,
            mediaIds: [file.id],
          }),
          201,
        ).id;
      const key = await line(
        image,
        '王小明 13912345678 user@example.com https://example.com/secret 需要确认',
      );
      const context = await line(clip, '提供的短视频');
      const other = await line(unselected, '未选择的内容');
      const request = {
        clientId: randomUUID(),
        kind: 'boundary',
        groupId: group,
        anchorId: key,
        messageIds: [key, context],
        allowAssistance: true,
        explanation: '不得传出的举报说明',
        attachments: [unselected.id],
      };
      const { id } = ok(await post(c, '/reports', request));
      const path = '/review-media/' + id + '/';
      const reviewPath = '/reviews/' + id;
      const evidence = ok(await p1(re1, reviewPath + '/evidence')).evidence;
      assert.deepEqual(
        evidence.messages.map((m) => m.id),
        [key, context],
      );
      assert.deepEqual(
        evidence.messages.flatMap((m) => m.attachments.map((p) => p.id)),
        [image.id, clip.id],
      );
      assert.equal(
        evidence.messages[0].attachments[0].sha256,
        createHash('sha256').update(photo).digest('hex'),
      );
      for (const who of [a, b, c, outside]) assert.equal((await p1(who, path + image.id)).status, 404);
      assert.equal((await p1(re1, path + unselected.id)).status, 404);
      assert.equal((await p1(re1, '/review-media/' + randomUUID() + '/' + image.id)).status, 404);
      const archived = (
        await admin.query('SELECT sealed_data FROM p1_report_media WHERE report_id=$1 AND media_id=$2', [
          id,
          image.id,
        ])
      ).rows[0].sealed_data;
      assert.ok(!archived.includes(photo.subarray(0, 64)));
      await admin.query('DELETE FROM private_media WHERE id=ANY($1::uuid[])', [[image.id, clip.id]]);
      assert.equal((await api(c, '/moment-media/' + image.id)).status, 404);
      const persisted = await p1(re1, path + image.id);
      assert.equal(persisted.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(ok(persisted), photo);
      const movie = await p1(re2, path + clip.id, 'GET', undefined, { headers: { range: 'bytes=1-10' } });
      assert.equal(movie.headers.get('content-range'), 'bytes 1-10/' + video.length);
      assert.deepEqual(ok(movie, 206), video.subarray(1, 11));
      assert.equal(
        (await p1(re1, path + clip.id, 'HEAD')).headers.get('content-length'),
        String(video.length),
      );
      assert.equal(
        (await p1(re1, path + clip.id, 'GET', undefined, { headers: { range: 'bytes=99999999-' } })).status,
        416,
      );
      assert.ok(
        ok(await p1(re2, reviewPath + '/audit')).audit.some(
          (row) => row.action === 'evidence_media_accessed',
        ),
      );

      assert.equal(
        (
          await post(c, reviewPath + '/suggestion', {
            redactionConfirmed: true,
            selection: [{ id: key, redactions: [] }],
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await post(re1, reviewPath + '/suggestion', {
            redactionConfirmed: true,
            selection: [{ id: other, redactions: [] }],
          })
        ).status,
        400,
      );
      assert.equal(
        (await post(re1, reviewPath + '/suggestion', { selection: [{ id: key, redactions: [] }] })).status,
        400,
      );
      assert.equal(advisorCalls.length, 0);
      assert.deepEqual(
        ok(
          await post(re1, reviewPath + '/suggestion', {
            redactionConfirmed: true,
            selection: [{ id: key, redactions: [{ start: 0, end: 3 }] }],
          }),
        ),
        { focus: 'context' },
      );
      const { evidence: safe, ...meta } = advisorCalls[0];
      assert.deepEqual(safe.messages, [
        { speaker: 'subject', text: '[已遮盖] [已遮盖] [已遮盖] [已遮盖] 需要确认', mediaKinds: ['image'] },
      ]);
      assert.equal(meta.policyVersion, 'p1-v2');
      for (const secret of [id, key, userId(a), other, '不得传出的举报说明', '未选择的内容', image.id])
        assert.ok(!JSON.stringify(advisorCalls[0]).includes(secret));
      assert.equal(
        (await admin.query('SELECT count(*)::int n FROM p1_enforcement WHERE report_id=$1', [id])).rows[0].n,
        0,
      );
      assert.equal(
        (await admin.query('SELECT status FROM p1_reports WHERE id=$1', [id])).rows[0].status,
        'pending',
      );
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
    const contribution = ok(
      await post(b, '/entries/' + draft.id + '/contributions', {
        clientId: randomUUID(),
        body: '只给我选定的人',
        mediaIds: [picture.id],
      }),
    );
    const workspace = '/contributions/' + contribution.id + '/audience?channel=workspace';
    const publicScope = '/contributions/' + contribution.id + '/audience?channel=publication';
    const entryPath = '/entries/' + draft.id;
    const media = '/moment-media/' + picture.id;
    const album = base + '/album';
    const history = '/contributions/' + contribution.id + '/history';
    async function viewers(who, route, selected, version) {
      return p1(who, route, 'PATCH', {
        version: version ?? ok(await p1(who, route)).version,
        viewerIds: selected.map(userId),
      });
    }
    async function hidden(who) {
      assert.deepEqual(ok(await p1(who, entryPath)).contributions, []);
      assert.deepEqual(ok(await p1(who, album)).media, []);
      for (const method of ['GET', 'HEAD']) assert.equal((await api(who, media, method)).status, 404);
      assert.equal(
        (await api(who, media, 'GET', undefined, { headers: { range: 'bytes=0-7' } })).status,
        404,
      );
    }
    await hidden(a);
    assert.equal((await p1(a, history)).status, 404);
    assert.equal((await p1(a, workspace)).status, 404);
    assert.equal(
      (await p1(a, workspace, 'PATCH', { version: 'forged', viewerIds: [userId(a)] })).status,
      404,
    );
    assert.equal((await p1(a, workspace, 'DELETE')).status, 404);
    assert.equal((await p1(c, base)).status, 404);
    assert.equal((await post(b, base + '/publish', { scope: 'friends' })).status, 404);
    ok(await viewers(b, workspace, [a]));
    assert.equal(ok(await p1(a, entryPath)).contributions[0].body, '只给我选定的人');
    assert.equal((await p1(a, history)).status, 200);
    ok(await post(a, base + '/invite', { memberIds: [userId(d)] }));
    ok(await post(d, base + '/membership', { action: 'accept' }));
    await hidden(d);

    const moment = ok(await post(a, base + '/publish', { scope: 'selected', memberIds: [userId(c)] }));
    const momentPath = '/moments/' + moment.id;
    const feed = ok(await api(c, '/moments')).moments;
    assert.equal(feed.find((item) => item.id === moment.id).collaborationId, collab.id);
    await hidden(c);
    assert.equal((await p1(outside, base)).status, 404);
    assert.deepEqual(ok(await p1(b, publicScope)).viewers, []);
    for (const friend of [c, d]) {
      const link = ok(await api(b, '/friends', 'POST', { userId: userId(friend) }));
      ok(await api(friend, '/friends/accept', 'POST', { id: link.id }));
    }
    const initialPlan = ok(await p1(b, publicScope));
    assert.deepEqual(initialPlan.viewers, [{ id: userId(c), name: c.user.name, allowed: false }]);
    ok(await viewers(b, publicScope, [c]));
    assert.equal(ok(await p1(c, entryPath)).contributions[0].body, '只给我选定的人');
    assert.equal(ok(await p1(c, album)).media[0].id, picture.id);
    assert.equal((await api(c, media)).status, 200);
    const oldPlan = ok(await p1(b, publicScope));
    ok(await api(a, momentPath, 'PATCH', { scope: 'friends', revision: 1 }));
    assert.equal((await api(c, media)).status, 200);
    await hidden(d);
    assert.equal((await viewers(b, publicScope, [c, d], oldPlan.version)).status, 409);
    ok(await viewers(b, publicScope, [c, d]));
    assert.equal((await api(d, media)).status, 200);
    ok(await api(a, momentPath, 'PATCH', { scope: 'selected', memberIds: [userId(c)], revision: 2 }));
    await hidden(d);
    ok(await api(a, momentPath, 'PATCH', { scope: 'friends', revision: 3 }));
    await hidden(d);
    ok(await p1(b, publicScope, 'DELETE'));
    await hidden(c);
    assert.equal((await api(a, media)).status, 200);
    ok(await p1(b, workspace, 'DELETE'));
    await hidden(a);
    assert.equal((await p1(a, history)).status, 404);
    assert.equal((await api(b, media)).status, 200);
    ok(await viewers(b, publicScope, [c]));
    assert.equal((await api(c, media)).status, 200);
    ok(await api(a, momentPath, 'DELETE'));
    const republished = ok(await post(a, base + '/publish', { scope: 'friends' }));
    assert.notEqual(republished.id, moment.id);
    await hidden(c);
    const relations = ok(
      await api(a, '/relationship-groups', 'POST', { label: '老朋友', memberIds: [userId(c)] }),
      201,
    ).group;
    ok(
      await api(a, '/moments/' + republished.id, 'PATCH', {
        scope: 'group',
        groupId: relations.id,
        revision: 1,
      }),
    );
    ok(await viewers(b, publicScope, [c]));
    assert.equal((await api(c, media)).status, 200);
    const relPath = '/relationship-groups/' + relations.id;
    ok(await api(a, relPath, 'PUT', { label: '老朋友', memberIds: [userId(c), userId(d)] }));
    await hidden(d);
    ok(await api(a, relPath, 'PUT', { label: '老朋友', memberIds: [userId(d)] }));
    assert.equal((await api(c, media)).status, 404);
    ok(await api(a, relPath, 'PUT', { label: '老朋友', memberIds: [userId(c), userId(d)] }));
    await hidden(c);
  });
});
