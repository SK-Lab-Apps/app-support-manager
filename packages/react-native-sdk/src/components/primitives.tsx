import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { SupportTheme } from '../theme';
import type { QueryStatus, QueryType } from '../types';
import { QUERY_TYPE_LABEL } from '../types';
import { AlertCircleIcon, ChatIcon, PlusCircleIcon } from './icons';

export function typeIcon(type: QueryType, color: string, size = 15): ReactNode {
  if (type === 'bug_report') return <AlertCircleIcon color={color} size={size} />;
  if (type === 'feature_request') return <PlusCircleIcon color={color} size={size} />;
  return <ChatIcon color={color} size={size} />;
}

export function typeColor(type: QueryType, theme: SupportTheme): string {
  if (type === 'bug_report') return theme.colors.statusDanger;
  if (type === 'feature_request') return theme.colors.statusProgress;
  return theme.colors.statusOpen;
}

export function typeBackground(type: QueryType, theme: SupportTheme): string {
  if (type === 'bug_report') return theme.colors.statusDangerBg;
  if (type === 'feature_request') return theme.colors.statusProgressBg;
  return theme.colors.statusOpenBg;
}

/** Tinted round chip holding a type icon — the anchor of every list row. */
export function TypeGlyph({
  type,
  theme,
  size = 36,
}: {
  type: QueryType;
  theme: SupportTheme;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: typeBackground(type, theme),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {typeIcon(type, typeColor(type, theme), size * 0.44)}
    </View>
  );
}

/** Status dot + label — same visual language as the dashboard. */
export function StatusIndicator({
  status,
  theme,
}: {
  status: QueryStatus;
  theme: SupportTheme;
}) {
  const color =
    status === 'open' ? theme.colors.statusOpen : theme.colors.statusResolved;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }}
      />
      <Text style={{ fontSize: 12, color }}>
        {status === 'open' ? 'Open' : 'Resolved'}
      </Text>
    </View>
  );
}

/** Pressable row with the standard press wash. */
export function PressableRow({
  onPress,
  children,
  theme,
  style,
  accessibilityLabel,
}: {
  onPress: () => void;
  children: ReactNode;
  theme: SupportTheme;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        { backgroundColor: pressed ? theme.colors.surfaceHover : 'transparent' },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Circular icon button — back, close, send. */
export function IconButton({
  onPress,
  children,
  theme,
  accessibilityLabel,
  size = 34,
  disabled,
  tone = 'surface',
}: {
  onPress: () => void;
  children: ReactNode;
  theme: SupportTheme;
  accessibilityLabel: string;
  size?: number;
  disabled?: boolean;
  tone?: 'surface' | 'accent';
}) {
  const accent = tone === 'accent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
        backgroundColor: accent
          ? pressed
            ? theme.colors.accentHover
            : theme.colors.accent
          : pressed
            ? theme.colors.surfaceActive
            : theme.colors.surface,
        borderWidth: accent ? 0 : 1,
        borderColor: theme.colors.border,
      })}
    >
      {children}
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  theme,
  fullWidth,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  theme: SupportTheme;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => ({
        height: 44,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        paddingHorizontal: 18,
        borderRadius: theme.radii.control,
        backgroundColor: pressed
          ? theme.colors.accentHover
          : theme.colors.accent,
        opacity: disabled ? 0.45 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text
        style={{
          color: theme.colors.accentForeground,
          fontSize: 14,
          fontWeight: '600',
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  theme,
}: {
  label: string;
  onPress: () => void;
  theme: SupportTheme;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: 38,
        paddingHorizontal: 16,
        borderRadius: theme.radii.control,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed
          ? theme.colors.surfaceHover
          : theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text style={{ color: theme.colors.textPrimary, fontSize: 13, fontWeight: '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The count pill on a thread row. */
export function UnreadPill({
  count,
  theme,
}: {
  count: number;
  theme: SupportTheme;
}) {
  return (
    <View
      style={{
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 11,
          lineHeight: 14,
          fontWeight: '700',
          color: theme.colors.accentForeground,
          fontVariant: ['tabular-nums'],
        }}
      >
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

export function SectionLabel({
  children,
  theme,
  style,
}: {
  children: ReactNode;
  theme: SupportTheme;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      style={[
        {
          fontSize: 11,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: theme.colors.textTertiary,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Small muted icon + one line — no illustrations. */
export function EmptyState({
  message,
  hint,
  theme,
  icon,
}: {
  message: string;
  hint?: string;
  theme: SupportTheme;
  icon?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 44, paddingHorizontal: 32, gap: 10 }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        {icon ?? <ChatIcon color={theme.colors.textTertiary} size={18} />}
      </View>
      <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.textPrimary }}>
        {message}
      </Text>
      {hint !== undefined && (
        <Text
          style={{
            fontSize: 13,
            lineHeight: 19,
            color: theme.colors.textSecondary,
            textAlign: 'center',
          }}
        >
          {hint}
        </Text>
      )}
    </View>
  );
}

/** Inline failure state with retry — errors are designed, not toasted. */
export function ErrorState({
  message,
  onRetry,
  theme,
}: {
  message: string;
  onRetry: () => void;
  theme: SupportTheme;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
      <Text style={{ fontSize: 14, color: theme.colors.textSecondary }}>
        {message}
      </Text>
      <SecondaryButton label="Try again" onPress={onRetry} theme={theme} />
    </View>
  );
}

/** Pulsing block matching final layout dimensions. */
export function SkeletonBlock({
  width,
  height,
  theme,
  radius,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  theme: SupportTheme;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radii.control,
          backgroundColor: theme.colors.surfaceActive,
          opacity,
        },
        style,
      ]}
    />
  );
}

export const textStyles = {
  title: (theme: SupportTheme): TextStyle => ({
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: theme.colors.textPrimary,
  }),
  heading: (theme: SupportTheme): TextStyle => ({
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: theme.colors.textPrimary,
  }),
  body: (theme: SupportTheme): TextStyle => ({
    fontSize: 15,
    color: theme.colors.textPrimary,
    lineHeight: 21,
  }),
  secondary: (theme: SupportTheme): TextStyle => ({
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
  }),
  meta: (theme: SupportTheme): TextStyle => ({
    fontSize: 11.5,
    color: theme.colors.textTertiary,
    fontVariant: ['tabular-nums'],
  }),
};

export function TypeChipView({
  type,
  theme,
}: {
  type: QueryType;
  theme: SupportTheme;
}) {
  const color = typeColor(type, theme);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: theme.radii.pill,
        backgroundColor: typeBackground(type, theme),
        alignSelf: 'flex-start',
      }}
    >
      {typeIcon(type, color, 11)}
      <Text style={{ fontSize: 11.5, fontWeight: '600', color }}>
        {QUERY_TYPE_LABEL[type]}
      </Text>
    </View>
  );
}
