import { avatarOf } from './profile.mjs';
import { assertAllowed } from '../p1/enforcement-access.mjs';
import { unusedMedia } from '../p1/collection-access.mjs';
import { randomBytes } from 'node:crypto';
import { cleanText, hash, HttpError, inTransaction, readId } from '../core.mjs';
import { decodeJpeg } from './profile-cover.mjs';
import { pool } from '../db.mjs';
import { areFriends, blocked, idsOf, lockUsers, preferences, related } from './access.mjs';

const avatarColumn = "translate(encode(g.avatar,'base64'),chr(10),'') AS avatar";
export const invitationBrief = `SELECT i.id,g.id AS "groupId",g.name,${avatarColumn},u.name AS inviter,
  (SELECT count(*)::integer FROM chat_group_members m WHERE m.group_id=g.id) AS "memberCount",i.expires_at AS "expiresAt"
  FROM chat_group_invites i JOIN chat_groups g ON g.id=i.group_id JOIN users u ON u.id=i.inviter_id`;
const pendingFor = `i.invitee_id=$1 AND i.status='pending' AND i.expires_at>now()
  AND coalesce((SELECT p.group_policy FROM privacy_preferences p WHERE p.user_id=i.invitee_id),'friends')='friends'
  AND ${related('i.inviter_id', 'i.invitee_id')}`;

export async function listChatGroups(user) {
  const { rows } = await pool.query(
    `SELECT g.id,g.name,${avatarColumn},g.owner_id AS "ownerId",g.members_can_invite AS "membersCanInvite",
    (SELECT count(*)::integer FROM chat_group_members c WHERE c.group_id=g.id) AS "memberCount"
    FROM chat_group_members m JOIN chat_groups g ON m.group_id=g.id WHERE m.user_id=$1
    ORDER BY g.created_at DESC,g.id LIMIT 60`,
    [user],
  );
  return { groups: rows };
}

export async function createGroup(user, body) {
  const name = cleanText(body.name, 32, true);
  const avatar = body.avatar == null ? null : decodeJpeg(body.avatar, 24576);
  const membersCanInvite = body.membersCanInvite === true;
  return inTransaction(pool, async (db) => {
    await assertAllowed(db, user, ['limit_contact','limit_account']);
    await lockUsers(db, user);
    const {
      rows: [count],
    } = await db.query('SELECT count(*)::integer AS n FROM chat_groups WHERE owner_id=$1', [user]);
    if (count.n >= 30) throw new HttpError(400, '创建的群聊已到上限。');
    const {
      rows: [{ id }],
    } = await db.query(
      `INSERT INTO chat_groups(owner_id,name,members_can_invite,avatar)
      VALUES ($1,$2,$3,$4) RETURNING id`,
      [user, name, membersCanInvite, avatar],
    );
    await db.query('INSERT INTO chat_group_members(group_id,user_id) VALUES ($1,$2)', [id, user]);
    return { id };
  });
}

export async function groupMember(db, group, user, lock = false) {
  const {
    rows: [value],
  } = await db.query(
    `SELECT g.id,g.name,${avatarColumn},g.owner_id AS "ownerId",g.members_can_invite AS "membersCanInvite",
    m.joined_at AS "joinedAt" FROM chat_groups g JOIN chat_group_members m ON m.group_id=g.id
    WHERE g.id=$1 AND m.user_id=$2 ${lock ? 'FOR UPDATE OF g, m' : ''}`,
    [group, user],
  );
  if (!value) throw new HttpError(404, '找不到可访问的群聊。');
  return value;
}

export async function groupDetails(user, group) {
  return inTransaction(pool, async (db) => {
    const value = await groupMember(db, group, user, true);
    const members = await db.query(
      `SELECT u.id,u.name,CASE WHEN NOT ${blocked('$2::uuid', 'u.id')} THEN ${avatarOf('u')} END AS avatar FROM chat_group_members m JOIN users u ON u.id=m.user_id
      WHERE m.group_id=$1 ORDER BY m.joined_at,u.id LIMIT 40`,
      [group, user],
    );
    return { group: value, members: members.rows };
  });
}

