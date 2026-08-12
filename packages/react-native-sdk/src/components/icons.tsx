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

/** Globe: circle, equator, and a pill standing in for the meridian curve. */
export function GlobeIcon({ color, size = 16 }: { color: string; size?: number }) {
  const inner = size - STROKE * 2;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: STROKE,
        borderColor: color,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: inner,
          height: STROKE,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.52,
          height: inner,
          borderWidth: STROKE,
          borderColor: color,
          borderRadius: size * 0.26,
        }}
      />
    </View>
  );
}

/** Send arrow: a stem plus a chevron head, both centered on the same axis. */
export function ArrowUpIcon({ color, size = 16 }: { color: string; size?: number }) {
  const stroke = STROKE + 0.4;
  const head = size * 0.44;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          width: stroke,
          height: size * 0.66,
          borderRadius: stroke,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          // Rotating a square by 45° lifts its apex by ~0.207 × side, so
          // offset by that to land the point on top of the stem.
          top: size * 0.17 + head * 0.207,
          width: head,
          height: head,
          borderTopWidth: stroke,
          borderLeftWidth: stroke,
          borderTopLeftRadius: stroke,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/**
 * The chat-bubble mark on the launcher button: a filled bubble with the
 * dots knocked out in the button's own fill color. Solid shapes read far
 * better than 1.5px strokes at launcher size and on top of a color fill.
 */
export function ChatBubbleMark({
  color,
  dotColor,
  size = 24,
}: {
  color: string;
  /** The surface behind the mark — the dots are punched out in this color. */
  dotColor: string;
  size?: number;
}) {
  const bubbleHeight = size * 0.82;
  const dot: ViewStyle = {
    width: size * 0.13,
    height: size * 0.13,
    borderRadius: size,
    backgroundColor: dotColor,
  };
  return (
    <View style={{ width: size, height: size, justifyContent: 'flex-start' }}>
      <View
        style={{
          width: size,
          height: bubbleHeight,
          borderRadius: size * 0.33,
          backgroundColor: color,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: size * 0.115,
        }}
      >
        <View style={dot} />
        <View style={dot} />
        <View style={dot} />
      </View>
      {/* Tail, drawn as a border triangle so it needs no svg. */}
      <View
        style={{
          position: 'absolute',
          left: size * 0.22,
          top: bubbleHeight - 1,
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.09,
          borderRightWidth: size * 0.16,
          borderTopWidth: size * 0.2,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: color,
        }}
      />
    </View>
  );
}
