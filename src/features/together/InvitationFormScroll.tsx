import { useRef, type ComponentRef } from 'react';
import * as ReactNative from 'react-native';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { KeyboardInsets } from '../../components/keyboard-insets';
import { styles } from '../../theme';

export function InvitationFormScroll(props: ScrollViewProps) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const viewport = useRef<ComponentRef<typeof View>>(null);
  const offset = useRef(0);

  function revealFocusedInput() {
    // Named TextInput imports are transformed to the app's visual typography wrapper.
    const focus = ReactNative.TextInput.State;
    const input = focus.currentlyFocusedInput();
    if (!input) return;
    viewport.current?.measureInWindow((_x, top, _w, height) => {
      input.measureInWindow((_left, y, _width, inputHeight) => {
        const overlap = y + inputHeight + 12 - (top + height);
        if (overlap > 0 && input === focus.currentlyFocusedInput())
          scroll.current?.scrollTo({ y: offset.current + overlap, animated: false });
      });
    });
  }

  return (
    <KeyboardInsets>
      <View ref={viewport} collapsable={false} style={styles.grow} onLayout={revealFocusedInput}>
        <ScrollView
          {...props}
          ref={scroll}
          scrollEventThrottle={16}
          onScroll={(event) => {
            offset.current = event.nativeEvent.contentOffset.y;
            props.onScroll?.(event);
          }}
        />
      </View>
    </KeyboardInsets>
  );
}
