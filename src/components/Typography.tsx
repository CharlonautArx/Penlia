import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, forwardRef, useCallback, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeInput, useWindowDimensions, type TextInputProps, type TextProps } from 'react-native';
import { effectiveFontScale, readFontSize, type FontSize } from '../font-scale';

const storageKey = 'penlia.font-size.v1';
const Size = createContext<{ size: FontSize; save: (size: FontSize) => Promise<void> }>({ size: 1, save: async () => {} });
const Scale = createContext(1);
const Nested = createContext(false);
export const useFontSize = () => useContext(Size);
export const useFontScale = () => useContext(Scale);

export function TypographyProvider({ children }: { children: ReactNode }) {
  const [size, setSize] = useState<FontSize>(1);
  const requested = useRef(false);
  const writes = useRef(Promise.resolve());
  const save = useCallback((next: FontSize) => {
    requested.current = true;
    const pending = writes.current.then(async () => {
      await AsyncStorage.setItem(storageKey, String(next));
      setSize(next);
    });
    writes.current = pending.catch(() => {});
    return pending;
  }, []);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey).then((value) => {
      if (active && !requested.current && value !== null) setSize(readFontSize(Number(value)));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <Size.Provider value={{ size, save }}><FontPreview size={size}>{children}</FontPreview></Size.Provider>;
}

export function FontPreview({ size, children }: { size: FontSize; children: ReactNode }) {
  const { fontScale } = useWindowDimensions();
  return <Scale.Provider value={effectiveFontScale(size, fontScale)}>{children}</Scale.Provider>;
}

function adjusted(style: TextProps['style'], scale: number, nested: boolean) {
  const base = StyleSheet.flatten(style);
  const fontSize = base?.fontSize ?? (nested ? undefined : 14);
  const lineHeight = base?.lineHeight;
  return [
    fontSize !== undefined && { fontSize: Math.round(fontSize * scale * 10) / 10 },
    lineHeight !== undefined && { lineHeight: Math.ceil(lineHeight * scale) },
  ].filter(Boolean) as TextProps['style'];
}

function bounded(scale: number, max?: number | null) {
  return max && max >= 1 ? Math.min(scale, max) : scale;
}

export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function Text({ style, allowFontScaling, maxFontSizeMultiplier, ...props }, ref) {
  const scale = bounded(useFontScale(), maxFontSizeMultiplier);
  const nested = useContext(Nested);
  const active = allowFontScaling !== false && scale !== 1;
  return <Nested.Provider value={true}>
    <NativeText {...props} ref={ref} allowFontScaling={false} style={active ? [style, adjusted(style, scale, nested)] : style} />
  </Nested.Provider>;
});

export const TextInput = forwardRef<ComponentRef<typeof NativeInput>, TextInputProps>(function TextInput({ style, allowFontScaling, maxFontSizeMultiplier, ...props }, ref) {
  const scale = bounded(useFontScale(), maxFontSizeMultiplier);
  return <NativeInput {...props} ref={ref} allowFontScaling={false}
    style={allowFontScaling !== false && scale !== 1 ? [style, adjusted(style, scale, false)] : style} />;
});
