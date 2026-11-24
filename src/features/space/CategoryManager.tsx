import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { Button, ListRow, Notice, Sheet } from '../../components/ui';
import { styles } from '../../theme';
import { localId } from '../local/document';
import { editCategory, removeCategory, type AlbumCategory } from './album-categories';
import { useSpace } from './store';

export function CategoryManager({ owner, close }: { owner: string; close: () => void }) {
  const state = useSpace();
  const groups = state.value?.categories?.filter(c => c.ownerId === owner) ?? [];
  const [draft,setDraft] = useState<AlbumCategory>();
  const [deleting,setDeleting] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  function back() {
    if (busy) return;
    setError('');
    if (deleting) setDeleting(false);
    else if (draft) setDraft(undefined);
    else close();
  }
  async function apply() {
    if (!draft || busy || !state.owns(owner)) return;
    setBusy(true); setError('');
    try {
      await state.save(data => deleting ? removeCategory(data, owner, draft.id) : editCategory(data,owner,draft));
      setDeleting(false); setDraft(undefined);
    } catch (e) { setError(e instanceof Error ? e.message : '未能保存分类。'); }
    finally { setBusy(false); }
  }
  return <Sheet avoidKeyboard title={deleting ? '删除分类' : draft ? '编辑分类' : '管理分类'} onClose={back}>
    {!!error && <Notice>{error}</Notice>}
    {!draft ? <>
      <Button label="新建分类" icon="add" onPress={() => setDraft({ id: localId(), ownerId: owner, name: '', description: '' })} />
      {groups.map(c => <ListRow key={c.id} title={c.name} detail={c.description} onPress={() => setDraft(c)} />)}
    </> : deleting ? <>
      <Text style={styles.body}>删除「{draft.name}」后，其中的相册仍可在「全部」中查看。</Text>
      <Button label="确认删除分类" variant="danger" disabled={busy} onPress={() => void apply()} />
    </> : <>
      <TextInput accessibilityLabel="分类名称" placeholder="分类名称" style={styles.input} value={draft.name} maxLength={30} onChangeText={name => setDraft({...draft,name})} />
      <TextInput accessibilityLabel="分类简介" placeholder="分类简介" style={styles.input} value={draft.description} multiline maxLength={160} onChangeText={description => setDraft({...draft,description})} />
      <Button label="保存分类" disabled={busy || !draft.name.trim()} onPress={() => void apply()} />
      {groups.some(c => c.id === draft.id) && <Button label="删除分类" variant="danger" disabled={busy} onPress={() => setDeleting(true)} />}
    </>}
  </Sheet>;
}