export async function inviteToGroup(user, group, target) {
  readId(target);
  if (target === user) throw new HttpError(400, '不能邀请自己。');
  return inTransaction(pool, async (db) => {
    await assertAllowed(db, user, ['limit_contact','limit_account']);
    await lockUsers(db, user, target);
    const value = await groupMember(db, group, user, true);
    if (value.ownerId !== user && !value.membersCanInvite) throw new HttpError(403, '此群只允许群主邀请成员。');
    if (!(await areFriends(db, user, target)) || (await preferences(db, target)).groupPolicy !== 'friends') {
      throw new HttpError(403, '该联系人暂时无法接受邀请。');
    }
    const status = await db.query(
      `SELECT EXISTS(SELECT 1 FROM chat_group_members WHERE group_id=$1 AND user_id=$2) AS member,
      (SELECT count(*)::integer FROM chat_group_members WHERE group_id=$1) AS count`,
      [group, target],
    );
    if (status.rows[0].member || status.rows[0].count >= 40) throw new HttpError(409, '该联系人已在群中或群人数已满。');
    const code = 'penlia:group:' + randomBytes(24).toString('base64url');
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO chat_group_invites AS i
      (group_id,inviter_id,invitee_id,code_hash,expires_at) VALUES ($1,$2,$3,$4,now()+interval '48 hours')
      ON CONFLICT (group_id,invitee_id) DO UPDATE SET id=excluded.id,inviter_id=excluded.inviter_id,
        status='pending',code_hash=excluded.code_hash,created_at=now(),expires_at=excluded.expires_at
      WHERE (i.expires_at<=now() AND i.status='pending') OR
        (i.status IN ('declined','accepted') AND i.created_at<=now()-interval '1 day')
      RETURNING id,expires_at AS "expiresAt"`,
      [group, user, target, hash(code)],
    );
    if (!row) throw new HttpError(409, '已有邀请或暂时无法再次邀请。');
    return { ...row, code };
  });
}

export async function getGroupInvites(user, code) {
  if (code !== undefined && (typeof code !== 'string' || !/^penlia:group:[A-Za-z0-9_-]{32}$/.test(code))) {
    return { invitations: [] };
  }
  const values = code ? [user, hash(code)] : [user];
  const { rows } = await pool.query(
    `${invitationBrief} WHERE ${pendingFor}
    ${code ? 'AND i.code_hash=$2' : ''} ORDER BY i.created_at DESC,i.id LIMIT 40`,
    values,
  );
  return { invitations: rows };
}

export async function inviteMembers(user, invite) {
  const { rows } = await pool.query(
    `SELECT u.name FROM chat_group_invites i
     JOIN chat_group_members m ON m.group_id=i.group_id JOIN users u ON u.id=m.user_id
     WHERE ${pendingFor} AND i.id=$2
       AND EXISTS (SELECT 1 FROM chat_group_members sender WHERE sender.group_id=i.group_id AND sender.user_id=i.inviter_id)
       AND NOT ${blocked('$1::uuid', 'u.id')}
     ORDER BY m.joined_at,u.id LIMIT 40`, [user, invite]);
  if (!rows.length) throw new HttpError(404, '此邀请不可用。');
  return { members: rows };
}

export async function updateGroupAvatar(user, group, photo) {
  const avatar = decodeJpeg(photo, 24576);
  const result = await pool.query('UPDATE chat_groups SET avatar=$3 WHERE id=$1 AND owner_id=$2', [group, user, avatar]);
  if (!result.rowCount) throw new HttpError(404, '无法修改该群头像。');
  return {};
}

export async function decideGroupInvite(user, id, accepted) {
  const {
    rows: [candidate],
  } = await pool.query('SELECT inviter_id FROM chat_group_invites WHERE id=$1 AND invitee_id=$2', [id, user]);
  if (!candidate) throw new HttpError(404, '此邀请不可用。');
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user, candidate.inviter_id);
    const {
      rows: [row],
    } = await db.query(
      `${invitationBrief} WHERE ${pendingFor} AND i.id=$2
      AND EXISTS (SELECT 1 FROM chat_group_members m WHERE m.group_id=i.group_id AND m.user_id=i.inviter_id)
      FOR UPDATE OF i,g`,
      [user, id],
    );
    if (!row) throw new HttpError(404, '此邀请不可用。');
    if (accepted && row.memberCount >= 40) throw new HttpError(409, '群人数已满。');
    if (accepted)
      await db.query('INSERT INTO chat_group_members(group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [
        row.groupId,
        user,
      ]);
    await db.query('UPDATE chat_group_invites SET status=$2,code_hash=NULL WHERE id=$1', [
      id,
      accepted ? 'accepted' : 'declined',
    ]);
    return accepted ? { groupId: row.groupId } : {};
  });
}

export async function leaveGroup(user, group) {
  return inTransaction(pool, async (db) => {
    const value = await groupMember(db, group, user, true);
    if (value.ownerId === user) throw new HttpError(409, '群主可解散群聊。');
    await db.query('DELETE FROM chat_group_members WHERE group_id=$1 AND user_id=$2', [group, user]);
    await db.query(
      `UPDATE chat_group_invites SET status='declined',code_hash=NULL
      WHERE group_id=$1 AND inviter_id=$2 AND status='pending'`,
      [group, user],
    );
    return {};
  });
}

export async function deleteGroup(user, group) {
  const result = await pool.query('DELETE FROM chat_groups WHERE id=$1 AND owner_id=$2', [group, user]);
  if (!result.rowCount) throw new HttpError(404, '找不到可解散的群聊。');
  return {};
}

export async function listGroupMessages(user, group, before = null) {
  return inTransaction(pool, async (db) => {
    const value = await groupMember(db, group, user, true);
    const { rows } = await db.query(
      `SELECT c.id,c.sender_id AS "senderId",u.name, CASE WHEN c.recalled_at IS NULL THEN c.content ELSE '' END AS content,
      c.silent,c.sent_at AS "sentAt",(c.recalled_at IS NOT NULL) AS recalled,
      CASE WHEN c.recalled_at IS NULL THEN c.chat_record_id END AS "recordId",
      (SELECT jsonb_build_object('id',quoted.id,'author',qu.name,'body',
        CASE WHEN quoted.recalled_at IS NOT NULL THEN '消息已撤回' WHEN quoted.chat_record_id IS NOT NULL THEN '[聊天记录]' WHEN quoted.content<>'' THEN left(quoted.content,180) ELSE '[附件]' END)
        FROM chat_group_messages quoted JOIN users qu ON qu.id=quoted.sender_id
        WHERE c.recalled_at IS NULL AND quoted.id=c.reply_to AND quoted.group_id=$1 AND quoted.sent_at >= $3 AND NOT ${blocked('$2::uuid','quoted.sender_id')}) AS quote,
      EXISTS(SELECT 1 FROM p1_group_shares s WHERE s.message_id=c.id) AS "noReply",
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'mime',b.mime) ORDER BY b.position)
        FROM private_media b WHERE c.recalled_at IS NULL AND b.group_message_id=c.id),'[]'::jsonb) AS media
      FROM chat_group_messages c JOIN users u ON u.id=c.sender_id WHERE c.group_id=$1 AND c.sent_at >= $3
      AND ($4::uuid IS NULL OR (c.sent_at,c.id)<(SELECT other.sent_at,other.id FROM chat_group_messages other
      WHERE other.id=$4 AND other.group_id=$1)) AND NOT ${blocked('$2::uuid', 'c.sender_id')}
      ORDER BY c.sent_at DESC,c.id DESC LIMIT 41`,
      [group, user, value.joinedAt, before],
    );
    return { messages: rows.slice(0, 40), next: rows.length > 40 ? rows[39].id : null };
  });
}

export async function sendGroupMessage(user, group, body) {
  const clientId = readId(body.clientId);
  const content = cleanText(body.content ?? '', 1000);
  const media = idsOf(body.mediaIds ?? [], 6);
  const record = body.recordId ? readId(body.recordId) : null;
  const reply = body.replyTo ? readId(body.replyTo) : null;
  if (!content && !media.length && !record) throw new HttpError(400, '请填写消息或选择图片、视频。');
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const member = await groupMember(db, group, user, true);
    const {
      rows: [existing],
    } = await db.query(`SELECT id FROM chat_group_messages WHERE group_id=$1 AND sender_id=$2 AND client_id=$3`, [
      group,
      user,
      clientId,
    ]);
    if (existing) return existing;
    await assertAllowed(db, user, ['limit_sending','limit_account']);
    if (record && !(await db.query('SELECT 1 FROM chat_records WHERE id=$1 AND owner_id=$2 AND group_id=$3', [record,user,group])).rowCount)
      throw new HttpError(404, '无法访问这条聊天记录。');
    if (reply && !(await db.query(`SELECT 1 FROM chat_group_messages m WHERE m.id=$1 AND m.group_id=$2 AND m.recalled_at IS NULL AND m.sent_at >= $3
        AND NOT ${blocked('$4::uuid','m.sender_id')}`, [reply,group,member.joinedAt,user])).rowCount)
      throw new HttpError(404, '无法引用这条消息。');
    const uploaded = await db.query(
      `SELECT id,mime FROM private_media b WHERE owner_id=$1 AND id=ANY($2::uuid[])
      AND ${unusedMedia('b')}
      AND created_at>now()-interval '1 day'`,
      [user, media],
    );
    if (uploaded.rowCount !== media.length) throw new HttpError(404, '媒体已失效或不属于当前账号。');
    if (media.length > 1 && uploaded.rows.some((row) => row.mime === 'video/mp4')) throw new HttpError(400, '请单独发送视频。');
    const {
      rows: [saved],
    } = await db.query(
      `INSERT INTO chat_group_messages(group_id,sender_id,client_id,content,silent,reply_to,chat_record_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [group, user, clientId, content, body.silent === true, reply, record],
    );
    await db.query(
      `UPDATE private_media b SET group_message_id=$1,position=media.position
      FROM unnest($2::uuid[]) WITH ORDINALITY AS media(id,position) WHERE b.id=media.id`,
      [saved.id, media],
    );
    if (body.noReply === true) await db.query('INSERT INTO p1_group_shares(message_id) VALUES ($1)', [saved.id]);
    return saved;
  });
}

export async function recallGroupMessage(user, group, message) {
  return inTransaction(pool, async (db) => {
    const member = await groupMember(db, group, user, true);
    const { rows: [line] } = await db.query(`SELECT recalled_at,clock_timestamp()<sent_at+interval '120 seconds' AND
      clock_timestamp()>=sent_at AS eligible FROM chat_group_messages WHERE id=$1 AND group_id=$2
      AND sender_id=$3 AND sent_at>=$4 FOR UPDATE`, [readId(message),group,user,member.joinedAt]);
    if (!line) throw new HttpError(404,'找不到可以撤回的已发送消息。');
    if (!line.recalled_at) {
      if (!line.eligible) throw new HttpError(409, '这条消息已超过两分钟，无法撤回。');
      await db.query('UPDATE chat_group_messages SET recalled_at=clock_timestamp() WHERE id=$1', [message]);
    }
    return {};
  });
}
