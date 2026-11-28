import { DepthGlass } from '../../components/depth-glass';
import { isLiquidGlass } from '../../demo/mode';
import { type ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppearance } from '../../components/appearance';
import { GlassLayer } from '../../components/material';
import { Button, Icon, IconButton } from '../../components/ui';
import { useFontScale } from '../../components/Typography';
import { colors, radius, styles } from '../../theme';
import { calendarDays, localDay, padTime } from './gathering-time';

type Picker = 'date' | 'time';
const hours = Array.from({ length: 25 }, (_, index) => index);
const minutes = Array.from({ length: 60 }, (_, index) => index);

export function GatheringTimeFields({ value, change }: { value: string; change: (value: string) => void }) {
  const [picker, setPicker] = useState<Picker>();
  const [day = '', clock = ''] = value.split(' ');
  const { reduced } = useAppearance();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const close = () => setPicker(undefined);
  function commit(nextDay: string, nextClock: string) {
    change(nextDay || nextClock ? nextDay + ' ' + nextClock : '');
    close();
  }

  return <>
    {(['date', 'time'] as const).map((field) => {
      const label = field === 'date' ? '日期' : '时间';
      const current = field === 'date' ? day : clock;
      return <View key={field} style={local.field}>
        <Text style={styles.strong}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={label}
          accessibilityValue={{ text: current || '未选择' }}
          onPress={() => setPicker(field)} style={({ pressed }) => [local.trigger, pressed && local.pressed]}>
          <Icon name={field === 'date' ? 'calendar-outline' : 'time-outline'} size={18} color={colors.quiet} />
          <Text style={[styles.body, styles.grow, !current && styles.muted]}>{current || '选择' + label}</Text>
          <Icon name="chevron-down" size={14} color={colors.quiet} />
        </Pressable>
      </View>;
    })}
    {!!picker && <Modal transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={close}>
      <View style={[local.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={close} />
        <View accessibilityViewIsModal style={[local.panel, { maxHeight: height - insets.top - insets.bottom - 24 }]}>
          {isLiquidGlass ? <DepthGlass level="strong" roundness={radius.surface} />
            : <GlassLayer tone="chrome" roundness={radius.surface} />}
          <View style={local.header}>
            <Text accessibilityRole="header" style={[styles.strong, styles.grow]}>{picker === 'date' ? '选择日期' : '选择时间'}</Text>
            <IconButton label="关闭" icon="close" onPress={close} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={local.pickerContent}>
            {picker === 'date' ? <Calendar day={day} choose={(next) => commit(next, clock)} />
              : <Clock value={clock} choose={(next) => commit(day, next)} />}
            {!!(picker === 'date' ? day : clock) && <Button variant="quiet" label={picker === 'date' ? '清除日期' : '清除时间'}
              onPress={() => commit(picker === 'date' ? '' : day, picker === 'time' ? '' : clock)} />}
          </ScrollView>
        </View>
      </View>
    </Modal>}
  </>;
}

function Calendar({ day, choose }: { day: string; choose: (day: string) => void }) {
  const now = new Date();
  const [initialYear, initialMonth] = day ? day.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const [month, setMonth] = useState(new Date(initialYear, initialMonth - 1, 1));
  const [jump, setJump] = useState<'year' | 'month'>();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const today = localDay(now);
  const changeMonth = (nextYear: number, nextMonth: number) => {
    setMonth(new Date(nextYear, nextMonth, 1));
    setJump(undefined);
  };
  return <>
    <View style={local.header}>
      <IconButton label="上一个月" icon="chevron-back" onPress={() => changeMonth(year, monthIndex - 1)} />
      <View style={[styles.row, { flexWrap: 'wrap', justifyContent: 'center', flex: 1, gap: 2 }]}>
        <Button label={year + '年'} variant="quiet" onPress={() => setJump(jump === 'year' ? undefined : 'year')} />
        <Button label={monthIndex + 1 + '月'} variant="quiet" onPress={() => setJump(jump === 'month' ? undefined : 'month')} />
      </View>
      <IconButton label="下一个月" icon="chevron-forward" onPress={() => changeMonth(year, monthIndex + 1)} />
    </View>
    {jump ? <View style={local.grid}>
      {(jump === 'month' ? Array.from({ length: 12 }, (_, index) => index + 1)
        : Array.from({ length: 12 }, (_, index) => year - 4 + index)).map((item) =>
        <Button key={item} label={item + (jump === 'month' ? '月' : '年')} variant="soft"
          onPress={() => changeMonth(jump === 'year' ? item : year, jump === 'month' ? item - 1 : monthIndex)} />)}
    </View> : <>
      <View style={local.grid}>
        {'日一二三四五六'.split('').map((label) => <Text key={label} style={[styles.small, local.weekday]}>{label}</Text>)}
        {calendarDays(year, monthIndex).map((number, index) => {
          if (!number) return <View key={'empty' + index} style={local.dayCell} />;
          const date = localDay(new Date(year, monthIndex, number));
          const selected = day === date;
          const past = date < today;
          return <Pressable key={date} accessibilityRole="button" accessibilityLabel={date}
            accessibilityState={{ selected, disabled: past }} disabled={past}
            onPress={() => choose(date)} style={local.dayCell}>
            <View style={[local.day, (selected || date === today) && local.highlight]}>
              <Text style={[styles.body, past && local.past, selected && styles.strong]}>{number}</Text>
            </View>
          </Pressable>;
        })}
      </View>
    </>}
  </>;
}

function Clock({ value, choose }: { value: string; choose: (value: string) => void }) {
  const [initialHour, initialMinute] = value ? value.split(':').map(Number) : [19, 0];
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  return <>
    <View style={local.wheels}>
      <Wheel label="小时" values={hours} value={hour} change={(next) => {
        setHour(next);
        if (next === 24) setMinute(0);
      }} />
      <Wheel label="分钟" values={hour === 24 ? [0] : minutes} value={minute} change={setMinute} />
    </View>
    {hour === 24 && <Text style={styles.small}>24:00 为所选日期的次日零点</Text>}
    <Button label="确定时间" variant="primary" onPress={() => choose(padTime(hour) + ':' + padTime(minute))} />
  </>;
}

function Wheel({ label, values, value, change }: { label: string; values: number[]; value: number; change: (value: number) => void }) {
  const row = Math.max(42, Math.ceil(28 * useFontScale()));
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const reduceMotion = useAppearance().reduced;
  function select(next: number, animated = true) {
    const index = Math.max(0, Math.min(values.length - 1, next));
    change(values[index]);
    scroll.current?.scrollTo({ y: index * row, animated: animated && !reduceMotion });
  }
  return <View style={styles.grow}>
    <Text style={[styles.small, local.center]}>{label}</Text>
    <View style={{ height: row * 3, overflow: 'hidden' }}>
      <View pointerEvents="none" style={[local.wheelMark, { top: row, height: row }]} />
      <ScrollView key={values.length} ref={scroll} accessibilityLabel={label} accessibilityRole="adjustable"
        accessibilityValue={{ text: padTime(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => select(value + (nativeEvent.actionName === 'increment' ? 1 : -1))}
        nestedScrollEnabled showsVerticalScrollIndicator={false}
        snapToInterval={row} decelerationRate="fast"
        onLayout={() => scroll.current?.scrollTo({ y: value * row, animated: false })}
        contentContainerStyle={{ paddingVertical: row }} scrollEventThrottle={32}
        onScroll={({ nativeEvent }) => {
          const next = values[Math.max(0, Math.min(values.length - 1, Math.round(nativeEvent.contentOffset.y / row)))];
          if (next !== value) change(next);
        }}>
        {values.map((item) => <Pressable key={item} onPress={() => select(item)} style={[local.wheelRow, { height: row }]}>
          <Text style={item === value ? styles.strong : styles.muted}>{padTime(item)}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
  </View>;
}

const local = StyleSheet.create({
  field: { gap: 5 },
  trigger: { ...styles.row, ...styles.input, minHeight: 46 },
  pressed: { opacity: 0.72 },
  backdrop: { flex: 1, backgroundColor: '#19161E44', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  panel: { width: '100%', maxWidth: 348, borderRadius: radius.surface, backgroundColor: colors.panel, overflow: 'hidden', padding: 10 },
  pickerContent: { paddingHorizontal: 4, paddingBottom: 5, gap: 8 },
  header: { ...styles.row, paddingLeft: 8, justifyContent: 'space-between', gap: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 3 },
  weekday: { width: '14.2857%', textAlign: 'center', color: colors.quiet },
  dayCell: { width: '14.2857%', minHeight: 43, alignItems: 'center', justifyContent: 'center' },
  day: { minHeight: 40, width: '92%', alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  highlight: { backgroundColor: colors.lavender },
  past: { opacity: 0.42 },
  wheels: { ...styles.row, paddingHorizontal: 20, gap: 15 },
  wheelMark: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.lavender, borderRadius: radius.pill },
  wheelRow: { alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
