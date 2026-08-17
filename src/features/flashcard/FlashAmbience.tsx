// FlashAmbience — the per-mode particle field behind the flashcard.
//
// The two study modes are two places in the same deep-space void, and this is
// what makes them feel like different places: Standard breathes in place,
// Mastery orbits a core that brightens as cards are mastered.
//
// Every mode is a pure function of (particle, time) over the SAME fixed pool —
// no per-mode spawning, no wrapping. That's deliberate: switching modes then
// crossfades by lerping each particle between its two mode positions, so the
// field physically flies from one behavior into the other instead of cutting.
//
// Colors are read off the canvas's own computed style, so src/theme/tokens.css
// stays the only place mode hues are defined (nothing is hardcoded here).

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type AmbienceMode = 'standard' | 'mastery';

export interface FlashAmbienceHandle {
  /** Ripple the mastery core a sort just went into. */
  pulse(): void;
}

interface FlashAmbienceProps {
  mode: AmbienceMode;
  /** Mastery only: 0–1 share of the working set already mastered. */
  intensity: number;
  /**
   * Freeze the field on one composed still frame — the default. Treated
   * exactly like `prefers-reduced-motion`: same frozen clock, same snap
   * instead of a crossfade, so there is only one still-frame code path.
   */
  paused: boolean;
}

const TAU = Math.PI * 2;
const MAX_PARTICLES = 160;
const BLEND_MS = 700;
const PULSE_MS = 900;

// Same fixed-seed generator Starfield uses: the field must be identical on
// every mount, or leaving and re-entering a deck reshuffles the sky.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x);
}

interface Particle {
  hx: number; // home position, normalized to the canvas box
  hy: number;
  phase: number;
  depth: number; // parallax + size
  wobble: number;
  orbit: number;
  base: number; // base alpha
}

const POOL: Particle[] = Array.from({ length: MAX_PARTICLES }, (_, i) => {
  const a = pseudoRandom(i * 12.9898 + 1);
  const b = pseudoRandom(i * 78.233 + 7);
  const c = pseudoRandom(i * 39.425 + 13);
  return {
    hx: 0.03 + a * 0.94,
    hy: 0.04 + b * 0.92,
    phase: c,
    depth: 0.35 + c * 0.65,
    wobble: 0.18 + b * 0.3,
    orbit: 0.2 + b * 0.8,
    base: 0.26 + c * 0.5,
  };
});

type RGB = [number, number, number];

function parseColor(value: string, fallback: RGB): RGB {
  const v = value.trim();
  const hex = v.replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const m = v.match(/(-?[\d.]+)/g);
  if (m && m.length >= 3) return [Number(m[0]), Number(m[1]), Number(m[2])];
  return fallback;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface Sample {
  x: number;
  y: number;
  a: number;
}

// Standard: nothing is at stake, so nothing travels — each star breathes
// around its home position and twinkles out of phase with its neighbours.
function sampleStandard(p: Particle, t: number, out: Sample) {
  out.x = p.hx + Math.sin(t * p.wobble + p.phase * TAU) * 0.012 * p.depth;
  out.y = p.hy + Math.cos(t * p.wobble * 0.8 + p.phase * TAU) * 0.016 * p.depth;
  out.a = p.base * (0.55 + 0.45 * Math.sin(t * 0.8 + p.phase * TAU * 3));
}

// Mastery: an accretion disc. Inner particles sweep faster than outer ones and
// the ellipse is foreshortened, so the field reads as a disc seen at an angle
// rather than as a flat ring.
function sampleMastery(p: Particle, t: number, out: Sample) {
  const ang = p.phase * TAU + t * (0.34 - 0.2 * p.orbit);
  out.x = 0.5 + Math.cos(ang) * (0.1 + p.orbit * 0.4);
  out.y = 0.5 + Math.sin(ang) * (0.07 + p.orbit * 0.27);
  out.a = p.base * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(ang)));
}

const SAMPLERS: Record<AmbienceMode, (p: Particle, t: number, out: Sample) => void> = {
  standard: sampleStandard,
  mastery: sampleMastery,
};

const FALLBACK: Record<AmbienceMode, RGB> = {
  standard: [99, 179, 255],
  mastery: [214, 140, 201],
};

// Only the birth time: every ripple rises from the mastery core at the centre,
// so there is no per-pulse position left to carry.
interface Pulse {
  start: number;
}

