import { randomUUID } from 'expo-crypto';
import type { Row, Rows } from './life-fixtures';
import { self, friendName } from './life-fixtures';

type Input = Record<string, unknown>;
const array = (x: unknown): Row[] => (Array.isArray(x) ? x : []);
const ids = (x: unknown): string[] => (Array.isArray(x) ? x.filter((i) => typeof i === 'string') : []);
const live = ['confirming', 'formed'];
const check = (ok: unknown, message = '当前状态已变化，请刷新后重试。') => {
  if (!ok) throw new Error(message);
};

export function previewGathering(
  store: Rows,
  id: string | undefined,
  action: string | undefined,
  read: boolean,
  body: Input,
) {
  const records = read
    ? (store.gatherings ?? [])
    : (store.gatherings = (store.gatherings ?? []).map((row) => ({ ...row })));
  if (!id && read) return { gatherings: records };
  const options = () =>
    array(body.options).map((item) => {
      check(Date.parse(String(item.startsAt)) > Date.now(), '候选时间需在未来。');
      check(!item.endsAt || Date.parse(String(item.endsAt)) > Date.parse(String(item.startsAt)));
      return { ...item, id: randomUUID() };
    });
  if (!id) {
    const existing = records.find((g) => g.clientId === body.clientId && g.ownerId === self);
    if (existing) return { id: existing.id };
    const group = store.relationGroups?.find((g) => g.id === body.groupId);
    const guests = [...new Set([...ids(body.memberIds), ...ids(group?.memberIds)])];
    check(guests.length > 0, '请选择好友。');
    const min = body.mode === 'all' ? guests.length + 1 : Number(body.minimum);
    check(min >= 2 && min <= guests.length + 1, '请核对成局人数。');
    check(
      !body.capacity || (Number(body.capacity) >= min && Number(body.capacity) <= 30),
      '请核对人数上限。',
    );
    const times = options();
    check(times.length || body.planning === true);
    const record = {
      ...body,
      id: randomUUID(),
      ownerId: self,
      minimum: min,
      memberIds: guests,
      options: times,
      state: 'interest',
      votes: [],
      confirmed: false,
      choiceId: null,
      attendees: [],
      ballotClosed: false,
      directProposal: guests.length < 3,
      createdAt: new Date().toISOString(),
    };
    records.unshift(record);
    return { id: record.id };
  }
  const row = records.find((g) => g.id === id);
  if (!row) throw new Error('找不到可访问的约局。');
  const host = row.ownerId === self,
    guests = ids(row.memberIds);
  check(host || guests.includes(self), '找不到可访问的约局。');
  const linked = () => store.calendars?.find((e) => e.gatheringId === id && e.ownerId === self);
  const option = array(row.options).find((o) => o.id === row.choiceId);
  if (action === 'discussion') {
    const messages = array(row.messages);
    if (read) return { joined: !!row.discussion, messages };
    if (body.action === 'leave') Object.assign(row, { discussion: false, messages: [] });
    else if (body.action === 'withdraw') row.messages = messages.filter((m) => m.id !== body.id || !m.mine);
    else {
      check(!['cancelled', 'completed'].includes(String(row.state)));
      if (body.action === 'join') row.discussion = true;
      else {
        check(
          row.discussion &&
            body.action === 'post' &&
            typeof body.text === 'string' &&
            body.text.trim().length > 0 &&
            body.text.length <= 240,
        );
        if (!messages.some((m) => m.clientId === body.clientId))
          row.messages = [
            {
              id: randomUUID(),
              clientId: body.clientId,
              body: body.text,
              mine: true,
              name: '我',
              createdAt: new Date().toISOString(),
            },
            ...messages,
          ];
      }
    }
    return {};
  }
  if (read) {
    const source = store.items?.find(
      (i) => i.id === row.source && (i.ownerId === self || ids(i.memberIds).includes(self)),
    );
    const checklist = store.projects?.find(
      (s) => s.id === row.checklistId && s.kind === 'list' && (s.ownerId === self || s.state === 'active'),
    );
    const journal = store.collections?.find(
      (c) => c.gatheringId === id && (c.ownerId === self || c.state === 'active'),
    );
    return {
      gathering: { ...row, inCalendar: !!linked(), source, checklist, journalId: journal?.id },
      options: row.options,
      attendees: row.attendees,
      roster: host ? guests.map((id) => ({ id, name: friendName(id) })) : undefined,
    };
  }
  check(!['cancelled', 'completed'].includes(String(row.state)));
  const unlink = () => {
    store.calendars = (store.calendars ?? []).filter((e) => e.gatheringId !== id);
  };
  if (action === 'details') {
    check(host && row.state === 'interest' && !row.ballotClosed && !row.intention && !row.answer);
    check(body.revision === (row.revision ?? 1));
    check(typeof body.title === 'string' && body.title.trim() && body.title.length <= 80, '请填写活动名称。');
    Object.assign(row, {
      title: String(body.title).trim(),
      description: body.description,
      meetingNote: body.meetingNote,
      cover: body.cover,
      revision: Number(row.revision ?? 1) + 1,
    });
  } else if (action === 'organize') {
    check(host || (row.preparation === 'accepted' && body.action === 'propose'));
    switch (body.action) {
      case 'propose':
        check(row.state === 'interest' && !array(row.options).length);
        row.options = options();
        check(array(row.options).length);
        break;
      case 'seal':
        check(row.state === 'interest' && !row.directProposal);
        row.ballotClosed = true;
        break;
      case 'choose':
        check(
          row.state === 'interest' &&
            array(row.options).some(
              (o) => o.id === body.optionId && Date.parse(String(o.startsAt)) > Date.now(),
            ),
        );
        Object.assign(row, { state: 'confirming', choiceId: body.optionId, confirmed: true, attendees: [] });
        break;
      case 'reschedule':
        check(live.includes(String(row.state)));
        {
          const times = options();
          check(times.length);
          Object.assign(row, {
            options: times,
            state: 'interest',
            ballotClosed: false,
            confirmed: false,
            choiceId: null,
            intention: null,
            votes: [],
            attendees: [],
            reminderMinutes: null,
          });
          unlink();
          break;
        }
      case 'cancel':
        row.state = 'cancelled';
        row.reminderMinutes = null;
        unlink();
        break;
      case 'complete':
        check(row.state === 'formed' && option && Date.parse(String(option.startsAt)) <= Date.now());
        row.state = 'completed';
        break;
      default:
        throw new Error('未知的活动操作。');
    }
  } else if (action === 'intention') {
    check(row.state === 'interest' && !row.directProposal && !row.ballotClosed);
    row.intention = body.intention;
    row.votes = body.intention === 'unavailable' ? [] : ids(body.optionIds);
  } else if (action === 'calendar') {
    if (body.enabled) {
      check(row.confirmed && option?.endsAt && live.includes(String(row.state)));
      if (!linked())
        store.calendars = [
          ...(store.calendars ?? []),
          {
            id: randomUUID(),
            ownerId: self,
            gatheringId: id,
            title: '约局',
            visibility: 'private',
            startsAt: option?.startsAt,
            endsAt: option?.endsAt,
            revision: 1,
          },
        ];
    } else unlink();
  } else if (action === 'confirm') {
    check(!host && option && live.includes(String(row.state)));
    // The single-account preview never supplies another person's confirmation.
    row.confirmed = body.attend === true;
    if (!row.confirmed) {
      unlink();
      row.reminderMinutes = null;
    }
  } else if (action === 'roster') {
    check(host && (row.state !== 'interest' || (!row.intention && !row.ballotClosed)));
    const next =
      body.action === 'remove'
        ? guests.filter((id) => id !== body.userId)
        : [...new Set([...guests, ...ids(body.memberIds)])];
    check(
      next.length >= 1 && next.length < 30 && (row.mode === 'all' || next.length + 1 >= Number(row.minimum)),
    );
    Object.assign(row, {
      memberIds: next,
      directProposal: next.length < 3,
      minimum: row.mode === 'all' ? next.length + 1 : row.minimum,
    });
  } else if (action === 'personal') {
    switch (body.action) {
      case 'reminder':
        check(row.confirmed && option);
        row.reminderMinutes = body.minutes;
        break;
      case 'answer':
        check(row.state === 'interest' && !row.ballotClosed);
        check(body.answer === null || ids(row.choices).includes(String(body.answer)));
        row.answer = body.answer;
        break;
      case 'note':
        row.privateNote = String(body.note ?? '').slice(0, 240);
        break;
      default:
        throw new Error('此操作需要其他账号通过服务端参与。');
    }
  } else throw new Error('未知的活动操作。');
  return {};
}

export function previewReminders(store: Rows, now = new Date()) {
  const prefs = store.settings?.find((p) => p.id === 'privacy');
  if (!prefs || prefs.muteIndefinitely || Date.parse(String(prefs.muteUntil)) > +now)
    return { reminders: [] };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: String(prefs.zone || 'UTC'),
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    clock = parts.hour + ':' + parts.minute;
  const quiet = prefs.quietHours as Record<string, string[]> | undefined;
  const today = quiet?.[parts.weekday],
    prior = quiet?.[days[(days.indexOf(parts.weekday) + 6) % 7]];
  if (
    (today && clock >= today[0] && (today[0] > today[1] || clock < today[1])) ||
    (prior && prior[0] > prior[1] && clock < prior[1])
  )
    return { reminders: [] };
  return {
    reminders: (store.gatherings ?? []).flatMap((row) => {
      if (!row.confirmed || !row.reminderMinutes || !live.includes(String(row.state))) return [];
      const option = array(row.options).find((o) => o.id === row.choiceId),
        start = Date.parse(String(option?.startsAt));
      return start >= +now && start <= +now + Number(row.reminderMinutes) * 60000
        ? [{ id: row.id, title: row.title, startsAt: option?.startsAt }]
        : [];
    }),
  };
}
