import { Image, StyleSheet, Text, View } from 'react-native';

import { OrbFace } from '../features/pet/Orb';
import { colors, radius, space, styles, type, weight } from '../theme';
import { GlassLayer } from './material';
import { BrandMark } from './ui';

const hero = require('../../assets/identity/hero.jpg');

export function WelcomeIdentity({ compact = false }: { compact?: boolean }) {
  return <View style={local.identity}>
    <View style={local.wordmark}>
      <BrandMark size={35} />
      <Text style={local.brandName}>朋聊 <Text style={styles.muted}>Penlia</Text></Text>
    </View>
    {!compact && <View style={local.brandStory}>
      <GlassLayer tone="feature" roundness={radius.surface} />
      <View style={local.copy}>
        <OrbFace size={37} expression="curious" />
        <Text style={local.promise}>工作留给微信，{ '\n' }生活交给朋聊。</Text>
      </View>
      <Image source={hero} style={local.image} accessible={false} />
    </View>}
  </View>;
}

const local = StyleSheet.create({
  identity: { gap: space.md },
  wordmark: { ...styles.row, gap: space.xs },
  brandName: { ...styles.strong, fontWeight: weight.semibold },
  brandStory: { flexDirection: 'row', alignItems: 'stretch', gap: space.sm,
    borderRadius: radius.surface, overflow: 'hidden', minHeight: 136 },
  copy: { width: '62%', minWidth: 0, padding: space.md, gap: space.xs, justifyContent: 'center' },
  promise: { ...type.heading, color: colors.text },
  image: { width: '38%', alignSelf: 'stretch', height: '100%', position: 'absolute', right: 0, resizeMode: 'cover' },
});
