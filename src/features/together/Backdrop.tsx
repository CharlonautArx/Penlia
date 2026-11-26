import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

// A quiet, locally drawn horizon for invitations without a photograph.
export function Backdrop() {
  return (
    <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 480 350" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="sky" x1=".1" y1="0" x2=".8" y2="1">
            <Stop offset="0" stopColor="#85AAAE" />
            <Stop offset=".48" stopColor="#D7CBB2" />
            <Stop offset="1" stopColor="#E8AD97" />
          </LinearGradient>
          <RadialGradient id="light" cx="75%" cy="22%" rx="55%" ry="62%">
            <Stop offset="0" stopColor="#FDEACD" />
            <Stop offset="1" stopColor="#F6D7B3" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="hill" x1="0%" y1="0%" x2="80%" y2="100%">
            <Stop offset="0" stopColor="#A4AD9C" />
            <Stop offset="1" stopColor="#66807D" />
          </LinearGradient>
        </Defs>
        <Rect width="480" height="350" fill="url(#sky)" />
        <Rect width="480" height="350" fill="url(#light)" />
        <Path d="M-40 196 Q70 150 183 170 T510 117 L510 355 H-40Z" fill="#BBC0A9" />
        <Path d="M-40 167 Q66 179 158 207 T510 154 L510 355 H-40Z" fill="url(#hill)" />
        <Path d="M-40 244 Q99 177 240 212 T510 220 L510 355 H-40Z" fill="#637E77" />
      </Svg>
    </View>
  );
}
