import { DepthGlass } from '../../components/depth-glass';
import { isLiquidGlass } from '../../demo/mode';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../components/ui';
import { useAppearance } from '../../components/appearance';
import { type } from '../../theme';
import { PetOrb } from '../pet/Orb';
import { decorNames, type WorldRecord, type Space, type Decor } from './model';

export const decorIcons = {
  flower: 'flower-outline', lamp: 'bulb-outline', cushion: 'ellipse-outline',
  frame: 'images-outline', shell: 'leaf-outline', star: 'sparkles-outline',
} as const;
const lightScenes = {
  garden: ['#FBEAF1', '#EAF7F1', '#C4E6D8'],
  coast: ['#FCE4E8', '#FFEEDB', '#BDEAE8'],
  night: ['#E6E3F6', '#BFCBE7', '#B0C9D6'],
} as const;

const darkScenes = {
  garden: ['#292530', '#25352F', '#20453B'],
  coast: ['#342833', '#393239', '#233E43'],
  night: ['#2F293E', '#303B56', '#293E4B'],
} as const;

export function WorldScene({ space, records, choose, add, greet }: {
  space: Space; records: WorldRecord[]; choose: (record: WorldRecord) => void;
  add: (x: number, y: number) => void; greet: () => void;
}) {
  const { scheme } = useAppearance();
  const dark = scheme === 'dark';
  const sceneInk = dark ? '#F4EAF1' : '#3A3042';
  const greeted = space.greetedAt ? Date.parse(space.greetedAt) : 0;
  return (
    <LinearGradient colors={(dark ? darkScenes : lightScenes)[space.scene]} style={local.stage}>
      <View style={local.sky}>
        <View style={local.pet}>
          <PetOrb size={92} vitality={61} fed={greeted} onPet={greet} />
        </View>
        <Text style={[local.petName, { color: sceneInk }]}>{space.petName}</Text>
      </View>
      {[0,1,2].map((y) => (
        <View key={y} style={local.gridRow}>
          {[0,1,2,3].map((x) => {
            const record = records.find((row) => row.x === x && row.y === y);
            const icon: Decor | null = record?.icon ?? null;
            return (
              <Pressable key={x} accessibilityRole="button"
                accessibilityLabel={record ? record.sourceTitle ?? record.body : `在第 ${y+1} 行第 ${x+1} 格放摆件`}
                onPress={() => record ? choose(record) : add(x,y)}
                style={({ pressed }) => [local.slot, dark && local.darkSlot, !!record && (dark ? local.darkOccupied : local.occupied), pressed && local.pressed]}>
                {isLiquidGlass && !!record && <DepthGlass level="medium" roundness={11} />}
                <Icon name={icon ? decorIcons[icon] : 'add-outline'} color={sceneInk} />
                {icon && <Text numberOfLines={1} style={[local.label, { color: sceneInk }]}>{record?.sourceId ? '纪念物' : decorNames[icon]}</Text>}
              </Pressable>
            );
          })}
        </View>
      ))}
    </LinearGradient>
  );
}
const local = StyleSheet.create({
  stage: { borderRadius: 18, padding: 12, gap: 5 },
  sky: { alignItems: 'center', paddingBottom: 9 },
  pet: { height: 117, width: 124 },
  petName: { ...type.control, color: '#3A3042', fontSize: 15 },
  gridRow: { flexDirection: 'row', gap: 5 },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 47, borderRadius: 11, backgroundColor: '#FFFFFF45' },
  occupied: { backgroundColor: '#FFFFFFAA' },
  darkSlot: { backgroundColor: '#FFFFFF16' },
  darkOccupied: { backgroundColor: '#FFFFFF28' },
  pressed: { opacity: 0.65 },
  label: { color: '#3A3042', fontSize: 11 },
});
