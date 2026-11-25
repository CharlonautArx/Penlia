import { createCipheriv, createDecipheriv, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { cleanText, hash, HttpError, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, idsOf, lockUsers } from '../p0/access.mjs';
import { invalidMediaRange, mediaResponse, parseMediaRange } from '../p0/moments.mjs';
import { decodeJpeg } from '../p0/profile-cover.mjs';
import { groupMember } from '../p0/groups.mjs';
import { choose, conflict, invalid, missing } from './common.mjs';

function evidenceKey() {
  const value = process.env.PENLIA_EVIDENCE_KEY;
  const key =
    typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? Buffer.from(value, 'base64url') : null;
  if (key?.length !== 32) throw new HttpError(503, '举报证据存储尚未配置。');
  return key;
}

function sealBytes(id, bytes) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', evidenceKey(), iv);
  cipher.setAAD(Buffer.from('penlia-evidence-v1:' + id));
  const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), data]);
}

function unsealBytes(id, bytes) {
  if (bytes[0] !== 1 || bytes.length < 30) throw new Error('Unsupported evidence format');
  const decoder = createDecipheriv('aes-256-gcm', evidenceKey(), bytes.subarray(1, 13));
  decoder.setAAD(Buffer.from('penlia-evidence-v1:' + id));
  decoder.setAuthTag(bytes.subarray(13, 29));
  return Buffer.concat([decoder.update(bytes.subarray(29)), decoder.final()]);
}

export const reportPhotoLimit = 384 * 1024;
export const reportBodyLimit = reportPhotoLimit * 4 + 65536;
const kinds = ['boundary','sexual','rumor','advertising','fraud','violence','illegal','self_harm','spam','harassment','threat'];

function reportPhotos(input = []) {
  if (!Array.isArray(input) || input.length > 3) throw invalid('最多添加三张举报配图。');
  return input.map((photo) => {
    const data = decodeJpeg(photo, reportPhotoLimit);
    return { id: randomUUID(), mime: 'image/jpeg', data, sha256: hash(data) };
  });
}

const seal = (id, snapshot) => sealBytes(id, Buffer.from(JSON.stringify(snapshot)));
const unseal = (id, bytes) => JSON.parse(unsealBytes(id, bytes).toString('utf8'));

async function role(db, actor) {
  if (!(await db.query('SELECT 1 FROM p1_reviewers WHERE user_id=$1 AND enabled', [actor])).rowCount)
    throw missing();
}

async function reviewable(db, actor, id, lock = false) {
  await role(db, actor);
  const {
    rows: [report],
  } = await db.query(
    `SELECT * FROM p1_reports WHERE id=$1 AND reporter_id<>$2 AND subject_id<>$2 ${lock ? 'FOR UPDATE' : ''}`,
    [id, actor],
  );
  if (!report) throw missing();
  return report;
}

function audit(db, id, actor, action, note) {
  return db.query('INSERT INTO p1_review_audit(report_id,actor_id,action,details) VALUES($1,$2,$3,$4)', [
    id,
    actor,
    action,
    note ? seal(id, { note }) : null,
  ]);
}

async function groupEvidence(db, reporter, body) {
  const group = readId(body.groupId);
  const anchor = readId(body.anchorId);
  const ids = idsOf(body.messageIds, 5);
  if (!ids.includes(anchor)) throw invalid('请包含被举报消息。');
  const membership = await groupMember(db, group, reporter, true);
  const { rows } = await db.query(
    `SELECT m.id,m.sender_id AS "senderId",m.content,m.sent_at AS "sentAt",u.name AS author
    FROM chat_group_messages m JOIN users u ON u.id=m.sender_id WHERE m.group_id=$1 AND m.id=ANY($2::uuid[]) AND m.sent_at>=$3 AND m.recalled_at IS NULL
    AND NOT ${blocked('$4::uuid', 'm.sender_id')} ORDER BY m.sent_at,m.id`,
    [group, ids, membership.joinedAt, reporter],
  );
  if (rows.length !== ids.length) throw missing();
  const {
    rows: [usage],
  } = await db.query(
    `SELECT coalesce(sum(octet_length(data)),0)::int AS bytes
    FROM private_media WHERE group_message_id=ANY($1::uuid[])`,
    [ids],
  );
  if (usage.bytes > 24 * 1024 * 1024)
    throw new HttpError(413, '所选消息的证据附件超过 24 MB，请减少上下文消息。');
  const { rows: media } = await db.query(
    `SELECT id,mime,data,group_message_id AS message_id FROM private_media
    WHERE group_message_id=ANY($1::uuid[]) ORDER BY group_message_id,position,id`,
    [ids],
  );
  for (const attachment of media) attachment.sha256 = hash(attachment.data);
  for (const message of rows) {
    message.attachments = media
      .filter((attachment) => attachment.message_id === message.id)
      .map(({ id, mime, data, sha256 }) => ({ id, mime, bytes: data.length, sha256 }));
    message.attachmentCount = message.attachments.length;
  }
  return {
    subject: rows.find((line) => line.id === anchor).senderId,
    provenance: 'group',
    media,
    snapshot: { groupId: group, anchorId: anchor, messages: rows },
  };
}

