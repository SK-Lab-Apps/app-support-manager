// The SDK consumes the same design tokens as the admin dashboard, so both
// surfaces look like one product. On top of those it adds the few values
// that only exist on mobile: sheet/bubble radii, the elevation used by the
// launcher and the sheet (the web side gets those from CSS), and a re-cut of
// the surfaces and text ramp for a sheet held at arm's length (see
// SHEET_OVERRIDES).
import {
  darkColors,
  lightColors,
  motion,
  radii,
  spacing,
  type ThemeColors,
} from '@appsupportkit/design-tokens';
import type { ViewStyle } from 'react-native';
import type { AccentColor, ThemeName } from './types';

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

export interface SupportColors extends ThemeColors {
  /** The sheet's own background — the layer every screen is drawn on. */
  sheet: string;
  /**
   * The accent where it is small text — status labels, the "New" divider.
   * The fill color can sit at 3:1; text needs 4.5:1 on the sheet and on the
   * cards over it, so this is the accent nudged as far as that takes.
   */
  accentText: string;
}

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
  colors: SupportColors;
  spacing: typeof spacing;
  radii: typeof supportRadii;
  motion: typeof motion;
  shadows: SupportShadows;
  launcher: LauncherPalette;
}

// Color helpers come first: the themes below are built at module load, so
// anything they reach for has to already be initialized. (A `const` used
// before its definition survives tsc but lands as `undefined` on Hermes.)
type Rgb = [number, number, number];

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const WHITE: Rgb = [255, 255, 255];
/** Foreground for light accents — the dashboard's near-black, not pure black. */
const INK = '#111113';
const INK_RGB: Rgb = [17, 17, 19];

function parseHex(color: string): Rgb | null {
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

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function mixRgb([r, g, b]: Rgb, target: number, amount: number): Rgb {
  const channel = (c: number) => Math.round(c + (target - c) * amount);
  return [channel(r), channel(g), channel(b)];
}

function mix(rgb: Rgb, target: number, amount: number): string {
  return toHex(mixRgb(rgb, target, amount));
}

/** WCAG relative luminance. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Nudges `color` toward white (dark theme) or black (light theme) in 5%
 * steps until it reaches `ratio` against every background. The smallest
 * step that works wins, so a brand color stays recognizably itself.
 */
function legible(
  color: string,
  backgrounds: string[],
  ratio: number,
  name: ThemeName,
): string {
  const rgb = parseHex(color);
  if (rgb === null) return color;
  const against = backgrounds
    .map(parseHex)
    .filter((c): c is Rgb => c !== null);
  const target = name === 'dark' ? 255 : 0;
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mixRgb(rgb, target, step * 0.05);
    if (against.every((bg) => contrast(candidate, bg) >= ratio)) {
      return toHex(candidate);
    }
  }
  return name === 'dark' ? '#FFFFFF' : '#000000';
}

/**
 * Where the SDK departs from the dashboard tokens.
 *
 * Dark: the sheet floats over the host app, so it takes an elevated gray the
 * way iOS sheets do, and the cards and bubbles on it step lighter again. On
 * the dashboard's near-black base, cards sat 1.05:1 from the background and
 * the layering disappeared.
 *
 * Both: the text ramp is re-cut so every step clears WCAG AA (4.5:1) on the
 * sheet and on the cards over it. Tertiary carries timestamps and labels at
 * 11–12px and was 3.1:1 (dark) and 2.5:1 (light); secondary moves too, so
 * the two stay a visible step apart.
 */
const SHEET_OVERRIDES: Record<ThemeName, Partial<SupportColors>> = {
  dark: {
    sheet: '#161618',
    surface: '#1F1F23',
    surfaceHover: '#26262B',
    surfaceActive: '#2D2D33',
    border: '#2E2E35',
    borderStrong: '#3C3C44',
    textSecondary: '#A3A3AB', // 6.5:1 on surface
    textTertiary: '#87878F', // 4.6:1 on surface, 5.1:1 on sheet
  },
  light: {
    sheet: lightColors.bg,
    textSecondary: '#5A5A62', // 6.5:1 on sheet
    textTertiary: '#717179', // 4.6:1 on sheet, 4.8:1 on surface
  },
};

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

function buildTheme(name: ThemeName, tokens: ThemeColors): SupportTheme {
  const base = {
    ...tokens,
    ...SHEET_OVERRIDES[name],
  } as SupportColors;
  // Status tones double as 12px labels, so they get the text bar too.
  const onSheet = [base.sheet, base.surface];
  const colors: SupportColors = {
    ...base,
    statusOpen: legible(base.statusOpen, onSheet, 4.5, name),
    statusProgress: legible(base.statusProgress, onSheet, 4.5, name),
    statusResolved: legible(base.statusResolved, onSheet, 4.5, name),
    statusDanger: legible(base.statusDanger, onSheet, 4.5, name),
    accentText: legible(base.accent, onSheet, 4.5, name),
  };
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
 * 12% wash used behind chips, a text-safe variant, and whichever of white or
 * ink reads better on top of it.
 *
 * `adapt` is for a color that has to serve both themes: it is lifted just
 * far enough to read as a fill (3:1, the WCAG bar for UI components) on this
 * theme's sheet — a navy brand would otherwise vanish in dark mode. A color
 * given for this mode specifically is used as is.
 */
function withAccent(
  theme: SupportTheme,
  accent: string,
  adapt: boolean,
): SupportTheme {
  if (parseHex(accent) === null) return theme;
  const { name } = theme;
  const fill = adapt
    ? legible(accent, [theme.colors.sheet], 3, name)
    : toHex(parseHex(accent) as Rgb);
  const rgb = parseHex(fill) as Rgb;
  const [r, g, b] = rgb;
  const accentText = legible(
    fill,
    [theme.colors.sheet, theme.colors.surface],
    4.5,
    name,
  );
  const colors: SupportColors = {
    ...theme.colors,
    accent: fill,
    accentHover: mix(rgb, name === 'dark' ? 255 : 0, 0.12),
    accentMuted: `rgba(${r}, ${g}, ${b}, 0.12)`,
    accentForeground:
      contrast(rgb, WHITE) >= contrast(rgb, INK_RGB) ? '#FFFFFF' : INK,
    accentText,
    statusOpen: accentText,
    statusOpenBg: `rgba(${r}, ${g}, ${b}, 0.10)`,
    focusRing: fill,
  };
  return {
    ...theme,
    colors,
    shadows: shadowsFor(name, fill),
    launcher: launcherFor(name, fill),
  };
}

/**
 * The theme for one resolved mode. `accent` is the color for this mode
 * (already picked from a light/dark pair), and `adapt` says whether it was a
 * single color that has to be made to work here.
 */
export function themeFor(
  name: ThemeName,
  accent: string | undefined,
  adapt: boolean,
): SupportTheme {
  const base = name === 'light' ? supportLightTheme : supportDarkTheme;
  return accent ? withAccent(base, accent, adapt) : base;
}

/**
 * @param name  "light" | "dark" (default dark). SupportButton resolves its
 *   "system" default before calling this.
 * @param accentColor Optional brand color: one hex for both modes (adjusted
 *   per mode where needed), or a `{ light, dark }` pair used as given.
 */
export function resolveTheme(
  name: ThemeName | undefined,
  accentColor?: AccentColor,
): SupportTheme {
  const mode: ThemeName = name === 'light' ? 'light' : 'dark';
  if (typeof accentColor === 'object' && accentColor !== null) {
    return themeFor(mode, accentColor[mode], false);
  }
  return themeFor(mode, accentColor, true);
}
