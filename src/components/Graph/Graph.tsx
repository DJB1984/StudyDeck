// Graph — renders a question's optional chart (spec: src/components/Graph/Graph.spec.md).
// Overriding constraint: it must NEVER throw out to its caller. Any failure
// (missing fields, bad equation, non-finite samples, Chart.js errors) degrades to
// a small "Graph unavailable" message and the rest of the app keeps working.

import { useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Chart } from 'chart.js/auto';
import type { ChartConfiguration } from 'chart.js';
import type { GraphSpec } from '../../types';
import { Katex } from '../Math/Katex';

const DARK = {
  grid: 'rgba(255,255,255,0.06)',
  tick: 'rgba(241,240,255,0.5)',
  border: 'rgba(255,255,255,0.12)',
};

function axisBase() {
  return {
    title: { display: false },
    grid: { color: DARK.grid },
    ticks: { color: DARK.tick, font: { size: 11 } },
    border: { color: DARK.border },
  };
}

// Builds the Chart.js v4 config, throwing on any invalid input. The caller
// catches every throw and shows the fallback — that's the never-crash contract.
function buildChart(graph: GraphSpec, canvas: HTMLCanvasElement): Chart {
  if (!graph || !graph.type || !graph.x_label || !graph.y_label || !graph.title) {
    throw new Error('missing required graph fields');
  }

  let points: Array<{ x: number; y: number }>;

  if (graph.type === 'points') {
    if (!Array.isArray(graph.data) || graph.data.length === 0) {
      throw new Error('invalid points data');
    }
    points = (graph.data as Array<[number, number]>).map(([x, y]) => ({ x, y }));
  } else if (graph.type === 'equation') {
    if (!graph.x_range || !Array.isArray(graph.x_range) || graph.x_range.length < 2) {
      throw new Error('equation graph requires x_range');
    }
    const xMin = Math.min(graph.x_range[0], graph.x_range[1]);
    const xMax = Math.max(graph.x_range[0], graph.x_range[1]);
    // The data string is JavaScript, not LaTeX/Python. Parenthesization matters.
    const fn = new Function('x', 'return (' + graph.data + ')') as (x: number) => number;
    points = [];
    for (let i = 0; i <= 100; i++) {
      const x = xMin + (i / 100) * (xMax - xMin);
      const y = fn(x);
      if (!isFinite(y)) throw new Error('equation produced non-finite value');
      points.push({ x, y });
    }
  } else {
    throw new Error('unknown graph type: ' + graph.type);
  }

  const config: ChartConfiguration<'scatter'> = {
    type: 'scatter',
    data: {
      datasets: [
        {
          data: points,
          showLine: true,
          borderColor: '#a78bfa',
          borderWidth: 2,
          pointRadius: graph.type === 'equation' ? 0 : 3,
          pointBackgroundColor: '#a78bfa',
          fill: false,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: axisBase(),
        y: axisBase(),
      },
    },
  };

  if (graph.x_range) {
    config.options!.scales!.x = {
      ...axisBase(),
      min: Math.min(graph.x_range[0], graph.x_range[1]),
      max: Math.max(graph.x_range[0], graph.x_range[1]),
    };
  }
  if (graph.y_range) {
    config.options!.scales!.y = {
      ...axisBase(),
      min: Math.min(graph.y_range[0], graph.y_range[1]),
      max: Math.max(graph.y_range[0], graph.y_range[1]),
    };
  }

  return new Chart(canvas, config);
}

// R8/R9 (this feature): the label tooltip is portaled to <body> instead of living
// inside .graph-area, because that container clips with overflow:hidden (to round
// its corners) — a nested tooltip would get cut off exactly when it's most needed
// (a long/clipped label). Placement is a fixed side per label, not auto-computed —
// each label always sits in the same spot in the layout, so there's no ambiguity to
// resolve at hover time.
type Placement = 'top' | 'bottom' | 'right';
interface TooltipState {
  top: number;
  left: number;
  text: string;
  placement: Placement;
}

function anchorFor(rect: DOMRect, placement: Placement): { top: number; left: number } {
  const gap = 8;
  switch (placement) {
    case 'top':
      return { top: rect.top - gap, left: rect.left + rect.width / 2 };
    case 'bottom':
      return { top: rect.bottom + gap, left: rect.left + rect.width / 2 };
    case 'right':
      return { top: rect.top + rect.height / 2, left: rect.right + gap };
  }
}

export function Graph({ graph }: { graph: GraphSpec }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<TooltipState | null>(null);

  function showTip(text: string, placement: Placement) {
    return (e: MouseEvent<HTMLElement>) => {
      setTip({ ...anchorFor(e.currentTarget.getBoundingClientRect(), placement), text, placement });
    };
  }
  function hideTip() {
    setTip(null);
  }

  // R8: destroy any prior chart before creating a new one (canvas reuse errors).
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    try {
      chartRef.current = buildChart(graph, canvas);
      setFailed(false);
    } catch (err) {
      console.warn('Graph render failed:', (err as Error).message);
      setFailed(true);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [graph]);

  return (
    <div className="graph-area">
      {!failed && (
        <Katex
          as="div"
          className="graph-title"
          text={graph.title}
          onMouseEnter={showTip(graph.title, 'bottom')}
          onMouseLeave={hideTip}
        />
      )}
      <canvas ref={canvasRef} style={{ display: failed ? 'none' : 'block' }} />
      {!failed && (
        <Katex
          as="div"
          className="graph-xlabel"
          text={graph.x_label}
          onMouseEnter={showTip(graph.x_label, 'top')}
          onMouseLeave={hideTip}
        />
      )}
      {!failed && (
        <div className="graph-ylabel-wrap">
          <Katex
            as="div"
            className="graph-ylabel"
            text={graph.y_label}
            onMouseEnter={showTip(graph.y_label, 'right')}
            onMouseLeave={hideTip}
          />
        </div>
      )}
      {failed && <div className="graph-error">Graph unavailable</div>}
      {tip &&
        createPortal(
          <div
            className={`graph-tooltip graph-tooltip--${tip.placement}`}
            style={{ top: tip.top, left: tip.left }}
            role="tooltip"
          >
            {tip.text}
          </div>,
          document.body,
        )}
    </div>
  );
}
