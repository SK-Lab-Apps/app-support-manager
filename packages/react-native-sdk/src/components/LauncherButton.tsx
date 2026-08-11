// The launcher: the one piece of the SDK that lives inside the host app's
// own UI, so it has to look intentional next to anything. Three variants
// cover the placements that actually occur — a floating action button, a
// bordered button in a header, and a bare icon in a toolbar.
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { SupportTheme } from '../theme';
import type { LauncherVariant } from '../types';
import { ChatBubbleMark } from './icons';

const PRESS_SCALE = 0.93;

/** Counts stay legible: three digits in a pill is not a design. */
function badgeLabel(unread: number): string {
  return unread > 99 ? '99+' : String(unread);
}

export function LauncherButton({
  theme,
  unread,
  variant = 'solid',
  size = 52,
  label,
  style,
  onPress,
}: {
  theme: SupportTheme;
  unread: number;
  variant?: LauncherVariant;
  size?: number;
  /** Renders a pill with text next to the mark instead of a circle. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const previousUnread = useRef(unread);

  // A new reply pulses the halo twice, then stops. Enough to catch the eye
  // on the way past; not a permanently animating element in someone's app.
  useEffect(() => {
    if (unread > previousUnread.current) {
      pulse.setValue(0);
      const animation = Animated.loop(
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        { iterations: 2 },
      );
      animation.start(() => pulse.setValue(0));
      previousUnread.current = unread;
      return () => animation.stop();
    }
    previousUnread.current = unread;
    return undefined;
  }, [unread, pulse]);

  const press = (to: number) =>
    Animated.timing(scale, {
      toValue: to,
      duration: to === 1 ? theme.motion.base : theme.motion.fast,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

  const solid = variant === 'solid';
  const soft = variant === 'soft';
  const fill = solid
    ? theme.colors.accent
    : soft
      ? theme.colors.surface
      : 'transparent';
  const markColor = solid
    ? theme.colors.accentForeground
    : soft
      ? theme.colors.accent
      : theme.launcher.minimalMark;
  // Dots are punched out of the bubble in whatever sits behind the mark —
  // the button's own fill, or the app background when there isn't one.
  const markHoleColor = solid
    ? theme.colors.accent
    : soft
      ? theme.colors.surface
      : theme.colors.bg;
  // Dark: a hairline separates the fill from a near-black app background.
  // Light: the accent-tinted shadow already does that, so the ring only has
  // to keep the edge from looking soft.
  const border = solid
    ? { borderWidth: 1, borderColor: theme.launcher.solidRing }
    : soft
      ? { borderWidth: 1, borderColor: theme.colors.border }
      : { borderWidth: 0, borderColor: 'transparent' };
  const badgeBg = solid ? theme.colors.accentForeground : theme.colors.accent;
  const badgeFg = solid ? theme.colors.accent : theme.colors.accentForeground;

  const height = label ? Math.max(44, size * 0.84) : size;
  const markSize = Math.round(size * (label ? 0.36 : 0.42));

  return (
    <Animated.View
      style={[{ transform: [{ scale }] }, style]}
      // The halo and badge sit outside the button's bounds.
      pointerEvents="box-none"
    >
      {unread > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: label ? undefined : size,
            right: label ? 0 : undefined,
            height,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.accent,
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.28, 0],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.5],
                }),
              },
            ],
          }}
        />
      )}

      <Pressable
        onPress={onPress}
        onPressIn={() => press(PRESS_SCALE)}
        onPressOut={() => press(1)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          unread > 0
            ? `Support, ${unread} unread ${unread === 1 ? 'reply' : 'replies'}`
            : 'Support'
        }
        style={{
          height,
          width: label ? undefined : size,
          paddingHorizontal: label ? 18 : 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          borderRadius: theme.radii.pill,
          backgroundColor: fill,
          ...border,
          ...(variant === 'minimal' ? null : theme.shadows.launcher),
        }}
      >
        <ChatBubbleMark color={markColor} dotColor={markHoleColor} size={markSize} />
        {label !== undefined && (
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              letterSpacing: -0.1,
              color: solid ? theme.colors.accentForeground : theme.colors.textPrimary,
            }}
          >
            {label}
          </Text>
        )}
      </Pressable>

      {unread > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -5,
            right: -5,
            minWidth: 19,
            height: 19,
            borderRadius: theme.radii.pill,
            paddingHorizontal: 5,
            backgroundColor: badgeBg,
            alignItems: 'center',
            justifyContent: 'center',
            ...theme.shadows.badge,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              lineHeight: 14,
              fontWeight: '700',
              color: badgeFg,
              fontVariant: ['tabular-nums'],
            }}
          >
            {badgeLabel(unread)}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
