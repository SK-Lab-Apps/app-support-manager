// The SDK consumes the same design tokens as the admin dashboard, so both
// surfaces look like one product. On top of those it adds the few values
// that only exist on mobile: sheet/bubble radii and the elevation used by
// the launcher and the sheet (the web side gets those from CSS).
import {
  darkColors,
  lightColors,
  motion,
  radii,
  spacing,
  type ThemeColors,
} from '@appsupportkit/design-tokens';
import type { ViewStyle } from 'react-native';
import type { ThemeName } from './types';

/** Rounder than the dashboard: touch targets read better with more radius. */
export const supportRadii = {
  ...radii,
  control: 10,
  card: 14,
  cardLg: 18,
  /** Message bubbles. */
  bubble: 18,
  /** The tight corner on a bubble's sender side. */
  bubbleTail: 6,
  sheet: 24,
  pill: 999,
} as const;

export interface SupportShadows {
  /** Floating launcher button. */
  launcher: ViewStyle;
  /** The bottom sheet itself. */
  sheet: ViewStyle;
  /** Unread badge, so it lifts off the button. */
  badge: ViewStyle;
}

/**
 * The launcher sits on the host app's own background rather than on an SDK
 * surface, so the two themes need different treatment: on near-black a
 * solid fill needs a hairline to separate from the background and a black
 * shadow, while on white the accent-tinted shadow does that work and a
 * borderless mark has to be darkened to stay legible.
 */
export interface LauncherPalette {
  /** Hairline drawn over the solid fill. */
  solidRing: string;
  /** Mark color for the borderless (minimal) variant. */
  minimalMark: string;
}

export interface SupportTheme {
  name: ThemeName;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof supportRadii;
  motion: typeof motion;
  shadows: SupportShadows;
  launcher: LauncherPalette;
}

// Color helpers come first: the themes below are built at module load, so
// anything they reach for has to already be initialized. (A `const` used
// before its definition survives tsc but lands as `undefined` on Hermes.)
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function parseHex(color: string): [number, number, number] | null {
  const match = HEX.exec(color.trim());
  const digits = match?.[1];
  if (digits === undefined) return null;
  const hex =
    digits.length === 3
      ? digits
          .split('')
          .map((c) => c + c)
          .join('')
      : digits;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function mix([r, g, b]: [number, number, number], target: number, amount: number) {
  const channel = (c: number) => Math.round(c + (target - c) * amount);
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}

function shadowsFor(name: ThemeName, accent: string): SupportShadows {
  const dark = name === 'dark';
  return {
    launcher: {
      // Tinting the launcher's shadow with the accent is what makes it read
      // as lifted rather than pasted on.
      shadowColor: dark ? '#000000' : accent,
      shadowOpacity: dark ? 0.45 : 0.3,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    sheet: {
      shadowColor: '#000000',
      shadowOpacity: dark ? 0.5 : 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: -6 },
      elevation: 24,
    },
    badge: {
      shadowColor: '#000000',
      shadowOpacity: 0.25,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 3,
    },
  };
}

function launcherFor(name: ThemeName, accent: string): LauncherPalette {
  const rgb = parseHex(accent);
  return {
    solidRing:
      name === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.06)',
    // On a dark app background the raw accent is too close to the surface
    // to read as a glyph; lift it toward white.
    minimalMark:
      name === 'dark' && rgb !== null ? mix(rgb, 255, 0.35) : accent,
  };
}

function buildTheme(name: ThemeName, colors: ThemeColors): SupportTheme {
  return {
    name,
    colors,
    spacing,
    radii: supportRadii,
    motion,
    shadows: shadowsFor(name, colors.accent),
    launcher: launcherFor(name, colors.accent),
  };
}

export const supportDarkTheme: SupportTheme = buildTheme('dark', darkColors);
export const supportLightTheme: SupportTheme = buildTheme('light', lightColors);

/**
 * Derives the accent family from a single brand color: a pressed shade, the
 * 12% wash used behind chips and own-message bubbles, and a foreground that
 * stays legible on top (dark text on light brands, white on dark ones).
 */
function withAccent(theme: SupportTheme, accent: string): SupportTheme {
  const rgb = parseHex(accent);
  if (!rgb) return theme;
  const [r, g, b] = rgb;
  // Relative luminance, sRGB coefficients — good enough to pick a foreground.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const colors: ThemeColors = {
    ...theme.colors,
    accent,
    accentHover: mix(rgb, theme.name === 'dark' ? 255 : 0, 0.12),
    accentMuted: `rgba(${r}, ${g}, ${b}, 0.12)`,
    accentForeground: luminance > 0.62 ? '#111113' : '#FFFFFF',
    statusOpen: accent,
    statusOpenBg: `rgba(${r}, ${g}, ${b}, 0.10)`,
    focusRing: accent,
  };
  return {
    ...theme,
    colors,
    shadows: shadowsFor(theme.name, accent),
    launcher: launcherFor(theme.name, accent),
  };
}

/**
 * @param name  "light" | "dark" (default dark).
 * @param accentColor Optional brand color (hex) replacing the default accent.
 */
export function resolveTheme(
  name: ThemeName | undefined,
  accentColor?: string,
): SupportTheme {
  const base = name === 'light' ? supportLightTheme : supportDarkTheme;
  return accentColor ? withAccent(base, accentColor) : base;
}
