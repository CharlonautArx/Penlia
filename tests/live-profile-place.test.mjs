import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextHandleChange, presentLocalIdentity } from '../src/services/profile-model.ts';
import { encodePlaceCard, parsePlaceCard, placeCaption } from '../src/features/play/place-card-model.ts';

test('local profile presentation resolves stable IDs without changing historical text', () => {
  const user = { id: 'me', name: 'ARX', username: 'new_qinghe' };
  const record = {
    authorId: 'me', author: '青禾', authorUsername: 'qinghe', body: '青禾原来写的正文',
    comments: [{ authorId: 'other', author: '青禾', body: '旧文' }],
    members: [{ id: 'me', name: '青禾' }], editorId: 'me', editor: '青禾',
    quote: { senderId: 'me', name: '青禾', body: '历史原文' },
  };
  assert.deepEqual(presentLocalIdentity(record, user), {
    ...record, author: 'ARX', authorUsername: 'new_qinghe', editor: 'ARX', members: [{ id: 'me', name: 'ARX' }],
  });
  assert.equal(record.author, '青禾');
  assert.equal(nextHandleChange(new Date('2024-02-29T14:12:00.000Z')), '2025-02-28T14:12:00.000Z');
});

test('place cards retain a portable provider reference, source and caption', () => {
  const card = { id: 'sample-board', provider: 'local', title: '夜航桌游社', area: '上海 · 长宁',
    category: '桌游', intro: '适合小聚。', source: '样式示例', cover: 'sample-board', official: undefined };
  const encoded = encodePlaceCard(card);
  assert.ok(encoded.length < 1000);
  assert.deepEqual(parsePlaceCard(encoded), card);
  assert.equal(placeCaption(encoded), '[去处] 夜航桌游社');
  assert.equal(parsePlaceCard(encoded + ' extra'), undefined);
  assert.throws(() => encodePlaceCard({ ...card, provider: '../etc' }));
  assert.throws(() => encodePlaceCard({ ...card, official: 'javascript:alert(1)' }));
});
