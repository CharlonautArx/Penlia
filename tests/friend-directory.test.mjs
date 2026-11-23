import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteGroup, emptyDirectory, groupOf, moveFriend, reorderGroup, saveGroup, setRemark, sortFriends } from '../src/features/friends/directory.ts';
import { formatHandle } from '../src/services/handle.ts';

function contact(name, id) {
  return { name, id: 'friendship-' + id, userId: id, username: id, bio: '', status: 'accepted', outgoing: false, chatReady: true };
}

test('directory uses pinyin, stable ties and a final fallback section', () => {
  const contacts = [
    contact('小满', 'xm'), contact('陈默', 'cm'), contact('阿竹', 'az'), contact('阿白', 'ab'), contact('林鹿', 'll'),
    contact('沈言', 'sy'), contact('anna', 'b'), contact('Anna', 'a'), contact('5Five', '5'), contact('★星', 'star'),
  ];
  const sorted = sortFriends(contacts, emptyDirectory);
  assert.deepEqual(sorted.map(({ userId }) => userId), ['ab', 'az', 'a', 'b', 'cm', 'll', 'sy', 'xm', 'star', '5']);
  assert.deepEqual([...new Set(sorted.map(({ letter }) => letter))], ['A', 'C', 'L', 'S', 'X', '#']);
  const renamed = sortFriends(contacts, setRemark(emptyDirectory, 'xm', '白满'));
  assert.equal(renamed.find((item) => item.userId === 'xm').letter, 'B');
  assert.equal(renamed.find((item) => item.userId === 'xm').name, '小满');
  assert.equal(contacts[0].name, '小满');
  assert.equal(sortFriends(contacts, setRemark(setRemark(emptyDirectory, 'xm', '白满'), 'xm', ' ')).find((item) => item.userId === 'xm').letter, 'X');
});

test('membership is unique and deleting groups only affects the directory', () => {
  const contacts = [contact('小满', 'xm'), contact('沈言', 'sy')];
  let directory = saveGroup(saveGroup(emptyDirectory, 'one', '旅行'), 'two', '家人');
  assert.throws(() => saveGroup(directory, 'three', ' 我的好友 '));
  assert.throws(() => saveGroup(directory, 'three', '旅行'));
  directory = saveGroup(directory, 'two', '亲友');
  directory = reorderGroup(directory, 'two', -1);
  assert.deepEqual(directory.groups.map(({ name }) => name), ['亲友', '旅行']);
  directory = moveFriend(moveFriend(directory, 'xm', 'one'), 'xm', 'two');
  assert.deepEqual(directory.membership, { xm: 'two' });
  assert.equal(groupOf(directory, 'sy'), null);
  directory = JSON.parse(JSON.stringify(directory));
  assert.equal(groupOf(directory, 'xm'), 'two');
  assert.equal(groupOf(moveFriend(directory, 'xm', null), 'xm'), null);
  directory = deleteGroup(directory, 'two');
  assert.equal(groupOf(directory, 'xm'), null);
  assert.deepEqual(sortFriends(contacts, directory), sortFriends(contacts, emptyDirectory));
});

test('visible handles accept decorated legacy values without mutating identifiers', () => {
  assert.equal(formatHandle(' @qinghe '), 'qinghe');
  assert.equal(formatHandle('＠xiaoman'), 'xiaoman');
  assert.equal(formatHandle('linlu'), 'linlu');
});
