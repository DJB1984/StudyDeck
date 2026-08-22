// Starfield — the decorative star field behind Home's hero header only (the
// system's one Signature Moment, see DESIGN.md). Positions are generated once
// from a fixed seed via useMemo-free module constant, not Math.random(), so the
// decoration is stable across re-renders instead of jumping every time Home
// mounts.
//
// Stars carry a MAGNITUDE, not just a size. A field of identically-sized dots
// reads as a texture; a field where a handful of stars are visibly brighter
// than the rest — and carry the four-point diffraction cross an instrument puts
// on a bright source — reads as a chart of a real patch of sky. The brightest
// few are the whole effect, which is why the class is applied to a fixed
// minority rather than scaled smoothly across the pool.

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

interface Star {
  left: number;
  top: number;
  size: number;
  opacity: number;
  delay: number;
  bright: boolean;
}

function makeStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const rx = pseudoRandom(i * 12.9898 + 1);
    const ry = pseudoRandom(i * 78.233 + 7);
    const rm = pseudoRandom(i * 39.421 + 13);
    // Magnitude is heavily skewed dim (rm^3): most of a real field is faint,
    // and only the top ~12% earns the cross. A linear roll here would give a
    // dozen bright stars and turn the signature detail into wallpaper.
    const mag = rm * rm * rm;
    const bright = mag > 0.62;
    stars.push({
      left: rx * 100,
      top: ry * 100,
      size: bright ? 2.2 + mag * 1.6 : 1 + rx * ry * 1.6,
      opacity: bright ? 0.7 + mag * 0.3 : 0.22 + rx * 0.4,
      delay: ry * 4.5,
      bright,
    });
  }
  return stars;
}

const STARS = makeStars(48);

export function Starfield() {
  return (
    // Two nested elements, not one, purely so the field can carry two masks:
    // the outer fades it out downward, the inner fades it IN from the left. A
    // single element would need mask-composite:intersect, which is the one part
    // of the masking spec still worth routing around. The horizontal fade is
    // what keeps stars off the wordmark and the tagline — sky on the right,
    // type on the left, which is how a plate is laid out anyway.
    <div className="starfield" aria-hidden="true">
      <div className="starfield-inner">
      {STARS.map((s, i) => (
        <span
          key={i}
          className={'star' + (s.bright ? ' star-bright' : '')}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDelay: `${s.delay}s`,
            '--star-opacity': s.opacity,
          } as React.CSSProperties}
        />
      ))}
      </div>
    </div>
  );
}
