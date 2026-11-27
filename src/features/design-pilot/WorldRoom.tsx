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
      flexDirection: 'row', gap: variant === 'C' ? 5 : 2, borderBottomWidth: cabinet ? 1.5 : book ? StyleSheet.hairlineWidth : 0,
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
            backgroundColor: pressed || (occupied && !book) ? colors.tint : variant === 'B' ? colors.surface : 'transparent',
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
  const split = fontScale < 1.35 && width >= 345;
  const pet = (size: number, ink: string) => <View style={{ justifyContent: 'center', alignItems: 'center', gap: 3 }}>
    <View style={{ width: size + 22, height: size + 22 }}><PetOrb size={size} vitality={61} fed={space.greetedAt ? Date.parse(space.greetedAt) : 0} onPet={greet} /></View>
    <Text style={{ fontSize: 14, color: ink, fontWeight: '500' }}>{space.petName}</Text>
  </View>;
  const display = (size: number, color = colors.text) => <Text accessibilityRole="header" style={{
    color, fontSize: size, lineHeight: Math.ceil(size * 1.26), fontWeight: book ? '400' : '700',
    fontFamily: book ? 'PenliaReading' : undefined, letterSpacing: book ? 0.5 : -0.45,
  }}>{space.title}</Text>;
  const scene = (color = colors.muted) => <Text style={{ color, fontSize: 14, fontWeight: '500' }}>{space.eventDay ?? sceneNames[space.scene]}</Text>;
  const slots = <Places records={records} choose={choose} add={add} />;
  const landscape = <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    {space.scene === 'coast' && !dark ? <Backdrop /> : <LinearGradient colors={(dark ? darkTints : sceneTints)[space.scene]} style={StyleSheet.absoluteFill} />}
  </View>;
  if (variant === 'C') return <View style={{ gap: 14 }}>
    <View style={{ paddingHorizontal: 4 }}>{display(33)}</View>
    <View style={{ backgroundColor: colors.surface, borderRadius: 29, overflow: 'hidden', paddingBottom: 10 }}>
      <View style={{ minHeight: 192, justifyContent: 'center', alignItems: 'center', padding: 17, overflow: 'hidden' }}>
        {landscape}
        <LinearGradient pointerEvents="none" colors={['transparent','#2636307a']} style={StyleSheet.absoluteFill} />
        {pet(90, '#FFFFFF')}
        <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>{scene('#FFFFFF')}</View>
      </View>
      <View style={{ paddingTop: 8 }}>{slots}</View>
    </View>
  </View>;
  if (book) return <View style={{ gap: 15, paddingTop: 12 }}>
    <View style={{ paddingVertical: 12, borderTopColor: colors.text, borderTopWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }}>
      {scene(colors.accent)}
    </View>
    {display(36)}
    <View style={{ flexDirection: split ? 'row' : 'column', gap: split ? 10 : 12, alignItems: 'stretch' }}>
      <View style={{ borderRightWidth: split ? StyleSheet.hairlineWidth : 0, borderColor: colors.line, paddingRight: split ? 8 : 0, justifyContent: 'center', paddingVertical: 8 }}>
        {pet(71, colors.text)}
      </View>
      <View style={{ flex: split ? 1 : undefined }}>{slots}</View>
    </View>
  </View>;
  if (variant === 'B') return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: split ? 'row' : 'column', alignItems: split ? 'center' : 'flex-start', gap: 9, paddingVertical: 8 }}>
      <View style={{ flex: split ? 1 : undefined, gap: 6 }}>{scene()}{display(27)}</View>
      {pet(56, colors.text)}
    </View>
    <View style={{ backgroundColor: colors.line, padding: 2, borderRadius: 3 }}>{slots}</View>
  </View>;
  return <View style={{ gap: 13 }}>
    <View style={{ paddingVertical: 4, gap: 4 }}>{scene(colors.accent)}{display(33)}</View>
    <View style={{ minHeight: 171, overflow: 'hidden', borderTopLeftRadius: 34, borderTopRightRadius: 8, borderBottomLeftRadius: 8, borderBottomRightRadius: 34,
      alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
      {landscape}
      <LinearGradient colors={['transparent', '#192D2870']} style={StyleSheet.absoluteFill} />
      {pet(90,'#FFFFFF')}
    </View>
    {slots}
  </View>;
}
