// The SDK consumes the same design tokens as the admin dashboard, so both
// surfaces look like one product.
import {
  darkColors,
  lightColors,
  motion,
  radii,
  spacing,
  type ThemeColors,
} from '@appsupportkit/design-tokens';
import type { ThemeName } from './types';

export interface SupportTheme {
  name: ThemeName;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  motion: typeof motion;
}

export const supportDarkTheme: SupportTheme = {
  name: 'dark',
  colors: darkColors,
  spacing,
  radii,
  motion,
};

export const supportLightTheme: SupportTheme = {
  name: 'light',
  colors: lightColors,
  spacing,
  radii,
  motion,
};

export function resolveTheme(name: ThemeName | undefined): SupportTheme {
  return name === 'light' ? supportLightTheme : supportDarkTheme;
}
