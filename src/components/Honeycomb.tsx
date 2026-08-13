/**
 * Honeycomb texture.
 *
 * The bee half of the name, carried by geometry rather than illustration: a
 * tiling of regular hexagons, drawn in `currentColor` at low opacity so it
 * inherits whichever theme is active and never needs a per-theme variant.
 *
 * Used only on the home screen. The reading surface stays empty — the whole
 * point of the reader is that nothing competes with the word.
 */

/**
 * Pointy-top hexagons of circumradius 20: width √3·R ≈ 34.64, vertical period
 * 3·R = 60. Four hexagons per tile — one on each vertical edge midpoint and one
 * on each corner — so the lattice joins seamlessly when the pattern repeats.
 */
const HEXAGONS = [
  'M17.32,-20 L34.64,-10 L34.64,10 L17.32,20 L0,10 L0,-10 Z',
  'M0,10 L17.32,20 L17.32,40 L0,50 L-17.32,40 L-17.32,20 Z',
  'M34.64,10 L51.96,20 L51.96,40 L34.64,50 L17.32,40 L17.32,20 Z',
  'M17.32,40 L34.64,50 L34.64,70 L17.32,80 L0,70 L0,50 Z',
].join(' ');

interface HoneycombProps {
  className?: string;
  /** Pattern opacity. Kept low — this is texture, not decoration. */
  opacity?: number;
}

export function Honeycomb({ className, opacity = 0.07 }: HoneycombProps) {
  return (
    <svg
      aria-hidden
      className={className}
      style={{ opacity }}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id="blitzbee-honeycomb"
          width="34.64"
          height="60"
          patternUnits="userSpaceOnUse"
        >
          <path d={HEXAGONS} fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>

        {/* Fades the lattice out downwards so it never fights the content. */}
        <linearGradient id="blitzbee-honeycomb-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>

        <mask id="blitzbee-honeycomb-mask">
          <rect width="100%" height="100%" fill="url(#blitzbee-honeycomb-fade)" />
        </mask>
      </defs>

      <rect
        width="100%"
        height="100%"
        fill="url(#blitzbee-honeycomb)"
        mask="url(#blitzbee-honeycomb-mask)"
      />
    </svg>
  );
}
