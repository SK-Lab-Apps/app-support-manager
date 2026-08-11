/**
 * @appsupportkit/design-tokens
 *
 * Single source of truth for the visual language of the support platform.
 * Consumed by:
 *   - apps/web            → as CSS variables (dist/tokens.css) wired into Tailwind
 *   - react-native-sdk    → as JS theme objects (darkTheme / lightTheme)
 *
 * Aesthetic target: Linear / Vercel / Geist. Quiet, dense, precise.
 * Depth comes from borders and layered backgrounds, never drop shadows
 * (shadows are reserved for overlays: dropdowns, sheets, dialogs).
 */

export interface ThemeColors {
  /** App background — near-black, never pure black in dark mode. */
  bg: string;
  /** Raised surface: cards, sidebar, table header. */
  surface: string;
  /** Overlay surface: dropdowns, dialogs, sheets. */
  overlay: string;
  /** Subtle hover wash for rows and list items. */
  surfaceHover: string;
  /** Pressed / selected wash. */
  surfaceActive: string;
  /** Default 1px border — low contrast. */
  border: string;
  /** Slightly stronger border for inputs and focused containers. */
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** The ONE accent. Primary buttons, active nav, focus rings. Never large fills. */
  accent: string;
  accentHover: string;
  /** 8–12% opacity accent wash for chips and selected states. */
  accentMuted: string;
  /** Text color that sits on top of solid accent. */
  accentForeground: string;
  /** Muted status colors — dot + label or tinted chip, never saturated pills. */
  statusOpen: string;
  statusOpenBg: string;
  statusProgress: string;
  statusProgressBg: string;
  statusResolved: string;
  statusResolvedBg: string;
  statusDanger: string;
  statusDangerBg: string;
  /** Focus ring color (accent at full opacity; ring is 2px with offset). */
  focusRing: string;
}

export interface Theme {
  name: 'dark' | 'light';
  colors: ThemeColors;
}

export const darkColors: ThemeColors = {
  bg: '#0A0A0B',
  surface: '#111113',
  overlay: '#17171A',
  surfaceHover: '#1A1A1D',
  surfaceActive: '#202024',
  border: '#26262B',
  borderStrong: '#35353B',
  textPrimary: '#EDEDEF',
  textSecondary: '#8B8B93',
  textTertiary: '#5E5E66',
  accent: '#5E6AD2',
  accentHover: '#6E79DB',
  accentMuted: 'rgba(94, 106, 210, 0.12)',
  accentForeground: '#FFFFFF',
  statusOpen: '#7C88E0',
  statusOpenBg: 'rgba(94, 106, 210, 0.10)',
  statusProgress: '#C79A3B',
  statusProgressBg: 'rgba(199, 154, 59, 0.10)',
  statusResolved: '#4CA46C',
  statusResolvedBg: 'rgba(76, 164, 108, 0.10)',
  statusDanger: '#D45D5D',
  statusDangerBg: 'rgba(212, 93, 93, 0.10)',
  focusRing: '#5E6AD2',
};

export const lightColors: ThemeColors = {
  bg: '#FAFAFA',
  surface: '#FFFFFF',
  overlay: '#FFFFFF',
  surfaceHover: '#F4F4F5',
  surfaceActive: '#ECECEE',
  border: '#E4E4E7',
  borderStrong: '#D4D4D8',
  textPrimary: '#18181B',
  textSecondary: '#6E6E76',
  textTertiary: '#A0A0A8',
  accent: '#5E6AD2',
  accentHover: '#4F5BC3',
  accentMuted: 'rgba(94, 106, 210, 0.10)',
  accentForeground: '#FFFFFF',
  statusOpen: '#4F5BC3',
  statusOpenBg: 'rgba(94, 106, 210, 0.09)',
  statusProgress: '#95700F',
  statusProgressBg: 'rgba(149, 112, 15, 0.09)',
  statusResolved: '#2E7D4F',
  statusResolvedBg: 'rgba(46, 125, 79, 0.09)',
  statusDanger: '#B54040',
  statusDangerBg: 'rgba(181, 64, 64, 0.09)',
  focusRing: '#5E6AD2',
};