function proofMessageId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(id)) throw invalid('消息标识无效。');
  return id;
}

async function privateEvidence(db, reporter, body) {
  const peer = readId(body.peerId);
  if (
    !(
      await db.query(
        `SELECT 1 FROM friendships WHERE first_user=least($1::uuid,$2::uuid)
    AND second_user=greatest($1::uuid,$2::uuid) AND status='accepted' AND NOT ${blocked('$1::uuid', '$2::uuid')}`,
        [reporter, peer],
      )
    ).rowCount
  )
    throw missing();
  const anchor = proofMessageId(body.anchorId);
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 5)
    throw invalid('请选择 1 至 5 条消息。');
  const unique = new Set();
  const messages = body.messages.map((line) => {
    if (!line || typeof line !== 'object') throw invalid();
    const id = proofMessageId(line.id);
    if (unique.has(id)) throw invalid();
    unique.add(id);
    const timestamp = typeof line.sentAt === 'string' && line.sentAt.length <= 30 ? Date.parse(line.sentAt) : NaN;
    return { id, content: cleanText(line.content, 1000), mine: line.mine === true,
      ...(Number.isFinite(timestamp) ? { sentAt: new Date(timestamp).toISOString() } : {}) };
  });
  if (!messages.some((message) => message.id === anchor && !message.mine))
    throw invalid('请选择对方发送的消息作为举报对象。');
  return { subject: peer, provenance: 'private_pending', snapshot: { anchorId: anchor, messages } };
}

