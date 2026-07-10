// Minimal geometric icons built from Views — keeps the SDK free of
// react-native-svg / icon-font dependencies. 1.5px strokes to match the
// Lucide icons used on the web dashboard.
import { View, type ViewStyle } from 'react-native';

const STROKE = 1.5;

export function ChatIcon({ color, size = 16 }: { color: string; size?: number }) {
  const dot: ViewStyle = {
    width: size * 0.11,
    height: size * 0.11,
    borderRadius: size,
    backgroundColor: color,
  };
  return (
    <View
      style={{
        width: size,
        height: size * 0.8,
        borderWidth: STROKE,
        borderColor: color,
        borderRadius: size * 0.25,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size * 0.11,
      }}
    >
      <View style={dot} />
      <View style={dot} />
      <View style={dot} />
    </View>
  );
}

export function PlusCircleIcon({ color, size = 16 }: { color: string; size?: number }) {
  const bar = size * 0.45;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: STROKE,
        borderColor: color,
        borderRadius: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: bar, height: STROKE, backgroundColor: color }} />
      <View
        style={{
          width: STROKE,
          height: bar,
          backgroundColor: color,
          position: 'absolute',
        }}
      />
    </View>
  );
}

export function AlertCircleIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: STROKE,
        borderColor: color,
        borderRadius: size,
        alignItems: 'center',
        paddingTop: size * 0.2,
      }}
    >
      <View style={{ width: STROKE, height: size * 0.32, backgroundColor: color }} />
      <View
        style={{
          width: STROKE + 0.5,
          height: STROKE + 0.5,
          borderRadius: 2,
          backgroundColor: color,
          marginTop: size * 0.09,
        }}
      />
    </View>
  );
}

/** Chevron built from two borders, rotated. direction: right | left | down. */
export function Chevron({
  color,
  size = 10,
  direction = 'right',
}: {
  color: string;
  size?: number;
  direction?: 'right' | 'left' | 'down';
}) {
  const rotation =
    direction === 'right' ? '-45deg' : direction === 'left' ? '135deg' : '45deg';
  return (
    <View
      style={{
        width: size * 0.7,
        height: size * 0.7,
        borderRightWidth: STROKE,
        borderBottomWidth: STROKE,
        borderColor: color,
        transform: [{ rotate: rotation }],
      }}
    />
  );
}

export function CloseIcon({ color, size = 14 }: { color: string; size?: number }) {
  const bar: ViewStyle = {
    position: 'absolute',
    width: size,
    height: STROKE,
    backgroundColor: color,
    borderRadius: 1,
  };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[bar, { transform: [{ rotate: '45deg' }] }]} />
      <View style={[bar, { transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

export function CheckIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size * 0.9,
        height: size * 0.5,
        borderLeftWidth: STROKE + 0.5,
        borderBottomWidth: STROKE + 0.5,
        borderColor: color,
        transform: [{ rotate: '-45deg' }],
        marginBottom: size * 0.15,
      }}
    />
  );
}

/** The chat-bubble mark on the floating support button. */
export function BubbleMark({ color, size = 20 }: { color: string; size?: number }) {
  const dot: ViewStyle = {
    width: size * 0.12,
    height: size * 0.12,
    borderRadius: size,
    backgroundColor: color,
  };
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <View
        style={{
          width: size,
          height: size * 0.78,
          borderWidth: STROKE + 0.25,
          borderColor: color,
          borderRadius: size * 0.28,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: size * 0.1,
        }}
      >
        <View style={dot} />
        <View style={dot} />
        <View style={dot} />
      </View>
      <View
        style={{
          width: size * 0.22,
          height: size * 0.22,
          borderLeftWidth: STROKE + 0.25,
          borderBottomWidth: STROKE + 0.25,
          borderColor: color,
          marginLeft: size * 0.18,
          marginTop: -STROKE,
          transform: [{ skewX: '-12deg' }],
        }}
      />
    </View>
  );
}
