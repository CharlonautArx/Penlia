import { useState } from 'react';
import { Keyboard, Text, TextInput } from 'react-native';

import { Button, Icon, ListRow, Notice, Sheet } from '../../components/ui';
import { errorMessage } from '../../services/api';
import { styles } from '../../theme';
import { defaultGroupName, groupOf, moveFriend, setRemark, type Directory } from './directory';
import { useDirectory, type SaveDirectory } from './store';

export function FriendDetailsEditor({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const { value, save, loading, error, retry } = useDirectory();
  if (!value) return <Sheet title="备注与分组" onClose={onClose} tone="neutral">
    {!!error && <Notice action="重试" onAction={retry}>{error}</Notice>}
    {loading && <Text style={styles.muted}>正在加载好友备注…</Text>}
  </Sheet>;
  return <DetailsForm id={id} name={name} value={value} save={save} onClose={onClose} />;
}

function DetailsForm({ id, name, value, save, onClose }: {
  id: string; name: string; value: Directory; save: SaveDirectory; onClose: () => void;
}) {
  const [remark, setRemarkText] = useState(value.remarks[id] ?? '');
  const [groupId, setGroup] = useState(groupOf(value, id));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  async function apply() {
    setBusy(true);
    setFailure('');
    try {
      await save((data) => moveFriend(setRemark(data, id, remark), id, groupId));
      Keyboard.dismiss();
      onClose();
    } catch (error) { setFailure(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <Sheet avoidKeyboard title="备注与分组" onClose={() => { if (!busy) onClose(); }} tone="neutral">
    {!!failure && <Notice>{failure}</Notice>}
    <Text style={styles.strong}>好友备注</Text>
    <TextInput style={styles.input} accessibilityLabel="好友备注" placeholder={name}
      value={remark} onChangeText={setRemarkText} editable={!busy} maxLength={32} />
    <Text style={styles.strong}>好友分组</Text>
    {[...value.groups, { id: null, name: defaultGroupName }].map((group) => <ListRow key={group.id ?? ''}
      title={group.name} trailing={<Icon name={group.id === groupId ? 'checkmark-circle' : 'ellipse-outline'} size={19} />}
      onPress={() => { if (!busy) setGroup(group.id); }} />)}
    <Button label="保存备注与分组" disabled={busy} onPress={() => void apply()} />
  </Sheet>;
}
