import { Backdrop } from './Backdrop';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as UI from '../../components/ui';
import { useAppearance } from '../../components/appearance';
import { colors, contentWidth, styles, type } from '../../theme';
import { useTogether } from './navigation';
export * from '../../components/ui';

function useOpaque() {
  const [opaque, set] = useState(true);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const mq = window.matchMedia(
        '(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)',
      );
      const update = () => set(mq.matches);
      update();
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    let live = true;
    const update = (value: boolean) => {
      if (live) set(value);
    };
    const ios = Platform.OS === 'ios';
    void (
      ios ? AccessibilityInfo.isReduceTransparencyEnabled() : AccessibilityInfo.isHighTextContrastEnabled()
    )
      .then(update)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      ios ? 'reduceTransparencyChanged' : 'highTextContrastChanged',
      update,
    );
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return opaque;
}

type Target = React.RefObject<ComponentRef<typeof View> | null>;
const SurfaceContext = createContext<{ target: Target; solid: boolean } | null>(null);

function SurfaceProvider({ target, children }: { target: Target; children: ReactNode }) {
  const opaque = useOpaque();
  return (
    <SurfaceContext.Provider
      value={{ target, solid: opaque || (Platform.OS === 'android' && Number(Platform.Version) < 31) }}
    >
      {children}
    </SurfaceContext.Provider>
  );
}

export function Sheet(props: ComponentProps<typeof UI.Sheet>) {
  const material = useContext(SurfaceContext);
  const { scheme } = useAppearance();
  if (!material) return <UI.Sheet {...props} />;
  const dark = scheme === 'dark';
  return (
    <UI.Sheet
      {...props}
      avoidKeyboard={props.avoidKeyboard ?? true}
      surface={
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: material.solid
                ? colors.panel
                : dark
                  ? 'rgba(26,34,37,.83)'
                  : 'rgba(248,250,248,.84)',
              borderTopWidth: 1,
              borderTopColor: dark ? '#8C9D9160' : '#FFFFFFED',
            },
          ]}
        >
          {!material.solid && (
            <BlurView
              intensity={48}
              tint={dark ? 'dark' : 'light'}
              blurTarget={material.target}
              blurMethod="dimezisBlurViewSdk31Plus"
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>
      }
    />
  );
}

