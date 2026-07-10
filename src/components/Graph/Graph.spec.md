# Intent

Graph renders a question's optional chart — either a set of data points or a plotted equation — using Chart.js. Its overriding design constraint is that a malformed graph must never take down the surrounding quiz/review: any failure degrades to a small "Graph unavailable" message in place of the chart, and the rest of the app keeps working.

# Requirements

- R1 [verify: unit] [caution: THIS IS THE FEATURE'S REASON FOR EXISTING — Graph must NEVER throw out to its caller. Every code path (missing fields, bad equation string, non-finite samples, Chart.js internal errors) is caught; on any failure it hides the canvas, shows the "Graph unavailable" fallback, hides the title/axis-label overlays, and returns a failure signal instead of propagating.] All rendering is wrapped so no error escapes.
- R2 [verify: unit] A `points` graph plots `data` (an array of `[x, y]` pairs) as a scatter dataset with the connecting line shown (`showLine: true`) and visible point markers. An empty or non-array `points` `data` fails gracefully (R1).
- R3 [verify: unit] [caution: equation evaluation uses `new Function('x', 'return (' + data + ')')` and samples 100 points across the normalized x-range. The parenthesization matters; the data string is JavaScript, not LaTeX/Python. If ANY sample yields a non-finite value (NaN/Infinity), the whole graph fails to the fallback rather than plotting a broken curve.] An `equation` graph samples the function at 101 evenly spaced points (`i = 0..100`) across `[xMin, xMax]` and plots a line with point markers hidden.
- R4 [verify: unit] An `equation` graph requires a valid `x_range` (array, length ≥ 2); without it, it fails gracefully. `x_range` and `y_range` are min/max-normalized so `[5, -5]` behaves identically to `[-5, 5]`. When `x_range`/`y_range` are provided, they pin the corresponding axis min/max; when absent, the axis auto-fits.
- R5 [verify: unit] A graph missing any of `type`, `x_label`, `y_label`, or `title` fails gracefully, as does an unknown `type` (anything other than `points`/`equation`).
- R6 [verify: ui] [caution: Chart.js draws axis/title text as plain canvas text and CANNOT render LaTeX. The title and axis labels are therefore rendered as KaTeX-capable HTML overlays positioned around the canvas, and Chart.js's own title/axis-title drawing stays disabled. Do not "simplify" by moving labels back into Chart.js options — LaTeX labels would break.] `title`, `x_label`, and `y_label` render as KaTeX HTML overlays around the chart.
- R7 [verify: ui] [caution: Chart.js v4 syntax only — no v2/v3 config patterns. The chart is a `scatter` type for both points and equations (equations just hide point radius), with dark-theme grid/tick/border colors and the accent purple line.] The chart uses v4 configuration throughout.
- R8 [verify: ui] [caution: the Chart instance is destroyed and recreated on every question navigation — reusing a canvas across questions causes Chart.js "canvas already in use" errors. Also destroy the chart when navigating to a question with no graph.] Any existing chart instance is destroyed before a new one is created, and when a question has no graph.
- R9 [verify: manual] The graph area occupies a fixed height and full question width and is positioned above the question text.

# Change log

- 2026-07-09: Spec authored for the React + TypeScript migration, backfilled from `Renderer.renderGraph` (and its call sites in `renderQuizQuestion`/`renderReviewQuestion`) in `legacy/studydeck.html`. Captures the never-throw/"Graph unavailable" contract, points-scatter vs equation-100-sample rendering with non-finite rejection, min/max range normalization, KaTeX overlay labels, Chart.js v4 usage, and destroy-before-recreate lifecycle. Authored as the target for the React Graph component.
