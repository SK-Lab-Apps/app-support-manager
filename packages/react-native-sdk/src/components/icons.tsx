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
 * Geometry of the product mark on a 24-unit square: two overlapping speech
 * bubbles, the front one cut free of the back by a gap. Kept to rounded
 * rects and right-triangle tails so Views can draw it with no svg; the
 * dashboard's LogoMark (apps/web/components/logo.tsx) draws the same numbers.
 */
const MARK = {
  back: { x: 1, y: 2.5, w: 14.5, h: 11, r: 4.5 },
  /** Right angle at top-left, apex straight down. */
  backTail: { x: 3.5, y: 12.25, w: 4.25, h: 4.25 },
  front: { x: 8.5, y: 8.75, w: 14.5, h: 10.5, r: 4.5 },
  /** Right angle at top-right, apex straight down. */
  frontTail: { x: 16.5, y: 18.25, w: 4.25, h: 4.25 },
  gap: 2,
} as const;

/**
 * The mark on the launcher button. Solid shapes read far better than 1.5px
 * strokes at launcher size and on top of a color fill.
 */
export function ConversationMark({
  color,
  holeColor,
  size = 24,
}: {
  color: string;
  /** The surface behind the mark — the gap between the bubbles is cut in this color. */
  holeColor: string;
  size?: number;
}) {
  const u = size / 24;
  const rect = (
    o: { x: number; y: number; w: number; h: number; r: number },
    fill: string,
    grow = 0,
  ): ViewStyle => ({
    position: 'absolute',
    left: (o.x - grow) * u,
    top: (o.y - grow) * u,
    width: (o.w + grow * 2) * u,
    height: (o.h + grow * 2) * u,
    borderRadius: (o.r + grow) * u,
    backgroundColor: fill,
  });
  // A zero-size box whose top border is colored and one side border is
  // transparent renders as a right triangle; which side picks the corner.
  const tail = (
    o: { x: number; y: number; w: number; h: number },
    side: 'left' | 'right',
  ): ViewStyle => ({
    position: 'absolute',
    left: o.x * u,
    top: o.y * u,
    width: 0,
    height: 0,
    borderTopWidth: o.h * u,
    borderTopColor: color,
    ...(side === 'left'
      ? { borderRightWidth: o.w * u, borderRightColor: 'transparent' }
      : { borderLeftWidth: o.w * u, borderLeftColor: 'transparent' }),
  });

  return (
    <View style={{ width: size, height: size }}>
      <View style={rect(MARK.back, color)} />
      <View style={tail(MARK.backTail, 'left')} />
      <View style={rect(MARK.front, holeColor, MARK.gap)} />
      <View style={rect(MARK.front, color)} />
      <View style={tail(MARK.frontTail, 'right')} />
    </View>
  );
}
