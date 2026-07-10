import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
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

/** Pressable row with the standard hover/press wash. */
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

export function PrimaryButton({
  label,
  onPress,
  disabled,
  theme,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  theme: SupportTheme;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: 14,
        borderRadius: theme.radii.control,
        backgroundColor: pressed
          ? theme.colors.accentHover
          : theme.colors.accent,
        opacity: disabled ? 0.5 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Text
        style={{
          color: theme.colors.accentForeground,
          fontSize: 13,
          fontWeight: '500',
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
        height: 32,
        paddingHorizontal: 12,
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
      <Text style={{ color: theme.colors.textPrimary, fontSize: 12, fontWeight: '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Small muted icon + one line — no illustrations. */
export function EmptyState({
  message,
  theme,
  icon,
}: {
  message: string;
  theme: SupportTheme;
  icon?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
      {icon ?? <ChatIcon color={theme.colors.textTertiary} size={16} />}
      <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
        {message}
      </Text>
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
    <View style={{ alignItems: 'center', paddingVertical: 32, gap: 10 }}>
      <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
        {message}
      </Text>
      <SecondaryButton label="Retry" onPress={onRetry} theme={theme} />
    </View>
  );
}

/** Pulsing block matching final layout dimensions. */
export function SkeletonBlock({
  width,
  height,
  theme,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  theme: SupportTheme;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 600,
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
          borderRadius: theme.radii.control,
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
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: theme.colors.textPrimary,
  }),
  body: (theme: SupportTheme): TextStyle => ({
    fontSize: 14,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  }),
  secondary: (theme: SupportTheme): TextStyle => ({
    fontSize: 13,
    color: theme.colors.textSecondary,
  }),
  meta: (theme: SupportTheme): TextStyle => ({
    fontSize: 11,
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
  const bg =
    type === 'bug_report'
      ? theme.colors.statusDangerBg
      : type === 'feature_request'
        ? theme.colors.statusProgressBg
        : theme.colors.statusOpenBg;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: theme.radii.control,
        backgroundColor: bg,
        alignSelf: 'flex-start',
      }}
    >
      {typeIcon(type, color, 11)}
      <Text style={{ fontSize: 11, fontWeight: '500', color }}>
        {QUERY_TYPE_LABEL[type]}
      </Text>
    </View>
  );
}
