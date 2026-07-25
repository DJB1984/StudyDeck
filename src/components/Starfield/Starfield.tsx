// Starfield — the decorative star field behind Home's hero header only (the
// system's one Signature Moment, see DESIGN.md). Positions are generated once
// from a fixed seed via useMemo, not Math.random(), so the decoration is
// stable across re-renders instead of jumping every time Home mounts.

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
}

function makeStars(count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const rx = pseudoRandom(i * 12.9898 + 1);
    const ry = pseudoRandom(i * 78.233 + 7);
    stars.push({
      left: rx * 100,
      top: ry * 100,
      size: 1 + rx * ry * 2.5,
      opacity: 0.3 + rx * 0.55,
      delay: ry * 4.5,
    });
  }
  return stars;
}

const STARS = makeStars(48);

export function Starfield() {
  return (
    <div className="starfield" aria-hidden="true">
      {STARS.map((s, i) => (
        <span
          key={i}
          className="star"
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
  );
}
