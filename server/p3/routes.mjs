import { readId } from '../core.mjs';
import { missing } from '../p1/common.mjs';
import * as records from './records.mjs';
import * as spaces from './spaces.mjs';

export async function p3Routes(method,path,{ user,query,readBody,rateLimit }) {
  if (!path.startsWith('/v1/p3/')) return;
  const match = /^\/v1\/p3\/([a-z-]+)(?:\/([0-9a-f-]{36}))?(?:\/([a-z-]+))?(?:\/([0-9a-f-]{36}))?$/.exec(path);
  if (!match) throw missing();
  const [,resource,rawId,action,rawRecord] = match;
  const id = rawId ? readId(rawId) : null;
  const sub = rawRecord ? readId(rawRecord) : null;
  const actor = user.id;
  if (['POST','PATCH','DELETE'].includes(method))
    await rateLimit('p3:'+resource+':'+actor,60,1);
  if (method==='POST' && resource==='spaces' && (!id || action==='invite'))
    await rateLimit('p3-invite:'+actor,12,60);
  if (resource==='spaces') {
    const key = [method,id?'id':'',action,sub?'sub':''].filter(Boolean).join(':');
    switch (key) {
      case 'GET': return spaces.listSpaces(actor,query);
      case 'POST': return spaces.createSpace(actor,await readBody());
      case 'GET:id': return spaces.getSpace(actor,id);
      case 'POST:id:invite': return spaces.invite(actor,id,await readBody());
      case 'POST:id:membership': return spaces.membership(actor,id,await readBody());
      case 'PATCH:id:world': return spaces.updateWorld(actor,id,await readBody());
      case 'GET:id:records': return records.listRecords(actor,id,query);
      case 'POST:id:records': return records.saveRecord(actor,id,await readBody());
      case 'PATCH:id:records:sub': return records.saveRecord(actor,id,await readBody(),sub);
    }
  }
  if (!action && !sub) {
    if (resource==='records' && id && method==='DELETE') return records.deleteRecord(actor,id);
    if (!id && method==='GET') {
      if (resource==='own') return records.ownRecords(actor,query);
      if (resource==='sources') return records.sources(actor,query);
      if (resource==='relays-for') return records.relatedRelays(actor,query);
    }
  }
  throw missing();
}
