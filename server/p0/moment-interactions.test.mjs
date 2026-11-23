import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';

test('moment notifications and sharing are private, retry-safe and revocable on PostgreSQL', async (t) => {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'penlia_moments_test');
  assert.equal(process.env.PGUSER, 'penlia_app');
  assert.match(process.env.PGPORT ?? '', /^55\d{3}$/);
  const { pool } = await import('../db.mjs');
  const { createApiServer } = await import('../http.mjs');
  const server = createApiServer().listen(0, '127.0.0.1');
  await once(server,'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  async function call(who, path, method = 'GET', body, status = 200) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/v1' + path, {
      method, headers: { ...(who && { authorization: 'Bearer ' + who.token }), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const json = await response.json();
    assert.equal(response.status, status, method + ' ' + path + ' ' + JSON.stringify(json));
    return json;
  }

  const [owner, reader, eligible, outside] = await Promise.all(['owner', 'reader', 'eligible', 'outside'].map((name) =>
    call(null, '/register', 'POST', { username: 'interact_' + name, name, password: 'synthetic-moment-72!' }, 201)));
  for (const [a,b] of [[owner,reader],[owner,eligible],[reader,eligible],[reader,outside]]) {
    const invite = await call(a, '/friends', 'POST', { userId: b.user.id });
    await call(b, '/friends/accept', 'POST', { id: invite.id });
  }

  const post = async (text, scope = 'friends') => (await call(owner, '/moments', 'POST', {
    body: text, clientId: randomUUID(), scope, mediaIds: [],
  }, 201)).id;
  const original = await post('原作者的内容');
  const path = '/moments/' + original;
  const badge = '/moment-notifications?badge=1';

  await t.test('deduplicated interaction history is visible only to the owner, and badge clears', async () => {
    await call(reader, path+'/like', 'PUT', { liked: true });
    await call(reader, path+'/like', 'PUT', { liked: false });
    await call(reader, path+'/like', 'PUT', { liked: true });
    const comment = { clientId: randomUUID(), body: '留言正文' };
    await call(reader, path+'/comments', 'POST', comment, 201);
    await call(reader, path+'/comments', 'POST', comment, 201);
    assert.equal((await call(owner,badge)).unread,true);
    assert.equal((await call(eligible,badge)).unread,false);
    const { notifications } = await call(owner,'/moment-notifications');
    assert.deepEqual(notifications.map((row) => row.kind), ['comment','ye']);
    assert.equal(notifications[0].comment, comment.body);
    assert.equal(notifications[0].momentId, original);
    await call(outside,'/moment-notifications/read','POST',{ids:notifications.map((row)=>row.id)});
    assert.equal((await call(owner,badge)).unread,true);
    await call(owner,'/moment-notifications/read','POST',{ids:notifications.map((row)=>row.id)});
    assert.equal((await call(owner,badge)).unread,false);
    assert.equal((await call(owner,'/moment-notifications')).notifications.length,2);
  });

  await t.test('chat tickets authorize both endpoints and react to privacy edits and withdrawal', async () => {
    await call(reader,path+'/share-chat','POST',{receiver:outside.user.id},403);
    const ticket = await call(reader,path+'/share-chat','POST',{receiver:eligible.user.id});
    assert.deepEqual(await call(reader,path+'/share-chat','POST',{receiver:eligible.user.id}),ticket);
    const share = '/moment-chat-shares/'+ticket.id;
    assert.equal((await call(eligible,share)).moment.body,'原作者的内容');
    await call(owner,share,'GET',undefined,404);
    await call(outside,share,'GET',undefined,404);
    await call(owner,path,'PATCH',{scope:'selected',memberIds:[reader.user.id],revision:1});
    await call(eligible,share,'GET',undefined,404);
    await call(owner,path,'PATCH',{scope:'friends',revision:2});
    assert.equal((await call(eligible,share)).moment.id,original);
    await call(owner,path+'/forward-permission','PUT',{allowed:false});
    await call(eligible,share,'GET',undefined,404);
    await call(owner,path+'/forward-permission','PUT',{allowed:true});
    await call(eligible,share,'GET',undefined,404);
  });

  await t.test('only an author can decide; publishing checks the current ACL and creates a bare reference', async () => {
    const [requested,retry] = await Promise.all(Array.from({ length: 2 }, () => call(reader,path+'/request-forward','POST')));
    assert.equal(requested.id,retry.id);
    assert.equal(requested.status,'pending');
    const control = '/moment-forward-requests/'+requested.id;
    await call(reader,control,'POST',{action:'publish'},409);
    await call(eligible,control,'POST',{action:'approve'},404);
    const { notifications } = await call(owner,'/moment-notifications');
    const notice = notifications.find((row)=>row.kind==='forward_request');
    assert.equal(notice.requestId,requested.id);
    await call(owner,control,'POST',{action:'approve'});
    assert.equal((await call(reader,'/moment-notifications')).notifications[0].decision,'approved');
    await call(owner,path,'PATCH',{scope:'selected',memberIds:[eligible.user.id],revision:3});
    await call(reader,control,'POST',{action:'publish'},403);
    await call(owner,path,'PATCH',{scope:'friends',revision:4});
    const result = await call(reader,control,'POST',{action:'publish'});
    assert.deepEqual(await call(reader,control,'POST',{action:'publish'}),result);
    const wrapper = '/moments/'+result.publishedId;
    const { moment } = await call(eligible,wrapper);
    assert.equal(moment.forwarded,true);
    assert.equal(moment.canForward,false);
    assert.equal(moment.body,'');
    assert.deepEqual(moment.media,[]);
    assert.equal((await call(eligible,wrapper+'/original')).moment.id,original);
    await call(outside,wrapper,'GET',undefined,404);
    await call(outside,wrapper+'/original','GET',undefined,404);
    await call(owner,control,'POST',{action:'revoke'});
    await call(eligible,wrapper,'GET',undefined,404);
    await call(eligible,wrapper+'/original','GET',undefined,404);
    assert.equal((await call(eligible,path)).moment.id,original);
    await call(reader,control,'POST',{action:'publish'},409);
  });

  await t.test('rejection is final; deletion removes references and old notifications', async () => {
    const id = await post('另一条原动态');
    const requested = await call(reader,'/moments/'+id+'/request-forward','POST');
    const control = '/moment-forward-requests/'+requested.id;
    await call(owner,control,'POST',{action:'reject'});
    await call(owner,control,'POST',{action:'approve'},409);
    await call(reader,control,'POST',{action:'publish'},409);
    assert.equal((await call(reader,'/moments/'+id+'/request-forward','POST')).status,'rejected');
    const other = await call(eligible,'/moments/'+id+'/request-forward','POST');
    const approval = '/moment-forward-requests/'+other.id;
    await call(owner,approval,'POST',{action:'approve'});
    const published = await call(eligible,approval,'POST',{action:'publish'});
    await call(owner,'/moments/'+id,'DELETE');
    await call(eligible,'/moments/'+published.publishedId+'/original','GET',undefined,404);
    assert.equal((await call(owner,'/moment-notifications')).notifications.some((row)=>row.momentId===id),false);
  });
});
