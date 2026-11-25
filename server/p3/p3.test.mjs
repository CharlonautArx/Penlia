import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('P3 privacy and shared workflows on isolated PostgreSQL 17', async (t) => {
  if (process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== 'penlia_p3_test'
    || process.env.PGUSER !== 'penlia_app' || !/^55\d{3}$/.test(process.env.PGPORT ?? '')
    || !process.env.PENLIA_P0_TEST_ADMIN_PASSWORD) throw new Error('Use isolated loopback penlia_p3_test');
  const { createApiServer } = await import('../http.mjs');
  const { pool } = await import('../db.mjs');
  const { default: pg } = await import('pg');
  const admin = new pg.Pool({ user:'postgres', password:process.env.PENLIA_P0_TEST_ADMIN_PASSWORD, ssl:false });
  const server = createApiServer().listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await Promise.all([admin.end(),pool.end()]);
  });
  async function api(person,path,method='GET',body,more={}) {
    const response = await fetch('http://127.0.0.1:'+server.address().port+'/v1'+path, {
      method, headers:{ ...(person ? { Authorization:'Bearer '+person.token } : {}),
        ...(body ? { 'Content-Type':'application/json' } : {}), ...more },
      body:body && JSON.stringify(body),
    });
    const json = method!=='HEAD' && response.headers.get('Content-Type')?.includes('json');
    return { status:response.status, data:json ? await response.json() : Buffer.from(await response.arrayBuffer()), headers:response.headers };
  }
  const ok = (result,status=200) => {
    assert.equal(result.status,status,JSON.stringify(result.data).slice(0,300));
    return result.data;
  };
  const uid = (p) => p.user.id;
  const people = [];
  for (const [i,name] of ['小禾','筱晓','阿言','路人'].entries())
    people.push(ok(await api(null,'/register','POST',{ username:'p3_fixture_'+i,name,password: randomUUID() }),201));
  const [a,b,c,outside] = people;
  async function friends(x,y) {
    const r = ok(await api(x,'/friends','POST',{ userId:uid(y) }));
    ok(await api(y,'/friends/accept','POST',{ id:r.id }));
  }
  await friends(a,b);
  await friends(a,c);
  const png = await readFile(new URL('../../assets/identity/glint.png',import.meta.url));
  const video = await readFile(process.env.PENLIA_P0_VIDEO_FIXTURE);
  const upload = async (p,bytes,mime) => ok(await api(p,'/moment-media','POST',{
    clientId:randomUUID(),mime,base64:bytes.toString('base64'),
  }),201).media.id;
  const p3 = (p,path,method,body) => api(p,'/p3'+path,method,body);
  const base = (id) => '/spaces/'+id;
  const addSpace = async (p,kind,title,ids=[]) => ok(await p3(p,'/spaces','POST',{
    clientId:randomUUID(),kind,title,eventDay:kind==='relay'?'2026-11-21':undefined,memberIds:ids.map(uid),
  })).id;
  const membership = (p,id,action,target) => p3(p,base(id)+'/membership','POST',{action,userId:target && uid(target)});
  const recs = (p,id) => p3(p,base(id)+'/records');
  const save = async (p,id,body,recordId) => {
    const roster = body.memberIds?.length ? ok(await p3(p,base(id))).space.rosterVersion : undefined;
    return p3(p,base(id)+'/records'+(recordId?'/'+recordId:''),recordId?'PATCH':'POST',
      { clientId:randomUUID(),rosterVersion:roster,...body });
  };
  const list = async (p,id) => ok(await recs(p,id)).records;
  const sourceList = async (p,kind) => ok(await p3(p,'/sources?kind='+kind)).sources;
  const picturePath = (id) => '/moment-media/'+id;
  let relay,world,entry,photo,clip,journal,coll,trip,capsule,memory;
  await t.test('008 grants no DDL and records a single ledger entry',async () => {
    const check = await admin.query(`SELECT (SELECT count(*) FROM schema_migrations WHERE name='008_shared_world_p3.sql')::int AS ledger,
      has_table_privilege('penlia_app','p3_spaces','TRUNCATE') AS truncate,
      has_table_privilege('penlia_app','p3_record_viewers','UPDATE') AS rewrite`);
    assert.deepEqual(check.rows[0],{ledger:1,truncate:false,rewrite:false});
  });
  await t.test('23 joins explicitly and never exposes content or member roster through an invite', async () => {
    assert.equal((await p3(null,'/spaces?kind=relay')).status,401);
    relay = await addSpace(a,'relay','雨停的时候',[b,c]);
    assert.equal(ok(await p3(b,'/spaces?kind=relay')).spaces[0].state,'invited');
    assert.equal((await p3(b,base(relay))).status,404);
    assert.equal((await recs(b,relay)).status,404);
    assert.equal((await membership(outside,relay,'accept')).status,404);
    ok(await membership(b,relay,'accept'));
    assert.deepEqual(ok(await p3(b,base(relay))).members.map((x)=>x.id),[uid(a),uid(b)]);
    assert.equal((await p3(b,base(relay)+'/invite','POST',{memberIds:[uid(c)]})).status,404);
    const events = ok(await api(c,'/p1/events')).events;
    assert.equal(events.filter((event)=>event.kind==='p3_relay_invited'&&event.subjectId===relay).length,1);
    ok(await p3(a,base(relay)+'/invite','POST',{memberIds:[uid(c)]}));
    assert.equal(ok(await api(c,'/p1/events')).events.filter((event)=>event.subjectId===relay).length,1);
  });
  await t.test('23 separate media grants and revocation apply to GET, HEAD, Range, and original P0 media',async () => {
    photo = await upload(b,png,'image/png');
    clip = await upload(b,video,'video/mp4');
    const payload = { kind:'contribution',body:'屋顶听雨',mediaIds:[photo,clip],clientId:randomUUID() };
    assert.equal((await save(b,relay,{...payload,memberIds:[uid(a)]})).status,400);
    const initial = ok(await save(b,relay,payload));
    entry = initial.id;
    assert.equal(ok(await save(b,relay,payload)).id,entry);
    assert.equal((await api(a,picturePath(photo))).status,404);
    assert.equal((await save(a,relay,{...payload,clientId:randomUUID()})).status,404);
    assert.equal((await save(b,relay,{...payload,mediaIds:[photo],clientId:randomUUID()})).status,404);
    assert.equal((await save(b,relay,{...payload,confirmed:true,memberIds:[uid(c)],revision:1},entry)).status,400);
    ok(await save(b,relay,{...payload,confirmed:true,memberIds:[uid(a)],revision:1},entry));
    const visible = (await list(a,relay))[0];
    assert.equal(visible.body,'屋顶听雨');
    assert.equal(visible.memberIds,null);
    assert.deepEqual(visible.media.map((m)=>m.mime),['image/png','video/mp4']);
    const partial = await api(a,picturePath(clip),'GET',undefined,{Range:'bytes=0-31'});
    assert.equal(partial.status,206);
    assert.deepEqual(partial.data,video.subarray(0,32));
    assert.equal((await api(a,picturePath(photo),'HEAD')).status,200);
    assert.equal((await save(a,relay,{...payload,revision:2},entry)).status,409);
    ok(await membership(c,relay,'accept'));
    assert.deepEqual(await list(c,relay),[]);
    assert.equal((await api(c,picturePath(clip),'GET',undefined,{Range:'bytes=0-31'})).status,404);
    ok(await save(b,relay,{...payload,confirmed:true,memberIds:[uid(c)],revision:2},entry));
    const oldRoster = ok(await p3(b,base(relay))).space.rosterVersion;
    assert.equal((await api(a,picturePath(clip),'HEAD')).status,404);
    assert.equal((await api(c,picturePath(clip),'HEAD')).status,200);
    ok(await membership(c,relay,'leave'));
    assert.equal((await recs(c,relay)).status,404);
    ok(await p3(a,base(relay)+'/invite','POST',{memberIds:[uid(c)]}));
    ok(await membership(c,relay,'accept'));
    assert.equal((await api(c,picturePath(clip))).status,404);
    assert.equal((await save(b,relay,{...payload,confirmed:true,memberIds:[uid(c)],revision:3,rosterVersion:oldRoster},entry)).status,409);
    assert.equal((await p3(a,'/records/'+entry,'DELETE')).status,404);
    assert.equal((await api(b,picturePath(photo))).status,200);
  });
  await t.test('25 members arrange scenes and pet; records stay scoped and stale edits fail',async () => {
    world = await addSpace(a,'world','晚风小院',[b,c]);
    assert.equal((await p3(b,base(world)+'/world','PATCH',{action:'greet'})).status,404);
    ok(await membership(b,world,'accept'));
    ok(await membership(c,world,'decline'));
    assert.equal((await membership(c,world,'accept')).status,404);
    ok(await p3(b,base(world)+'/world','PATCH',{ action:'arrange',scene:'coast',petName:'软风',revision:1 }));
    assert.equal(ok(await p3(a,base(world))).space.petName,'软风');
    assert.equal((await p3(a,base(world)+'/world','PATCH',{action:'arrange',scene:'night',petName:'海',revision:1})).status,409);
    const greeted = ok(await p3(b,base(world)+'/world','PATCH',{action:'greet'})).greetedAt;
    assert.equal(ok(await p3(a,base(world))).space.greetedAt,greeted);
    const deco = {kind:'decoration',body:'海风灯',icon:'lamp',x:2,y:1,memberIds:[uid(a)],confirmed:true,clientId:randomUUID()};
    const placed = ok(await save(b,world,deco)).id;
    assert.equal((await list(a,world))[0].x,2);
    assert.equal((await save(b,world,{...deco,x:4})).status,400);
    await assert.rejects(admin.query('UPDATE p3_records SET x=NULL WHERE id=$1',[placed]),{ code:'23514' });
    ok(await save(b,world,{...deco,x:1,revision:1},placed));
    assert.equal((await list(a,world))[0].x,1);
    assert.equal((await save(a,world,{kind:'contribution',body:'不接受接力投稿'})).status,404);
    assert.equal((await recs(c,world)).status,404);
    ok(await p3(b,'/records/'+placed,'DELETE'));
    ok(await p3(b,'/records/'+placed,'DELETE'));
    assert.equal((await save(b,world,deco)).status,409);
    assert.ok(!(await list(a,world)).some((r)=>r.id===placed));
  });
  await t.test('23 and 25 references recheck both ends without copying evidence or broadening access',async () => {
    journal = ok(await api(a,'/p1/collections','POST',{
      kind:'journal',clientId:randomUUID(),title:'生活共同日志',memberIds:[uid(b)],
    })).id;
    coll = ok(await api(a,'/p1/collections','POST',{
      kind:'collaboration',clientId:randomUUID(),title:'共创动态',memberIds:[uid(b)],
    })).id;
    for (const id of [journal,coll]) ok(await api(b,'/p1/collections/'+id+'/membership','POST',{action:'accept'}));
    const link = { kind:'link',confirmed:true,memberIds:[uid(b)] };
    for (const [kind,id] of [['journal',journal],['collaboration',coll],['world',world]]) {
      ok(await save(a,relay,{...link,sourceKind:kind,sourceId:id}));
      assert.ok((await list(b,relay)).some((r)=>r.sourceId===id&&r.sourceTitle));
      const path='/relays-for?kind='+kind+'&id='+id;
      assert.deepEqual(ok(await p3(outside,path)).relays,[]);
      assert.equal(ok(await p3(b,path)).relays[0].id,relay);
    }
    assert.equal((await save(a,relay,{...link,sourceKind:'journal',sourceId:randomUUID()})).status,404);
    assert.equal((await save(c,relay,{...link,memberIds:[],sourceKind:'journal',sourceId:journal})).status,404);
    const souvenir = {kind:'decoration',icon:'frame',x:0,y:1,confirmed:true,memberIds:[uid(b)]};
    for (const kind of ['journal','album']) ok(await save(a,world,{...souvenir,sourceKind:kind,sourceId:journal}));
    assert.equal((await list(b,world)).filter((r)=>r.sourceId===journal).length,2);
    ok(await api(b,'/p1/collections/'+journal+'/membership','POST',{action:'leave'}));
    assert.equal((await list(b,world)).filter((r)=>r.sourceId===journal).length,0);
    assert.ok(!(await list(b,relay)).some((r)=>r.sourceId===journal));
    memory = ok(await api(a,'/p2/memories','POST',{
      title:'那天雨停了',sourceKind:'relay',sourceId:relay,confirmed:true,clientId:randomUUID(),
    })).id;
    assert.equal((await api(outside,'/p2/memories','POST',{
      title:'偷看',sourceKind:'relay',sourceId:relay,confirmed:true,clientId:randomUUID(),
    })).status,404);
    const tripId=ok(await api(a,'/p2/spaces','POST',{kind:'trip',title:'海边小旅行',destination:'海边',
      startDay:'2026-11-20',endDay:'2026-11-21',clientId:randomUUID(),memberIds:[uid(b)]})).id;
    trip=tripId;
    ok(await api(b,'/p2/spaces/'+trip+'/membership','POST',{action:'accept'}));
    await admin.query('UPDATE p2_trips SET completed_at=now() WHERE space_id=$1',[trip]);
    capsule=ok(await api(a,'/p2/spaces','POST',{kind:'capsule',title:'给我们的明天',
      opensAt:new Date(Date.now()+86_400_000).toISOString(),clientId:randomUUID(),memberIds:[uid(b)]})).id;
    ok(await api(b,'/p2/spaces/'+capsule+'/membership','POST',{action:'accept'}));
    assert.equal((await sourceList(a,'capsule')).some((s)=>s.id===capsule),false);
    assert.equal((await save(a,world,{...souvenir,sourceKind:'capsule',sourceId:capsule})).status,404);
    await admin.query("UPDATE p2_capsules SET sealed_at=now()-interval '1 day',opens_at=now()-interval '1 hour' WHERE space_id=$1",[capsule]);
    for (const [kind,id] of [['trip',trip],['capsule',capsule],['memory',memory],['relay',relay]])
      ok(await save(a,world,{...souvenir,sourceKind:kind,sourceId:id}));
    assert.equal((await list(b,world)).some((r)=>r.sourceId===memory),false);
    ok(await api(a,'/p2/memories/'+memory+'/share','POST',{confirmed:true,memberIds:[uid(b)]}));
    assert.ok((await list(b,world)).some((r)=>r.sourceId===memory));
    assert.equal((await recs(outside,world)).status,404);
    await api(a,'/p2/memories/'+memory,'DELETE').then((r)=>ok(r));
    assert.equal((await list(b,world)).some((r)=>r.sourceId===memory),false);
  });
  await t.test('25 and 23 blocking, removal and author withdrawal invalidate content across scopes',async () => {
    ok(await save(b,relay,{kind:'contribution',body:'屋顶听雨',mediaIds:[photo,clip],confirmed:true,memberIds:[uid(c)],revision:3},entry));
    assert.equal((await api(c,picturePath(clip),'HEAD')).status,200);
    ok(await api(a,'/friends/block','POST',{userId:uid(b)}));
    assert.equal((await p3(b,base(world))).status,404);
    assert.equal((await api(c,picturePath(clip))).status,404);
    ok(await api(a,'/friends/unblock','POST',{userId:uid(b)}));
    await admin.query(`UPDATE friendships SET updated_at=now()-interval '2 days'
      WHERE first_user=least($1::uuid,$2::uuid) AND second_user=greatest($1::uuid,$2::uuid)`,[uid(a),uid(b)]);
    await friends(a,b);
    ok(await p3(a,base(relay)+'/invite','POST',{memberIds:[uid(b)]}));
    ok(await membership(b,relay,'accept'));
    assert.equal((await api(c,picturePath(clip))).status,404);
    ok(await membership(a,relay,'remove',b));
    assert.ok(ok(await p3(b,'/own')).records.some((r)=>r.id===entry));
    ok(await p3(b,'/records/'+entry,'DELETE'));
    assert.equal((await api(b,picturePath(photo))).status,404);
    assert.equal((await admin.query('SELECT 1 FROM private_media WHERE id=$1',[photo])).rowCount,0);
  });
  await t.test('008 can replay with existing P2 and relay memories without rewriting data or grants', async () => {
    const samples = [];
    for (const input of [
      { sourceKind:'birthday',eventDay:'2000-10-20',title:'旧类别回忆' },
      { sourceKind:'relay',sourceId:relay,title:'接力回忆' },
    ]) {
      samples.push(ok(await api(a,'/p2/memories','POST',{
        ...input,confirmed:true,clientId:randomUUID(),
      })).id);
    }
    const snapshot = async () => (await admin.query(
      'SELECT id,source_id,source_kind,event_day,title FROM p2_memories WHERE id=ANY($1::uuid[]) ORDER BY id',
      [samples],
    )).rows;
    const before = await snapshot();
    const ddl = await readFile(new URL('../deploy/penlia-p3-dms.sql',import.meta.url),'utf8');
    await admin.query(ddl.replaceAll('penlia_dev','penlia_p3_test'));
    assert.deepEqual(await snapshot(),before);
    assert.equal((await admin.query('SELECT 1 FROM p3_records WHERE id=$1 AND removed_at IS NOT NULL',[entry])).rowCount,1);
  });
});
