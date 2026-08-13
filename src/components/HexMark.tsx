/**
 * The Blitzbee mark: a hexagon cell holding a single amber dot.
 *
 * The dot is the fixation point — the one place every word is aligned to — so
 * the logo states the product's whole premise. The hexagon supplies the bee
 * reference without a mascot.
 */

interface HexMarkProps {
  className?: string;
}

/** Pointy-top hexagon, circumradius 20, centred in a 40×40 box. */
const HEX_PATH = 'M20,1 L37.3,11 L37.3,31 L20,41 L2.7,31 L2.7,11 Z';

export function HexMark({ className = 'h-10 w-10' }: HexMarkProps) {
  return (
    <svg viewBox="0 0 40 42" className={className} role="img" aria-label="Blitzbee">
      <path d={HEX_PATH} fill="none" strokeWidth="2" className="stroke-line" />
      <circle cx="20" cy="21" r="6.5" className="fill-accent" />
    </svg>
  );
}
