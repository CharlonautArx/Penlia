import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, IconButton } from '../../components/ui';
import { colors, space, styles } from '../../theme';
import { calendarDate } from './moment-history';

export function MomentDatePicker({ value, save, busy }: { value?: string | null; save: (day: string, zone: string) => void; busy: boolean }) {
  const today = new Date();
  const [year, setYear] = useState(value?.slice(0, 4) ?? String(today.getFullYear()));
  const [month, setMonth] = useState(value?.slice(5, 7) ?? String(today.getMonth() + 1));
  const [selected, setSelected] = useState(value ?? calendarDate(today.getFullYear(), today.getMonth() + 1, today.getDate()));
  const y = Number(year), m = Number(month);
  const valid = calendarDate(y, m, 1);
  const first = valid ? new Date(Date.UTC(y, m - 1, 1)).getUTCDay() : 0;
  const days = valid ? new Date(Date.UTC(y, m, 0)).getUTCDate() : 0;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function move(offset: -1 | 1) {
    if (!valid) return;
    const next = new Date(Date.UTC(y, m - 1 + offset, 1));
    if (!calendarDate(next.getUTCFullYear(), next.getUTCMonth() + 1, 1)) return;
    setYear(String(next.getUTCFullYear()));
    setMonth(String(next.getUTCMonth() + 1));
    setSelected(undefined);
  }
  return <>
    <View style={local.controls}>
      <IconButton label="上个月" icon="chevron-back" onPress={() => move(-1)} disabled={busy || !valid} />
      <TextInput accessibilityLabel="年份" value={year} keyboardType="number-pad" maxLength={4} editable={!busy}
        onChangeText={(value) => { setYear(value.replace(/\D/g,'')); setSelected(undefined); }} style={[styles.input, local.year]} />
      <Text style={styles.small}>年</Text>
      <TextInput accessibilityLabel="月份" value={month} keyboardType="number-pad" maxLength={2} editable={!busy}
        onChangeText={(value) => { setMonth(value.replace(/\D/g,'')); setSelected(undefined); }} style={[styles.input, local.month]} />
      <Text style={styles.small}>月</Text>
      <IconButton label="下个月" icon="chevron-forward" onPress={() => move(1)} disabled={busy || !valid} />
    </View>
    {!!valid && <View style={local.grid}>
      {['日','一','二','三','四','五','六'].map((day) => <View key={day} style={local.cell}><Text style={styles.small}>{day}</Text></View>)}
      {Array.from({ length: first + days }, (_, index) => {
        const day = index - first + 1;
        const key = calendarDate(y,m,day);
        return !key ? <View key={index} style={local.cell} /> : <Pressable key={index} accessibilityRole="button" accessibilityLabel={key}
          accessibilityState={{ selected: key === selected }} style={[local.cell, key === selected && local.picked]}
          onPress={() => setSelected(key)} disabled={busy}>
          <Text style={styles.body}>{day}</Text>
        </Pressable>;
      })}
    </View>}
    <Button label={selected ? '从 ' + selected + ' 开始展示' : '请选择日期'} variant="gradient" disabled={!selected || busy || !zone}
      onPress={() => { if (selected && zone) save(selected,zone); }} />
  </>;
}

const local = StyleSheet.create({
  controls: { ...styles.row, justifyContent: 'center', gap: space.xxs },
  year: { minWidth: 62, textAlign: 'center' }, month: { minWidth: 46, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.2857%', minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  picked: { backgroundColor: colors.lavender },
});
