import { readingFont } from './reading';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '../../components/ui';
import { PetOrb } from '../pet/Orb';
import { Backdrop } from '../together/Backdrop';
import { decorNames, sceneNames, type Space, type WorldRecord } from '../world/model';
import { decorIcons } from '../world/scene';
import { useDesignPilot } from './context';

type Props = {
  space: Space;
  records: WorldRecord[];
  choose: (record: WorldRecord) => void;
  add: (x: number, y: number) => void;
  greet: () => void;
};

const sceneTints = {
  garden: ['#CED9B4', '#91B7A7', '#47645D'],
  coast: ['#F2D0AE', '#C0CDC1', '#456762'],
  night: ['#8F90AE', '#777E9A', '#434C65'],
} as const;
const darkTints = {
  garden: ['#444B39', '#35443B', '#222F2C'],
  coast: ['#52443E', '#374747', '#283838'],
  night: ['#3B3B53', '#30394B', '#212735'],
} as const;

function Places({ records, choose, add }: Pick<Props, 'records' | 'choose' | 'add'>) {
  const { colors, variant } = useDesignPilot();
  const book = variant === 'D';
  const cabinet = variant === 'A';
  return <View style={{ gap: cabinet ? 8 : 2, paddingHorizontal: variant === 'C' ? 7 : 0 }}>
    {[0,1,2].map((y) => <View key={y} style={{
      flexDirection: 'row', gap: variant === 'C' ? 5 : 2, borderBottomWidth: cabinet ? 1.5 : book || variant === 'B' ? StyleSheet.hairlineWidth : 0,
      borderColor: colors.line, paddingBottom: cabinet ? 3 : 0,
    }}>
      {[0,1,2,3].map((x) => {
        const record = records.find((row) => row.x === x && row.y === y);
        const occupied = !!record;
        const icon = record?.icon;
        const name = record?.sourceId ? '纪念物' : icon ? decorNames[icon] : '';
        return <Pressable key={x} accessibilityRole="button"
          accessibilityLabel={record ? record.sourceTitle || record.body || name : '在第 ' + (y+1) + ' 行第 ' + (x+1) + ' 格放摆件'}
          android_ripple={{ color: colors.line }} onPress={() => record ? choose(record) : add(x,y)}
          style={({ pressed }) => [{
            minHeight: variant === 'C' ? 53 : 48, flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2,
            backgroundColor: pressed || (occupied && !book) ? colors.tint : 'transparent',
            borderRadius: cabinet || variant === 'C' ? 13 : 2, paddingVertical: 3,
          }]}>
          {occupied ? <>
            <Icon name={icon ? decorIcons[icon] : 'bookmark-outline'} size={book ? 21 : 23} color={colors.accent} />
            {!!name && <Text style={{ color: colors.text, fontSize: 12, textAlign: 'center' }}>{name}</Text>}
          </> : <Icon name="add" size={14} color={colors.muted} />}
        </Pressable>;
      })}
    </View>)}
  </View>;
}

export function WorldRoom({ space, records, choose, add, greet }: Props) {
  const { variant, colors, dark } = useDesignPilot();
  const { fontScale, width } = useWindowDimensions();
  const book = variant === 'D';
  const split = fontScale < 1.25 && width >= 370;
  const pet = (size: number, ink: string) => <View style={{ justifyContent: 'center', alignItems: 'center', gap: 3 }}>
    <View style={{ width: size + 22, height: size + 22 }}><PetOrb size={size} vitality={61} fed={space.greetedAt ? Date.parse(space.greetedAt) : 0} onPet={greet} /></View>
    <Text style={{ fontSize: 14, color: ink, fontWeight: '500' }}>{space.petName}</Text>
  </View>;
  const display = (size: number, color = colors.text) => <Text accessibilityRole="header" style={{
    color, fontSize: size, lineHeight: Math.ceil(size * 1.26), fontWeight: book ? '400' : '700',
    fontFamily: book ? readingFont(space.title) : undefined, letterSpacing: book ? 0.5 : -0.45,
  }}>{space.title}</Text>;
  const scene = (color = colors.muted) => <Text style={{ color, fontSize: 14, fontWeight: '500' }}>{space.eventDay ?? sceneNames[space.scene]}</Text>;
  const slots = <Places records={records} choose={choose} add={add} />;
  const landscape = <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    {space.scene === 'coast' && !dark ? <Backdrop /> : <LinearGradient colors={(dark ? darkTints : sceneTints)[space.scene]} style={StyleSheet.absoluteFill} />}
  </View>;
  if (variant === 'C') return <View style={{ backgroundColor: colors.surface, borderRadius: 27, overflow: 'hidden', paddingBottom: 7 }}>
    <View style={{ minHeight: 211, justifyContent: 'flex-end', padding: 20, overflow: 'hidden' }}>
      {landscape}
      <LinearGradient pointerEvents="none" colors={['#17272B00','#17272B20','#101F27D8']} style={StyleSheet.absoluteFill} />
      <View style={{ alignSelf: 'flex-end' }}>{pet(84, '#FFFFFF')}</View>
      {scene('#E6EBEF')}
      {display(32, '#FFFFFF')}
    </View>
    {slots}
  </View>;
  if (book) return <View style={{ gap: 15, paddingTop: 12 }}>
    <View style={{ paddingVertical: 12, borderTopColor: colors.text, borderTopWidth: 1 }}>
      {scene(colors.accent)}
    </View>
    {display(36)}
    <View style={{ flexDirection: split ? 'row' : 'column', gap: split ? 10 : 12, alignItems: 'stretch' }}>
      <View style={{ borderRightWidth: split ? StyleSheet.hairlineWidth : 0, borderColor: colors.line, paddingRight: split ? 8 : 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, gap: 6 }}>
        {pet(71, colors.text)}
        <LinearGradient colors={(dark ? darkTints : sceneTints)[space.scene]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ width: 40, height: 3, borderRadius: 1 }} />
      </View>
      <View style={{ flex: split ? 1 : undefined }}>{slots}</View>
    </View>
  </View>;
  if (variant === 'B') return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: split ? 'row' : 'column', alignItems: split ? 'center' : 'flex-start', gap: 9, paddingVertical: 8 }}>
      <View style={{ flex: split ? 1 : undefined, gap: 6 }}>{scene()}{display(27)}</View>
      <View style={{ alignItems: 'center', gap: 3 }}>
        {pet(56, colors.text)}
        <LinearGradient colors={(dark ? darkTints : sceneTints)[space.scene]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ width: 30, height: 3, borderRadius: 2 }} />
      </View>
    </View>
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }}>{slots}</View>
  </View>;
  return <View style={{ gap: 13 }}>
    <View style={{ paddingVertical: 4, gap: 4 }}>{scene(colors.accent)}{display(33)}</View>
    <View style={{ borderTopLeftRadius: 32, borderTopRightRadius: 9, borderBottomLeftRadius: 9, borderBottomRightRadius: 28, overflow: 'hidden' }}>
      {landscape}
      <LinearGradient pointerEvents="none" colors={['transparent', dark ? '#28353235' : '#F4EDDE25', colors.surface, colors.surface]}
        locations={[0,0.25,0.63,1]} style={StyleSheet.absoluteFill} />
      <View style={{ minHeight: 134, alignItems: 'center', justifyContent: 'center', paddingTop: 12 }}>
        {pet(78, dark ? '#FFFFFF' : '#162D25')}
      </View>
      <View style={{ paddingHorizontal: 11, paddingBottom: 8 }}>{slots}</View>
    </View>
  </View>;
}
