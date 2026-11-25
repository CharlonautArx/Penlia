import { StyleSheet, Text, View } from 'react-native';

import { Avatar, Section } from '../../components/ui';
import { demoPortrait } from '../../demo/visuals';
import { colors, radius, space, styles } from '../../theme';
import type { PublicPerson } from './invitations';

export function PublicProfile({ person, note }: { person: PublicPerson; note?: string }) {
  return <>
    <View style={local.card}>
      <Avatar userId={person.id} name={person.name} size={70} source={person.avatar ? { uri: 'data:image/jpeg;base64,' + person.avatar } : demoPortrait(person.demoPortraitKey ?? '')} />
      <View style={styles.grow}>
        <Text style={styles.section}>{person.name}</Text>
        {!!person.region && <Text style={styles.small}>{person.region}</Text>}
        {!!person.bio && <Text style={styles.body}>{person.bio}</Text>}
      </View>
    </View>
    {note !== undefined && <>
      <Section title="好友申请验证消息" />
      <View style={local.note}><Text selectable style={styles.body}>{note || '未填写验证消息'}</Text></View>
    </>}
  </>;
}

const local = StyleSheet.create({
  card: { ...styles.row, gap: space.md, padding: space.md, backgroundColor: colors.panel, borderRadius: radius.surface },
  note: { padding: space.md, backgroundColor: colors.panel, borderRadius: radius.control },
});