export function Button(props: ComponentProps<typeof UI.Button>) {
  const material = useContext(SurfaceContext);
  const { scheme } = useAppearance();
  if (!material || props.variant === 'danger' || props.variant === 'quiet') return <UI.Button {...props} />;
  const primary = props.variant !== 'soft',
    dark = scheme === 'dark';
  const tint = dark
    ? (['#536961', '#394B49', '#354341'] as const)
    : (['#E2EFE9', '#DDEAE6', '#D2E1E0'] as const);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      style={({ pressed }) => [
        local.action,
        { backgroundColor: colors.panel, opacity: props.disabled ? 0.49 : pressed ? 0.82 : 1 },
      ]}
    >
      {primary && !material.solid && (
        <LinearGradient
          colors={tint}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {props.icon && <UI.Icon name={props.icon} size={18} />}
      <Text style={[styles.strong, { flexShrink: 1, textAlign: 'center' }]}>{props.label}</Text>
    </Pressable>
  );
}

function Navigation({
  target,
  title,
  back,
  actions,
}: Pick<ComponentProps<typeof UI.Screen>, 'title' | 'back' | 'actions'> & {
  target: React.RefObject<ComponentRef<typeof View> | null>;
}) {
  const opaque = useOpaque();
  const { scheme } = useAppearance();
  const solid = opaque || (Platform.OS === 'android' && Number(Platform.Version) < 31);
  return (
    <View style={[local.bar, solid && { backgroundColor: colors.panel }]}>
      {!solid && (
        <BlurView
          pointerEvents="none"
          intensity={58}
          tint={scheme === 'dark' ? 'dark' : 'light'}
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          style={StyleSheet.absoluteFill}
        />
      )}
      {back && <UI.IconButton label="返回" icon="chevron-back" onPress={back} />}
      <Text accessibilityRole="header" style={[styles.grow, styles.strong]}>
        {title}
      </Text>
      {actions}
    </View>
  );
}

export function Screen(props: ComponentProps<typeof UI.Screen>) {
  const active = useTogether();
  const target = useRef<ComponentRef<typeof View>>(null);
  const [height, setHeight] = useState(52);
  if (!active) return <UI.Screen {...props} />;
  const scrollProps: ComponentProps<typeof ScrollView> = {
    onScroll: props.onScroll,
    keyboardShouldPersistTaps: 'handled',
    showsVerticalScrollIndicator: false,
    contentContainerStyle: [
      local.flow,
      props.fill && { flexGrow: 1 },
      props.inset === false && { paddingHorizontal: 0 },
      { paddingTop: height + 22 },
    ],
    refreshControl: props.onRefresh ? (
      <RefreshControl
        progressViewOffset={height}
        refreshing={!!props.refreshing}
        onRefresh={props.onRefresh}
      />
    ) : undefined,
    children: props.children,
  };
  return (
    <SurfaceProvider target={target}>
      <SafeAreaView style={local.page}>
        <View style={styles.grow}>
          <BlurTargetView ref={target} style={styles.grow}>
            {props.renderScroll ? props.renderScroll(scrollProps) : <ScrollView {...scrollProps} />}
          </BlurTargetView>
          <View style={local.overlay} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
            <Navigation target={target} title={props.title} actions={props.actions} back={props.back} />
          </View>
        </View>
      </SafeAreaView>
    </SurfaceProvider>
  );
}

export function Invitation({
  title,
  detail,
  cover,
  children,
}: {
  title: string;
  detail: string;
  cover?: string;
  children?: ReactNode;
}) {
  return (
    <View style={local.invitation}>
      {!cover && <Backdrop />}
      {!!cover && (
        <Image
          source={{ uri: 'data:image/jpeg;base64,' + cover }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      <LinearGradient
        colors={['transparent', '#142D2D04', '#152B2BE8']}
        locations={[0, 0.38, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={local.caption}>
        <Text style={local.meta}>{detail}</Text>
        <Text accessibilityRole="header" style={local.title}>
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}

export function Segments<T extends string>(props: {
  options: readonly { id: T; label: string }[];
  value?: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const active = useTogether();
  if (!active) return <UI.Segments {...props} />;
  return (
    <View accessibilityRole="tablist" accessibilityLabel={props.label} style={local.segments}>
      {props.options.map((option) => (
        <Pressable
          key={option.id}
          accessibilityRole="tab"
          accessibilityState={{ selected: option.id === props.value }}
          onPress={() => props.onChange(option.id)}
          style={({ pressed }) => [
            local.segment,
            option.id === props.value && local.selected,
            pressed && { opacity: 0.76 },
          ]}
        >
          <Text style={option.id === props.value ? styles.strong : styles.muted}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const local = StyleSheet.create({
  action: {
    minHeight: 46,
    paddingHorizontal: 17,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderTopColor: '#FFFFFF99',
  },
  segments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
    gap: 3,
    borderRadius: 20,
    backgroundColor: colors.backdrop,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: {
    flexGrow: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  selected: { backgroundColor: colors.panel, borderTopWidth: 1, borderTopColor: '#FFFFFF85' },
  page: { flex: 1, backgroundColor: colors.backdrop },
  flow: {
    width: '100%',
    maxWidth: contentWidth,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 16,
  },
  overlay: { position: 'absolute', top: 6, left: 12, right: 12, maxWidth: contentWidth, alignSelf: 'center' },
  bar: {
    ...styles.row,
    minHeight: 50,
    gap: 4,
    borderRadius: 22,
    overflow: 'hidden',
    paddingRight: 12,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderTopColor: '#ffffff88',
  },
  invitation: {
    minHeight: 265,
    borderRadius: 28,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: '#344747',
  },
  caption: { padding: 23, gap: 7 },
  title: { ...type.display, color: '#fff' },
  meta: { ...type.support, color: '#FFFFFF' },
});
