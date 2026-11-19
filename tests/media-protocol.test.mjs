import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPeerMessage, easemobAttachmentUrl, readPeerMessage, locationValue, summaryOf } from '../src/features/media/protocol.ts';
import { transitionCall } from '../src/features/calls/model.ts';

class Text { constructor(content) { this.content = content; } }
class Image { constructor(properties) { Object.assign(this, properties); } }
class Location { constructor(latitude, longitude, address) { Object.assign(this, { latitude, longitude, address }); } }
const local = (peer, body) => ({ to: peer, from: 'me', body, chatType: 0, status: 1, msgId: '1', localTime: 3, attributes: {} });
const connection = { sdk: {
  ChatTextMessageBody: Text, ChatImageMessageBody: Image, ChatLocationMessageBody: Location,
  ChatMessageChatType: { PeerChat: 0 }, ChatMessageStatus: { SUCCESS: 1 }, ChatMessage: {
    createTextMessage: (target, value) => local(target, new Text(value)),
    createImageMessage: (target, localPath, _type, props) => local(target, new Image({ localPath, ...props })),
    createLocationMessage: (target, lat, lon, _type, props) => local(target, new Location(lat, lon, props.address)),
  },
} };

test('Easemob image builder uses one preprocessed local file and parser isolates the accepted peer', () => {
  const source = buildPeerMessage(connection, 'friend', { kind: 'image', photoId: 'one', width: 1024, height: 523, bytes: 12400 },
    'file:///app/photo.jpg');
  assert.equal(source.body.sendOriginalImage, true);
  assert.equal(source.body.fileSize, 12400);
  assert.equal(source.body.localPath, '/app/photo.jpg');
  assert.equal(readPeerMessage(connection, { ...source, status: 0 }, 'me', 'friend'), null);
  assert.equal(readPeerMessage(connection, { ...source, from: 'other', to: 'me' }, 'me', 'friend'), null);
  assert.equal(readPeerMessage(connection, { ...source, chatType: 1 }, 'me', 'friend'), null);
  const restored = readPeerMessage(connection, { ...source, from: 'friend', to: 'me', serverTime: 10 }, 'me', 'friend');
  assert.equal(restored.kind, 'image');
  assert.equal(restored.mine, false);
  assert.equal(restored.timestamp, 10);
  assert.equal(summaryOf(restored), '[图片]');
});

test('Easemob location keeps coordinates and title, rejects invalid payloads, and leaves text compatible', () => {
  assert.equal(locationValue('', '0', '', ''), undefined);
  assert.equal(locationValue(91, 0, '', ''), undefined);
  assert.equal(locationValue(30, 900, '', ''), undefined);
  const source = buildPeerMessage(connection, 'friend', { kind: 'location', latitude: 31.22, longitude: 121.45,
    name: '路口', address: '上海' });
  assert.equal(source.body.address, '上海');
  assert.equal(source.attributes.penlia_place_name, '路口');
  const restored = readPeerMessage(connection, { ...source, from: 'friend', to: 'me' }, 'me', 'friend');
  assert.equal(restored.latitude, 31.22);
  assert.equal(restored.longitude, 121.45);
  const old = buildPeerMessage(connection, 'friend', { kind: 'text', text: '到啦' });
  assert.equal(summaryOf(readPeerMessage(connection, old, 'me', 'friend')), '到啦');
});

test('call transitions accept, disconnect and recover without applying stale events', () => {
  let state = { id: 'r1', type: 'video', phase: 'incoming' };
  const act = (action) => { state = transitionCall(state, { id: 'r1', action }); return state.phase; };
  assert.equal(act('joined'), 'incoming');
  assert.equal(act('accept'), 'connecting');
  assert.equal(act('joined'), 'active');
  assert.equal(act('interrupt'), 'reconnecting');
  assert.equal(act('recover'), 'active');
  assert.equal(transitionCall(state, { id: 'previous', action: 'fail' }), state);
  assert.equal(act('end'), 'ended');
  assert.equal(act('joined'), 'ended');
  assert.equal(transitionCall({ id: 'r2', type: 'voice', phase: 'outgoing' }, { id: 'r2', action: 'decline' }).reason, 'declined');
});

test('attachment retrieval only trusts HTTPS endpoints in the approved Easemob domains', () => {
  assert.equal(easemobAttachmentUrl('https://a1.easemob.com/app/chatfiles/123'), true);
  assert.equal(easemobAttachmentUrl('http://a1.easemob.com/app/chatfiles/123'), false);
  assert.equal(easemobAttachmentUrl('https://a1.easemob.com.example.com/app/chatfiles/123'), false);
  assert.equal(easemobAttachmentUrl('https://a1.easemob.com@localhost/private'), false);
});
