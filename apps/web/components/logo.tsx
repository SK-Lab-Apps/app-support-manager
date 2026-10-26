import { cn } from '@/lib/utils';

/**
 * The product mark: two overlapping speech bubbles, the front one cut free
 * of the back by a gap. Same 24-unit geometry as the SDK launcher's
 * ConversationMark (packages/react-native-sdk/src/components/icons.tsx) and
 * app/icon.svg — change all three together (and regenerate
 * app/apple-icon.png).
 *
 * The gap is drawn, not masked: `holeClassName` fills it, so give it the
 * color behind the mark.
 */
export function LogoMark({
  size,
  className,
  holeClassName,
}: {
  size: number;
  className?: string;
  holeClassName: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={className}
    >
      <rect x="1" y="2.5" width="14.5" height="11" rx="4.5" />
      <polygon points="3.5,12.25 7.75,12.25 3.5,16.5" />
      <rect
        x="6.5"
        y="6.75"
        width="18.5"
        height="14.5"
        rx="6.5"
        className={holeClassName}
      />
      <rect x="8.5" y="8.75" width="14.5" height="10.5" rx="4.5" />
      <polygon points="16.5,18.25 20.75,18.25 20.75,22.5" />
    </svg>
  );
}

/**
 * The mark on its orange tile — the app-icon form used in the sidebar and on
 * sign-in. The orange is the brand's, not the UI accent, and the same in
 * both themes, as in app/icon.svg and app/apple-icon.png.
 */
export function LogoTile({ size, className }: { size: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-[#EA580C]',
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
      }}
    >
      {/* The same inset as app/icon.svg: 4.25 of 24 units on each side. */}
      <LogoMark
        size={size * (15.5 / 24)}
        className="fill-white"
        holeClassName="fill-[#EA580C]"
      />
    </span>
  );
}
