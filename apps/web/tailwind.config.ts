import type { Config } from 'tailwindcss';

/**
 * All colors reference the CSS variables emitted by
 * @appsupportkit/design-tokens/tokens.css — themes flip by swapping variables,
 * so components never use dark: variants.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        overlay: 'var(--color-overlay)',
        'surface-hover': 'var(--color-surface-hover)',
        'surface-active': 'var(--color-surface-active)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        tertiary: 'var(--color-text-tertiary)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-muted': 'var(--color-accent-muted)',
        'accent-fg': 'var(--color-accent-fg)',
        'status-open': 'var(--color-status-open)',
        'status-open-bg': 'var(--color-status-open-bg)',
        'status-progress': 'var(--color-status-progress)',
        'status-progress-bg': 'var(--color-status-progress-bg)',
        'status-resolved': 'var(--color-status-resolved)',
        'status-resolved-bg': 'var(--color-status-resolved-bg)',
        'status-danger': 'var(--color-status-danger)',
        'status-danger-bg': 'var(--color-status-danger-bg)',
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        'card-lg': 'var(--radius-card-lg)',
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['15px', { lineHeight: '22px' }],
        xl: ['16px', { lineHeight: '24px' }],
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        overlay: 'var(--shadow-overlay)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '150ms',
        slow: '180ms',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0, 0, 0.2, 1)',
      },
      letterSpacing: {
        heading: '-0.01em',
        tighter: '-0.02em',
      },
    },
  },
  plugins: [],
};

export default config;
