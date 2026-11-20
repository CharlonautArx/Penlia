import { cleanText, hash, HttpError, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import {
  listBlocks,
  listRestrictions,
  listRelationshipGroups,
  manageContact,
  newFriendCode,
  preferences,
  profile,
  savePriority,
  saveRelationshipGroup,
  searchPerson,
  updatePreferences,
} from './access.mjs';
import {
  createGroup,
  decideGroupInvite,
  deleteGroup,
  getGroupInvites,
  groupDetails,
  inviteToGroup,
  leaveGroup,
  listChatGroups,
  listGroupMessages,
  sendGroupMessage,
} from './groups.mjs';
import {
  deleteMoment,
  discardMedia,
  getMedia,
  getMoment,
  listMoments,
  postMedia,
  publishMoment,
  updateMoment,
} from './moments.mjs';

const missing = () => new HttpError(404, '找不到可操作的记录。');
const result = (body, statusCode = 200) => ({ statusCode, body });

export async function p0Routes(route, { user, tokenHash, query, headers, sourceIp, readBody, rateLimit }) {
  const id = user.id;
  switch (route) {
    case 'GET /v1/privacy': {
      const alerts = await pool.query(
        'SELECT other_id AS id FROM priority_contacts WHERE user_id=$1 ORDER BY other_id',
        [id],
      );
      return result({ settings: await preferences(pool, id), priorityIds: alerts.rows.map((row) => row.id) });
    }
    case 'PATCH /v1/privacy':
      return result({ settings: await updatePreferences(id, await readBody()) });
    case 'PUT /v1/privacy/priority':
      return result(await savePriority(id, (await readBody()).ids));
    case 'GET /v1/privacy/blocks':
      return result(await listBlocks(id));
    case 'GET /v1/privacy/restricted':
      return result(await listRestrictions(id));
    case 'GET /v1/relationship-groups':
      return result(await listRelationshipGroups(id));
    case 'POST /v1/relationship-groups':
      return result({ group: await saveRelationshipGroup(id, await readBody()) }, 201);
    case 'POST /v1/people/phone':
      await rateLimit('p0-phone-user:' + id, 5, 60);
      await rateLimit('p0-phone-net:' + sourceIp, 24, 60);
      return result(await searchPerson(id, (await readBody()).phone, 'phone', process.env.PENLIA_PHONE_LOOKUP_SECRET));
    case 'POST /v1/people/code':
      await rateLimit('p0-code-user:' + id, 20, 60);
      await rateLimit('p0-code-net:' + sourceIp, 80, 60);
      return result(await searchPerson(id, (await readBody()).code, 'code'));
    case 'POST /v1/friends/code':
      await rateLimit('p0-code-create:' + id, 12, 60);
      return result(await newFriendCode(id));
    case 'POST /v1/friends/remove':
    case 'POST /v1/friends/block':
    case 'POST /v1/friends/unblock':
    case 'POST /v1/friends/restrict':
    case 'POST /v1/friends/unrestrict':
      await rateLimit('p0-friend-change:' + id, 30, 60);
      return result(await manageContact(id, (await readBody()).userId, route.split('/').at(-1)));
    case 'GET /v1/groups':
      return result(await listChatGroups(id));
    case 'POST /v1/groups':
      await rateLimit('p0-group-create:' + id, 10, 60);
      return result(await createGroup(id, await readBody()), 201);
    case 'GET /v1/group-invites':
      return result(await getGroupInvites(id));
    case 'POST /v1/group-invites/resolve':
      await rateLimit('p0-group-code:' + id, 20, 60);
      return result(await getGroupInvites(id, (await readBody()).code ?? ''));
    case 'POST /v1/group-invites/accept':
    case 'POST /v1/group-invites/decline':
      return result(await decideGroupInvite(id, readId((await readBody()).id), route.endsWith('/accept')));
    case 'GET /v1/moments':
      return result(await listMoments(id, query));
    case 'POST /v1/moments':
      await rateLimit('p0-moments:' + id, 25, 60);
      return result(await publishMoment(id, await readBody()), 201);
    case 'POST /v1/moment-media':
      await rateLimit('p0-upload-user:' + id, 25, 60);
      await rateLimit('p0-upload-net:' + sourceIp, 100, 60);
      return result({ media: await postMedia(id, await readBody()) }, 201);
    case 'GET /v1/privacy/devices': {
      const { rows } = await pool.query(
        `SELECT encode(sha256(convert_to('device:'||s.token_hash,'UTF8')),'hex') AS id,
        coalesce(d.nickname,'朋聊设备') AS nickname,d.first_seen AS "firstSeen",
        s.expires_at AS "expiresAt",s.token_hash=$2 AS current FROM sessions s LEFT JOIN p0_devices d USING(token_hash)
        WHERE s.user_id=$1 AND s.expires_at>now() ORDER BY current DESC,s.expires_at DESC LIMIT 100`,
        [id, tokenHash],
      );
      return result({ devices: rows });
    }
    case 'POST /v1/privacy/devices/label':
      await pool.query(`INSERT INTO p0_devices(token_hash,nickname) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
        tokenHash,
        cleanText((await readBody()).nickname, 40, true),
      ]);
      return result({});
    case 'POST /v1/privacy/devices/revoke': {
      const { deviceId } = await readBody();
      if (typeof deviceId !== 'string' || !/^[0-9a-f]{64}$/.test(deviceId) || deviceId === hash('device:' + tokenHash))
        throw missing();
      const revoked = await pool.query(
        `DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$3
        AND encode(sha256(convert_to('device:'||token_hash,'UTF8')),'hex')=$2`,
        [id, deviceId, tokenHash],
      );
      if (!revoked.rowCount) throw missing();
      return result({});
    }
    case 'GET /v1/privacy/export': {
      await rateLimit('p0-export:' + id, 12, 60);
      const [settings, ownPosts, outgoing, relations] = await Promise.all([
        preferences(pool, id),
        listMoments(
          id,
          new URLSearchParams({ author: id, ...(query.has('before') ? { before: query.get('before') } : {}) }),
        ),
        pool.query(
          `SELECT g.name,m.content,m.silent,m.sent_at AS "sentAt" FROM chat_group_messages m
          JOIN chat_group_members c ON c.group_id=m.group_id AND c.user_id=$1 JOIN chat_groups g ON g.id=m.group_id
          WHERE m.sender_id=$1 AND m.sent_at>=c.joined_at ORDER BY m.sent_at DESC,m.id LIMIT 100`,
          [id],
        ),
        pool.query('SELECT label,circle FROM relationship_groups WHERE owner_id=$1 ORDER BY label LIMIT 30', [id]),
      ]);
      return result({
        generatedAt: new Date().toISOString(),
        profile: user,
        settings,
        relationshipGroups: relations.rows,
        moments: ownPosts.moments.map(({ memberIds, ...post }) => post),
        nextMoment: ownPosts.next,
        latestOwnGroupMessages: outgoing.rows,
      });
    }
    case 'GET /v1/privacy/requests': {
      const { rows } = await pool.query(
        `SELECT id,kind,status,requested_at AS "requestedAt"
        FROM privacy_requests WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 25`,
        [id],
      );
      return result({ requests: rows });
    }
    case 'POST /v1/privacy/requests': {
      const { kind } = await readBody();
      if (!['export', 'delete_account'].includes(kind)) throw new HttpError(400, '请选择申请类型。');
      await rateLimit('p0-privacy-requests:' + id, 8, 60);
      const { rows } = await pool.query(
        `INSERT INTO privacy_requests(user_id,kind) VALUES ($1,$2)
        ON CONFLICT (user_id,kind) WHERE status IN ('requested','processing') DO NOTHING RETURNING id`,
        [id, kind],
      );
      return result({ received: true, id: rows[0]?.id }, 202);
    }
  }

  const match =
    /^(GET|POST|PUT|PATCH|DELETE|HEAD) \/v1\/(people|relationship-groups|groups|moments|moment-media)\/([0-9a-f-]{36})(?:\/(invites|messages|leave))?$/.exec(
      route,
    );
  if (!match) return undefined;
  const [, method, collection, rawId, action] = match;
  const item = readId(rawId);
  switch (collection) {
    case 'people':
      if (!action && method === 'GET') return result(await profile(id, item));
      break;
    case 'relationship-groups':
      if (!action && method === 'PUT')
        return result({ group: await saveRelationshipGroup(id, await readBody(), item) });
      if (!action && method === 'DELETE') {
        const deleted = await pool.query('DELETE FROM relationship_groups WHERE id=$1 AND owner_id=$2 AND NOT circle', [
          item,
          id,
        ]);
        if (!deleted.rowCount) throw missing();
        return result({});
      }
      break;
    case 'groups':
      if (!action && method === 'GET') return result(await groupDetails(id, item));
      if (!action && method === 'DELETE') return result(await deleteGroup(id, item));
      if (action === 'invites' && method === 'POST') {
        await rateLimit('p0-group-invite:' + id, 20, 60);
        await rateLimit('p0-group-invite-net:' + sourceIp, 100, 60);
        const target = readId((await readBody()).userId);
        await rateLimit('p0-group-invite-target:' + target, 25, 60);
        return result(await inviteToGroup(id, item, target), 201);
      }
      if (action === 'messages' && method === 'GET')
        return result(
          await listGroupMessages(id, item, query.get('before') === null ? null : readId(query.get('before'))),
        );
      if (action === 'messages' && method === 'POST') {
        await rateLimit('p0-group-send:' + id, 90, 1);
        return result(await sendGroupMessage(id, item, await readBody()), 201);
      }
      if (action === 'leave' && method === 'POST') return result(await leaveGroup(id, item));
      break;
    case 'moments':
      if (!action && method === 'GET') return result(await getMoment(id, item));
      if (!action && method === 'PATCH') return result(await updateMoment(id, item, await readBody()));
      if (!action && method === 'DELETE') return result(await deleteMoment(id, item));
      break;
    case 'moment-media':
      if (!action && ['GET', 'HEAD'].includes(method)) return getMedia(id, item, headers.range, method === 'HEAD');
      if (!action && method === 'DELETE') return result(await discardMedia(id, item));
      break;
  }
  return undefined;
}