export async function submitReport(reporter, body) {
  const clientId = readId(body.clientId);
  const kind = choose(body.kind, kinds);
  const photos = reportPhotos(body.photos);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, reporter);
    const {
      rows: [old],
    } = await db.query('SELECT id FROM p1_reports WHERE reporter_id=$1 AND client_id=$2', [
      reporter,
      clientId,
    ]);
    if (old) return old;
    const evidence = body.groupId
      ? await groupEvidence(db, reporter, body)
      : await privateEvidence(db, reporter, body);
    if (evidence.subject === reporter) throw invalid('请选择他人发送的消息。');
    const {
      rows: [quantity],
    } = await db.query(
      `SELECT count(*)::int n FROM p1_reports WHERE reporter_id=$1 AND subject_id=$2
      AND submitted_at>now()-interval '1 day'`,
      [reporter, evidence.subject],
    );
    if (quantity.n >= 3) throw new HttpError(429, '该联系人今日的举报提交已达上限。');
    const {
      rows: [row],
    } = await db.query('SELECT gen_random_uuid() AS id,(SELECT name FROM users WHERE id=$1) AS subject', [evidence.subject]);
    const sealed = seal(row.id, {
      ...evidence.snapshot,
      subject: row.subject,
      supplemental: photos.map(({ id, mime }) => ({ id, mime })),
      explanation: cleanText(body.explanation ?? '', 500),
      allowsAssistance: body.allowAssistance === true,
    });
    await db.query(
      `INSERT INTO p1_reports(id,reporter_id,subject_id,client_id,kind,provenance,evidence)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, reporter, evidence.subject, clientId, kind, evidence.provenance, sealed],
    );
    for (const attachment of [...(evidence.media ?? []), ...photos]) {
      await db.query(
        `INSERT INTO p1_report_media(report_id,media_id,mime,bytes,sha256,sealed_data)
        VALUES($1,$2,$3,$4,$5,$6)`,
        [
          row.id,
          attachment.id,
          attachment.mime,
          attachment.data.length,
          attachment.sha256,
          sealBytes(row.id + ':' + attachment.id, attachment.data),
        ],
      );
    }
    return { id: row.id };
  });
}

export async function hideReportHistory(user, body) {
  const all = body.all === true;
  const ids = all ? [] : idsOf(body.ids, 100);
  if (!all && !ids.length) throw invalid('请选择要删除的举报记录。');
  await pool.query(`INSERT INTO p1_report_history_hidden(report_id)
    SELECT r.id FROM p1_reports r WHERE r.reporter_id=$1 AND r.kind='boundary' AND ($2::boolean OR r.id=ANY($3::uuid[]))
    ON CONFLICT DO NOTHING`, [user, all, ids]);
  return {};
}

export async function boundaryOverview(user, before = null) {
  if (before) readId(before);
  const [reports, actions, reviewer] = await Promise.all([
    pool.query(
      `SELECT r.id,r.kind,r.submitted_at AS "submittedAt",CASE WHEN r.status='pending' THEN 'pending' ELSE 'closed' END status
      FROM p1_reports r WHERE r.reporter_id=$1 AND r.kind='boundary' AND NOT EXISTS(SELECT 1 FROM p1_report_history_hidden h WHERE h.report_id=r.id)
      AND ($2::uuid IS NULL OR (r.submitted_at,r.id)<(SELECT submitted_at,id FROM p1_reports WHERE reporter_id=$1 AND kind='boundary' AND id=$2))
      ORDER BY r.submitted_at DESC,r.id DESC LIMIT 51`,
      [user, before],
    ),
    pool.query(
      `SELECT e.id,e.kind,e.reason,e.expires_at AS "expiresAt",e.overturned_at IS NOT NULL AS overturned,
      a.status AS appeal,a.resolution FROM p1_enforcement e LEFT JOIN p1_appeals a ON a.enforcement_id=e.id
      WHERE e.subject_id=$1 AND e.applied_at IS NOT NULL ORDER BY e.applied_at DESC LIMIT 50`,
      [user],
    ),
    pool.query('SELECT 1 FROM p1_reviewers WHERE user_id=$1 AND enabled', [user]),
  ]);
  return { reports: reports.rows.slice(0,50), next: reports.rows[50] ? reports.rows[49].id : null, actions: actions.rows, canReview: !!reviewer.rowCount };
}

export async function reviewQueue(actor) {
  await role(pool, actor);
  const { rows } = await pool.query(
    `SELECT r.id,r.kind,r.provenance,r.status,e.kind AS enforcement,a.status AS appeal
    FROM p1_reports r LEFT JOIN p1_enforcement e ON e.report_id=r.id LEFT JOIN p1_appeals a ON a.enforcement_id=e.id
    WHERE r.reporter_id<>$1 AND r.subject_id<>$1 AND (r.status='pending' OR (a.status='pending' AND e.reviewer_id IS DISTINCT FROM $1))
    ORDER BY CASE r.kind WHEN 'threat' THEN 0 WHEN 'harassment' THEN 1 ELSE 2 END,r.submitted_at,r.id LIMIT 60`,
    [actor],
  );
  return { queue: rows };
}

export async function readEvidence(actor, id) {
  return inTransaction(pool, async (db) => {
    const report = await reviewable(db, actor, id, true);
    const evidence = unseal(id, report.evidence);
    await audit(db, id, actor, 'evidence_accessed');
    return { kind: report.kind, provenance: report.provenance, status: report.status, evidence };
  });
}

export async function getReviewAudit(actor, id) {
  await reviewable(pool, actor, id);
  const { rows } = await pool.query(
    'SELECT action,recorded_at AS "recordedAt" FROM p1_review_audit WHERE report_id=$1 ORDER BY recorded_at,id LIMIT 100',
    [id],
  );
  return { audit: rows };
}

// A provider must retrieve the selected original messages for these participants from authenticated history.
// Client snapshots remain reviewable but cannot support penalties until the configured provider verifies them.
export async function verifyPrivateReport(actor, id, adapter) {
  if (typeof adapter?.verifyPrivate !== 'function') throw new HttpError(503, '原始私聊证据核验尚不可用。');
  const initial = await reviewable(pool, actor, id);
  if (initial.provenance !== 'private_pending' || initial.status !== 'pending') throw conflict();
  const snapshot = unseal(id, initial.evidence);
  const result = await adapter.verifyPrivate({
    reporterId: initial.reporter_id,
    subjectId: initial.subject_id,
    anchorId: snapshot.anchorId,
    messageIds: snapshot.messages.map((message) => message.id),
    signal: AbortSignal.timeout(4000),
  });
  if (
    result?.verified !== true ||
    result.anchorId !== snapshot.anchorId ||
    !Array.isArray(result.messages) ||
    result.messages.length !== snapshot.messages.length ||
    !snapshot.messages.every((message) => result.messages.some((verified) => verified.id === message.id)) ||
    !result.messages.some(
      (message) => message.id === snapshot.anchorId && message.senderId === initial.subject_id,
    )
  )
    throw conflict('无法核实原始消息。');
  const verified = snapshot.messages.map((submitted) => {
    const message = result.messages.find(({ id }) => id === submitted.id);
    if (![initial.subject_id, initial.reporter_id].includes(message.senderId))
      throw conflict('无法核实原始消息。');
    return {
      id: proofMessageId(message.id),
      senderId: message.senderId,
      sentAt: submitted.sentAt,
      content: cleanText(message.content ?? '', 1000),
    };
  });
  return inTransaction(pool, async (db) => {
    const report = await reviewable(db, actor, id, true);
    if (report.status !== 'pending' || report.provenance !== 'private_pending') throw conflict();
    await db.query("UPDATE p1_reports SET provenance='private_verified',evidence=$2 WHERE id=$1", [
      id,
      seal(id, { ...snapshot, messages: verified }),
    ]);
    await audit(db, id, actor, 'private_verified');
    return {};
  });
}

export async function decideReport(actor, id, body) {
  const decision = choose(body.decision, ['dismiss', 'confirm']);
  return inTransaction(pool, async (db) => {
    const report = await reviewable(db, actor, id, true);
    if (report.status !== 'pending') throw conflict('该工单已经处理。');
    if (decision === 'dismiss') {
      await db.query("UPDATE p1_reports SET status='dismissed',decided_at=now() WHERE id=$1", [id]);
      await audit(db, id, actor, 'dismissed');
      return {};
    }
    if (report.provenance === 'private_pending') throw conflict('请先核实原始私聊消息。');
    const kind = choose(body.penalty, ['warning', 'limit_contact', 'limit_sending', 'limit_account']);
    const note = cleanText(body.reason, 300, true);
    const reason = {
      boundary: '审核确认存在工作任务或催办类信息骚扰。',
      harassment: '审核确认存在骚扰行为。',
      threat: '审核确认存在严重威胁行为。',
    }[report.kind] ?? '审核确认聊天内容违反朋聊社区规则。';
    const duration = body.durationHours;
    if (!Number.isInteger(duration) || duration < 1 || duration > 720)
      throw invalid('处置时长须为 1 至 720 小时。');
    if (report.kind === 'boundary' && (['limit_account'].includes(kind) || duration > 168))
      throw invalid('普通生活边界案件仅支持适度处置。');
    const urgent = report.kind === 'threat' || body.urgent === true;
    if (urgent && report.kind === 'boundary') throw invalid('普通边界案件需使用保护窗口。');
    if (
      kind === 'limit_account' &&
      !(
        await db.query(
          `SELECT 1 FROM p1_enforcement e JOIN p1_reports previous ON previous.id=e.report_id
      WHERE e.subject_id=$1 AND e.applied_at IS NOT NULL AND e.overturned_at IS NULL
      AND previous.kind IN ('harassment','threat') LIMIT 1`,
          [report.subject_id],
        )
      ).rowCount
    )
      throw invalid('账号级限制需要已生效的严重违规记录。');
    const min = Number(process.env.PENLIA_MODERATION_DELAY_MIN_SECONDS ?? 86400);
    const max = Number(process.env.PENLIA_MODERATION_DELAY_MAX_SECONDS ?? 604800);
    if (
      !urgent &&
      (!Number.isInteger(min) || !Number.isInteger(max) || min < 86400 || max > 604800 || max <= min)
    )
      throw new HttpError(503, '审核保护窗口配置无效。');
    const seconds = urgent ? 0 : randomInt(min, max + 1);
    await db.query(
      `WITH confirmed AS (
        UPDATE p1_reports SET status='confirmed',decided_at=clock_timestamp() WHERE id=$1 RETURNING decided_at
      )
      INSERT INTO p1_enforcement(report_id,subject_id,reviewer_id,kind,reason,duration_hours,execute_at,applied_at,expires_at)
      SELECT $1,$2,$3,$4,$5,$6,decided_at+make_interval(secs=>$7),
        CASE WHEN $8 THEN decided_at END,CASE WHEN $8 THEN decided_at+make_interval(hours=>$6) END FROM confirmed`,
      [id, report.subject_id, actor, kind, reason, duration, seconds, urgent],
    );
    await audit(db, id, actor, urgent ? 'urgent_applied' : 'confirmed_and_scheduled', note);
    return {};
  });
}

export async function runEnforcement(now = new Date()) {
  return inTransaction(pool, async (db) => {
    const { rows } = await db.query(
      `WITH due AS (SELECT id FROM p1_enforcement WHERE applied_at IS NULL AND overturned_at IS NULL
      AND execute_at<=$1 ORDER BY execute_at,id LIMIT 50 FOR UPDATE SKIP LOCKED)
      UPDATE p1_enforcement e SET applied_at=$1,expires_at=$1::timestamptz+make_interval(hours=>duration_hours)
      FROM due WHERE e.id=due.id RETURNING report_id`,
      [now],
    );
    for (const row of rows) await audit(db, row.report_id, null, 'scheduled_applied');
    return { applied: rows.length };
  });
}

export function workerAuthorized(authorization) {
  const secret = process.env.PENLIA_MODERATION_JOB_TOKEN;
  return (
    !!secret &&
    secret.length >= 32 &&
    timingSafeEqual(Buffer.from(hash(authorization ?? '')), Buffer.from(hash('Bearer ' + secret)))
  );
}

export async function submitAppeal(user, id, body) {
  const explanation = cleanText(body.explanation, 1000, true);
  return inTransaction(pool, async (db) => {
    const {
      rows: [action],
    } = await db.query(
      `SELECT report_id FROM p1_enforcement
      WHERE id=$1 AND subject_id=$2 AND applied_at IS NOT NULL FOR UPDATE`,
      [id, user],
    );
    if (!action) throw missing();
    const saved = await db.query(
      'INSERT INTO p1_appeals(enforcement_id,explanation) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [id, seal(action.report_id, { explanation })],
    );
    if (saved.rowCount) await audit(db, action.report_id, user, 'appealed');
    return {};
  });
}

export async function inspectAppeal(actor, id) {
  return inTransaction(pool, async (db) => {
    await reviewable(db, actor, id);
    const {
      rows: [row],
    } = await db.query(
      `SELECT e.kind,e.reason,a.explanation,a.status FROM p1_enforcement e
      JOIN p1_appeals a ON a.enforcement_id=e.id WHERE e.report_id=$1 AND e.reviewer_id IS DISTINCT FROM $2`,
      [id, actor],
    );
    if (!row) throw missing();
    await audit(db, id, actor, 'appeal_accessed');
    return { appeal: { ...row, explanation: unseal(id, row.explanation).explanation } };
  });
}

export async function finishAppeal(actor, id, body) {
  const result = choose(body.decision, ['upheld', 'overturned']);
  const note = cleanText(body.resolution, 300, true);
  const resolution = result === 'upheld' ? '独立复核后维持处置。' : '独立复核已撤销处置。';
  return inTransaction(pool, async (db) => {
    await reviewable(db, actor, id, true);
    const {
      rows: [action],
    } = await db.query(
      'SELECT id FROM p1_enforcement WHERE report_id=$1 AND reviewer_id IS DISTINCT FROM $2 FOR UPDATE',
      [id, actor],
    );
    if (!action) throw missing();
    const saved = await db.query(
      "UPDATE p1_appeals SET status=$2,resolution=$3 WHERE enforcement_id=$1 AND status='pending'",
      [action.id, result, resolution],
    );
    if (!saved.rowCount) throw conflict();
    if (result === 'overturned')
      await db.query('UPDATE p1_enforcement SET overturned_at=now() WHERE id=$1', [action.id]);
    await audit(db, id, actor, 'appeal_' + result, note);
    return {};
  });
}

async function reporterRecord(db, actor, id) {
  const { rows: [report] } = await db.query(
    `SELECT r.*,u.name AS subject_name FROM p1_reports r JOIN users u ON u.id=r.subject_id
     WHERE r.id=$1 AND r.reporter_id=$2 AND r.kind='boundary'
       AND NOT EXISTS(SELECT 1 FROM p1_report_history_hidden WHERE report_id=r.id)`, [id, actor]);
  if (!report) throw missing();
  return report;
}

export async function reportHistoryDetail(actor, id) {
  const report = await reporterRecord(pool, actor, id);
  const evidence = unseal(id, report.evidence);
  const target = evidence.subject ?? report.subject_name;
  return {
    target, status: report.status, submittedAt: report.submitted_at,
    explanation: evidence.explanation, photos: evidence.supplemental ?? [],
    lines: evidence.messages.map((line) => ({
      id: line.id, content: line.content, sentAt: line.sentAt,
      author: line.mine === true || line.senderId === actor ? '我' : line.author ?? target,
      attachments: line.attachmentCount ?? 0,
    })),
  };
}

export async function readReportMedia(actor, id, mediaId, range, head, own = false) {
  return inTransaction(pool, async (db) => {
    if (own) {
      const report = await reporterRecord(db, actor, id);
      if (!unseal(id, report.evidence).supplemental?.some((photo) => photo.id === mediaId)) throw missing();
    } else {
      await reviewable(db, actor, id);
    }
    const {
      rows: [value],
    } = await db.query(
      `SELECT mime,bytes,sha256${head ? '' : ',sealed_data'}
      FROM p1_report_media WHERE report_id=$1 AND media_id=$2`,
      [id, mediaId],
    );
    if (!value) throw missing();
    const bounds = parseMediaRange(range, value.bytes);
    if (!bounds) return invalidMediaRange(value.bytes);
    let binary = Buffer.alloc(0);
    if (!head) {
      let original;
      try {
        original = unsealBytes(id + ':' + mediaId, value.sealed_data);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw conflict('证据校验失败。');
      }
      if (original.length !== value.bytes || hash(original) !== value.sha256)
        throw conflict('证据校验失败。');
      binary = original.subarray(bounds.first, bounds.last + 1);
      if (!own) await audit(db, id, actor, 'evidence_media_accessed');
    }
    const response = mediaResponse(value.mime, value.bytes, range, bounds, binary);
    response.headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
    return response;
  });
}

function redactText(text, ranges) {
  if (!Array.isArray(ranges) || ranges.length > 30) throw invalid('请核对脱敏区间。');
  const characters = Array.from(text);
  let cursor = 0;
  let safe = '';
  for (const range of ranges) {
    if (
      !range ||
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < cursor ||
      range.end <= range.start ||
      range.end > characters.length
    )
      throw invalid('请核对脱敏区间。');
    safe += characters.slice(cursor, range.start).join('') + '[已遮盖]';
    cursor = range.end;
  }
  safe += characters.slice(cursor).join('');
  return safe.replace(
    /https?:\/\/[^\s，。；、！？]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?86[ \-]?)?1[3-9]\d{9}|[0-9]{6,}|@[\p{L}\p{N}_-]+/giu,
    '[已遮盖]',
  );
}

// Only an explicitly installed advisor can receive the reviewer's redacted evidence selection.
export async function suggestReview(actor, id, adapter, body) {
  const report = await reviewable(pool, actor, id);
  if (typeof adapter?.suggest !== 'function') throw new HttpError(503, '辅助审核尚未配置。');
  const source = unseal(id, report.evidence);
  if (source.allowsAssistance !== true || report.provenance === 'private_pending')
    throw new HttpError(403, '该工单缺少辅助审核授权或已核验证据。');
  if (
    body.redactionConfirmed !== true ||
    !Array.isArray(body.selection) ||
    !body.selection.length ||
    body.selection.length > 5
  )
    throw invalid('请先选取证据片段并确认必要脱敏。');
  const unique = new Set();
  const messages = body.selection.map((slice) => {
    if (!slice || typeof slice !== 'object') throw invalid();
    const line = source.messages.find((candidate) => candidate.id === slice.id);
    if (!line || unique.has(line.id)) throw invalid('只能选取本工单已提交的消息。');
    unique.add(line.id);
    return {
      speaker:
        line.senderId === report.subject_id
          ? 'subject'
          : line.senderId === report.reporter_id
            ? 'reporter'
            : 'context',
      text: Array.from(redactText(line.content, slice.redactions)).slice(0, 1000).join(''),
      mediaKinds: [
        ...new Set((line.attachments ?? []).map((file) => (file.mime === 'video/mp4' ? 'video' : 'image'))),
      ],
    };
  });
  await audit(pool, id, actor, 'assistant_requested');
  const suggestion = await adapter.suggest({
    kind: report.kind,
    provenance: report.provenance,
    policyVersion: 'p1-v2',
    evidence: { messages },
    signal: AbortSignal.timeout(4000),
  });
  const focus = choose(suggestion?.focus, ['context', 'authenticity', 'urgency', 'insufficient']);
  return { focus };
}