export const FlashAmbience = forwardRef<FlashAmbienceHandle, FlashAmbienceProps>(
  function FlashAmbience({ mode, intensity, paused }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // Everything the animation loop reads lives in refs: the loop is started
    // once and must never be torn down and rebuilt on a prop change, or the
    // crossfade it exists to draw would be the thing that gets interrupted.
    const fromRef = useRef<AmbienceMode>(mode);
    const toRef = useRef<AmbienceMode>(mode);
    const blendRef = useRef(1);
    const blendStartRef = useRef(0);
    const intensityRef = useRef(intensity);
    const pausedRef = useRef(paused);
    const pulsesRef = useRef<Pulse[]>([]);
    const colorsRef = useRef<Record<AmbienceMode, RGB>>({ ...FALLBACK });
    // Set by the animation effect; lets the prop-watching effects below tell the
    // loop to re-decide whether it should be running, without tearing it down.
    const syncRef = useRef<(() => void) | null>(null);

    intensityRef.current = intensity;
    pausedRef.current = paused;

    useImperativeHandle(ref, () => ({
      pulse() {
        if (paused) return; // a frozen field has nothing to ripple
        if (toRef.current === 'standard') return; // browse mode sorts nothing
        pulsesRef.current.push({ start: performance.now() });
      },
    }));

    // Mode change: hand the loop a new crossfade rather than a new state. If a
    // fade is still running, its current position becomes the new origin, so
    // rapid mode switching eases out of wherever the field actually is.
    useEffect(() => {
      if (toRef.current === mode) return;
      fromRef.current = blendRef.current >= 1 ? toRef.current : fromRef.current;
      toRef.current = mode;
      // Paused: no crossfade to run, so land on the new mode's still frame
      // directly rather than freezing halfway through a morph.
      blendRef.current = paused ? 1 : 0;
      blendStartRef.current = performance.now();
      pulsesRef.current = [];
      syncRef.current?.();
    }, [mode, paused]);

    // Redraws the frozen frame when something it depends on changes while the
    // loop is stopped, and starts/stops the loop when motion is toggled.
    useEffect(() => {
      syncRef.current?.();
    }, [paused, intensity]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return; // no 2D context: the CSS veil alone still carries the mode

      const styles = getComputedStyle(canvas);
      colorsRef.current = {
        standard: parseColor(styles.getPropertyValue('--amb-standard'), FALLBACK.standard),
        mastery: parseColor(styles.getPropertyValue('--amb-mastery'), FALLBACK.mastery),
      };

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      let width = 0;
      let height = 0;
      let count = 0;
      let raf = 0;
      let visible = true;

      function resize() {
        const rect = canvas!.getBoundingClientRect();
        width = Math.max(1, rect.width);
        height = Math.max(1, rect.height);
        // Capped at 2: past that the extra pixels cost real frames on a laptop
        // and buy nothing visible on a field of 2px dots.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas!.width = Math.round(width * dpr);
        canvas!.height = Math.round(height * dpr);
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Density by area, so a phone renders a proportionate sky instead of
        // cramming the desktop count into a third of the space.
        count = Math.max(40, Math.min(MAX_PARTICLES, Math.round((width * height) / 3400)));
      }

      const from: Sample = { x: 0, y: 0, a: 0 };
      const to: Sample = { x: 0, y: 0, a: 0 };

      function glow(cx: number, cy: number, radius: number, rgb: RGB, alpha: number) {
        if (alpha <= 0.002) return;
        const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, radius);
        g.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`);
        g.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
        ctx!.fillStyle = g;
        ctx!.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }

      function draw(now: number) {
        const fromMode = fromRef.current;
        const toMode = toRef.current;
        const raw =
          blendRef.current >= 1
            ? 1
            : Math.min(1, (now - blendStartRef.current) / BLEND_MS);
        blendRef.current = raw;
        const k = easeInOut(raw);
        // Frozen clock when paused or under reduced motion: one composed still
        // frame, which is still a different picture per mode.
        const still = pausedRef.current || reduced.matches;
        const t = still ? 6 : now / 1000;

        const cFrom = colorsRef.current[fromMode];
        const cTo = colorsRef.current[toMode];
        const rgb: RGB = [
          Math.round(lerp(cFrom[0], cTo[0], k)),
          Math.round(lerp(cFrom[1], cTo[1], k)),
          Math.round(lerp(cFrom[2], cTo[2], k)),
        ];

        ctx!.clearRect(0, 0, width, height);
        ctx!.globalCompositeOperation = 'lighter';

        const weight = (m: AmbienceMode) =>
          (fromMode === m ? 1 - k : 0) + (toMode === m ? k : 0);

        // Backdrop: the mastery core, drawn under the field so its particles
        // read as orbiting something rather than just moving.
        const wMastery = weight('mastery');
        if (wMastery > 0) {
          const core = 0.06 + 0.16 * intensityRef.current;
          const r = Math.min(width, height) * (0.3 + 0.18 * intensityRef.current);
          glow(0.5 * width, 0.5 * height, r, rgb, core * wMastery);
        }

        const sampleFrom = SAMPLERS[fromMode];
        const sampleTo = SAMPLERS[toMode];
        for (let i = 0; i < count; i++) {
          const p = POOL[i];
          sampleFrom(p, t, from);
          sampleTo(p, t, to);
          const x = lerp(from.x, to.x, k) * width;
          const y = lerp(from.y, to.y, k) * height;
          const a = lerp(from.a, to.a, k);
          if (a <= 0.01) continue;
          const r = 0.7 + p.depth * 1.5;
          ctx!.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a.toFixed(3)})`;
          ctx!.beginPath();
          ctx!.arc(x, y, r, 0, TAU);
          ctx!.fill();
          // A second, much fainter disc is what separates "dots" from "stars" —
          // cheaper than shadowBlur and it survives on a low-end GPU.
          ctx!.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(a * 0.1).toFixed(3)})`;
          ctx!.beginPath();
          ctx!.arc(x, y, r * 3.4, 0, TAU);
          ctx!.fill();
        }

        // Sort ripples: an expanding ring off the core the card just went into.
        const pulses = pulsesRef.current;
        for (let i = pulses.length - 1; i >= 0; i--) {
          const pulse = pulses[i];
          const age = (now - pulse.start) / PULSE_MS;
          if (age >= 1) {
            pulses.splice(i, 1);
            continue;
          }
          const ease = 1 - Math.pow(1 - age, 3);
          // Kept small: this is the core acknowledging a card, not an explosion.
          // A ring that outgrows the disc it rises from stops reading as arrival.
          const r = Math.min(width, height) * (0.015 + ease * 0.13);
          ctx!.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${(0.42 * (1 - age)).toFixed(3)})`;
          ctx!.lineWidth = 1.4 * (1 - age) + 0.4;
          ctx!.beginPath();
          ctx!.arc(width / 2, height / 2, r, 0, TAU);
          ctx!.stroke();
        }

        ctx!.globalCompositeOperation = 'source-over';
      }

      function frame(now: number) {
        draw(now);
        raf = requestAnimationFrame(frame);
      }

      function shouldAnimate() {
        return !pausedRef.current && !reduced.matches && visible && !document.hidden;
      }

      // The single place that decides whether frames are being produced. Every
      // input that can change that answer — the motion toggle, reduced-motion,
      // tab visibility, scrolling out of view — routes here, so there is one
      // rule rather than four overlapping ones.
      function sync() {
        if (shouldAnimate()) {
          if (!raf) raf = requestAnimationFrame(frame);
        } else {
          if (raf) {
            cancelAnimationFrame(raf);
            raf = 0;
          }
          draw(performance.now());
        }
      }
      syncRef.current = sync;

      function stop() {
        if (!raf) return;
        cancelAnimationFrame(raf);
        raf = 0;
      }

      resize();
      sync();

      const ro = new ResizeObserver(() => {
        resize();
        // A resize clears the backing store, so the frozen frame has to be
        // repainted even when no loop is running.
        draw(performance.now());
      });
      ro.observe(canvas);

      // Scrolled out of view is the same as hidden — there is no reason to burn
      // frames on a field nobody is looking at.
      const io = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true;
          sync();
        },
        { threshold: 0 },
      );
      io.observe(canvas);

      document.addEventListener('visibilitychange', sync);
      reduced.addEventListener('change', sync);

      return () => {
        syncRef.current = null;
        stop();
        ro.disconnect();
        io.disconnect();
        document.removeEventListener('visibilitychange', sync);
        reduced.removeEventListener('change', sync);
      };
    }, []);

    return <canvas ref={canvasRef} className="flash-ambience" aria-hidden="true" />;
  },
);
