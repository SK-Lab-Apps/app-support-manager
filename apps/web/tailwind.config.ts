import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

/**
 * All colors reference the CSS variables emitted by
 * @appsupportkit/design-tokens/tokens.css — themes flip by swapping variables,
 * so components never use dark: variants.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    /**
     * Declared in full (not `extend`) so `xs` sorts before `sm` — Tailwind
     * emits breakpoints in key order, and an appended `xs` would out-specify
     * every larger breakpoint.
     */
    screens: {
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
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
      /** Feeds padding/margin/inset — `pb-safe-b`, `pt-safe-t`, `pl-safe-l`. */
      spacing: {
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-l': 'env(safe-area-inset-left, 0px)',
        'safe-r': 'env(safe-area-inset-right, 0px)',
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        'card-lg': 'var(--radius-card-lg)',
        sheet: 'var(--radius-sheet)',
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '20px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['15px', { lineHeight: '22px' }],
        xl: ['16px', { lineHeight: '24px' }],
        /** The 16px floor iOS Safari needs to not zoom a focused control. */
        input: ['16px', { lineHeight: '24px' }],
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
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in-left': {
          from: { transform: 'translate3d(-100%, 0, 0)' },
          to: { transform: 'translate3d(0, 0, 0)' },
        },
        /** A third-width bar crossing its track, entering and leaving off-edge. */
        'loading-bar': {
          from: { transform: 'translate3d(-100%, 0, 0)' },
          to: { transform: 'translate3d(300%, 0, 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms cubic-bezier(0, 0, 0.2, 1)',
        'slide-in-left': 'slide-in-left 180ms cubic-bezier(0, 0, 0.2, 1)',
        'loading-bar': 'loading-bar 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [
    plugin(({ addVariant, addUtilities }) => {
      /**
       * Input capability, not viewport width. A 1440px touchscreen still needs
       * 44px targets and a 16px control font; a 500px desktop window does not.
       */
      addVariant('coarse', '@media (pointer: coarse)');
      addVariant('fine', '@media (pointer: fine)');

      addUtilities({
        /* Horizontal scrollers that shouldn't advertise themselves. */
        '.scrollbar-none': {
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
      });
    }),
  ],
};

export default config;