export const darkTheme: Theme = { name: 'dark', colors: darkColors };
export const lightTheme: Theme = { name: 'light', colors: lightColors };

/** 4px scale. Use these values, nothing off-grid. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** Radii: 6px controls, 8–10px cards, 16px for the mobile sheet's top corners. */
export const radii = {
  control: 6,
  card: 8,
  cardLg: 10,
  sheet: 16,
  full: 9999,
} as const;

export const typography = {
  /**
   * Web: Inter via next/font. Native: system stack (SF Pro / Roboto) —
   * closest platform equivalent; metrics tuned to match.
   */
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono:
    "'SF Mono', 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  size: {
    /** Table metadata, timestamps, chips. */
    xs: 11,
    sm: 12,
    md: 13,
    /** Dashboard base. */
    base: 14,
    /** Page titles only. */
    lg: 15,
    xl: 16,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
  },
  /** Tight tracking on headings. */
  trackingHeading: '-0.01em',
  trackingTight: '-0.02em',
  lineHeight: {
    tight: 1.25,
    base: 1.5,
  },
} as const;

/** 120–180ms, ease-out, opacity/transform only. No bounce, no springs. */
export const motion = {
  fast: 120,
  base: 150,
  slow: 180,
  easing: 'cubic-bezier(0, 0, 0.2, 1)',
} as const;

/** Shadows ONLY on overlays. Everything else uses borders + layering. */
export const shadows = {
  overlayDark: '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.3)',
  overlayLight: '0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 4px rgba(0, 0, 0, 0.04)',
} as const;

const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  bg: '--color-bg',
  surface: '--color-surface',
  overlay: '--color-overlay',
  surfaceHover: '--color-surface-hover',
  surfaceActive: '--color-surface-active',
  border: '--color-border',
  borderStrong: '--color-border-strong',
  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textTertiary: '--color-text-tertiary',
  accent: '--color-accent',
  accentHover: '--color-accent-hover',
  accentMuted: '--color-accent-muted',
  accentForeground: '--color-accent-fg',
  statusOpen: '--color-status-open',
  statusOpenBg: '--color-status-open-bg',
  statusProgress: '--color-status-progress',
  statusProgressBg: '--color-status-progress-bg',
  statusResolved: '--color-status-resolved',
  statusResolvedBg: '--color-status-resolved-bg',
  statusDanger: '--color-status-danger',
  statusDangerBg: '--color-status-danger-bg',
  focusRing: '--color-focus-ring',
};

function colorVarBlock(colors: ThemeColors): string {
  return (Object.keys(CSS_VAR_MAP) as Array<keyof ThemeColors>)
    .map((key) => `  ${CSS_VAR_MAP[key]}: ${colors[key]};`)
    .join('\n');
}

/**
 * Generates the tokens.css consumed by apps/web.
 * Dark is the default (`:root`); light applies via `[data-theme="light"]`.
 */
export function generateCss(): string {
  return `/* Generated by @appsupportkit/design-tokens — do not edit by hand. */
:root {
  color-scheme: dark;
${colorVarBlock(darkColors)}
  --shadow-overlay: ${shadows.overlayDark};
  --radius-control: ${radii.control}px;
  --radius-card: ${radii.card}px;
  --radius-card-lg: ${radii.cardLg}px;
  --radius-sheet: ${radii.sheet}px;
  --motion-fast: ${motion.fast}ms;
  --motion-base: ${motion.base}ms;
  --motion-slow: ${motion.slow}ms;
  --motion-easing: ${motion.easing};
}

:root[data-theme='light'] {
  color-scheme: light;
${colorVarBlock(lightColors)}
  --shadow-overlay: ${shadows.overlayLight};
}
`;
}
