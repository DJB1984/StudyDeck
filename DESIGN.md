---
name: StudyDeck
description: A dependency-light, AI-agnostic web app for practicing, testing, and flashcard-drilling AI-generated study decks.
colors:
  plate-ink: "#07080d"
  surface: "#0d0f16"
  surface-raised: "#151823"
  border-hairline: "rgba(233, 230, 224, 0.10)"
  border-strong: "rgba(233, 230, 224, 0.22)"
  scrollbar-thumb: "rgba(233, 230, 224, 0.16)"
  star-blue: "#3a6dc0"
  star-blue-light: "#93b8f5"
  star-blue-deep: "#24508f"
  brass: "#c9a06a"
  brass-dim: "rgba(201, 160, 106, 0.42)"
  mode-standard-fill: "#35619f"
  mode-mastery-tint: "#8f6ec9"
  mode-mastery-light: "#c0aae8"
  mode-mastery-fill: "#614296"
  text-primary: "#e9e6e0"
  text-muted: "#8b8a8c"
  on-accent: "#ffffff"
  success-green: "#63bd80"
  alert-red: "#e35f5a"
typography:
  display:
    fontFamily: "'Newsreader', 'Iowan Old Style', Georgia, serif"
    fontSize: "clamp(2.6rem, 2rem + 2.6vw, 4rem)"
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: "0.01em"
  heading:
    fontFamily: "'Newsreader', 'Iowan Old Style', Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  reading:
    fontFamily: "'Newsreader', 'Iowan Old Style', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.005em"
  body:
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'IBM Plex Mono', ui-monospace, Consolas, monospace"
    fontSize: "0.7rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.14em"
    textTransform: "uppercase"
  mono:
    fontFamily: "'IBM Plex Mono', ui-monospace, Consolas, monospace"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "2px"
  md: "3px"
  lg: "4px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.star-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "9px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  plate:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  catalog-row:
    backgroundColor: "transparent"
    borderBottom: "1px solid {colors.border-hairline}"
    padding: "16px 12px 16px 0"
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
---

# Design System: StudyDeck

## Overview

**Creative North Star: "Star Atlas"**

StudyDeck is an engraved celestial atlas plate. The ground is ink; the type is
ivory, not screen-white; structure is carried by hairline rules and small brass
annotation rather than by boxes; and one cool star-blue marks the single thing on
any screen you can act on. The reference is an 18th-century sky chart and the
instrument that produced it — printed, annotated, precise — not a product page.

This replaced the prior "Starfield" system on 2026-08-22, at Davis's call, for
one stated reason: the app looked machine-generated. It was, materially, the
default output palette of a code model — near-black navy, one saturated mid-blue,
gradient-filled buttons wearing a colored glow, gradient-clipped display text, a
radial glow blob behind the headline, Space Grotesk over Inter, and every surface
built from the same recipe (one fill, one 8%-white hairline, one 16px radius)
laid out in a symmetric `auto-fill` card grid. Each of those is defensible alone.
Together they are a signature, and it was the signature that had to go.

**What did NOT change: the product.** Every screen, control, flow, interaction
and piece of state is exactly as designed — the mode ladder, the Mastery drill
and its gaps, the swipe vocabulary, the sharing model, the flashcard-as-stage
sizing. This redesign replaced the *material and composition*: color, type, edge,
rhythm, and how information is arranged on a page. Nothing about how the app
behaves moved.

**Key Characteristics:**
- Ink ground, ivory type, brass annotation, one star-blue for action
- Structure comes from hairline rules and space — lists are ruled, not tiled
- Corners, not curves: a 4px maximum radius exists to stop 1px edges chipping
- Buttons are stamped flat — no gradient fill, no colored glow, ever
- A serif (Newsreader) carries every heading AND every reading role — questions,
  flashcard faces, the score — while a sans (IBM Plex) carries the chrome
- Every piece of metadata in the app is one voice: small letter-spaced uppercase
  brass mono
- Correct/incorrect green and red are feedback-only, never decorative
- Procedural stars appear in exactly two places: the field behind Home's header,
  and Flashcards' live per-mode atmosphere

## Colors

### The Two Inks

The system runs on two marking colors, and the distinction between them is the
whole grammar:

- **Star Blue** (`#3a6dc0`) — the color of a hot main-sequence star, and the one
  color that means *you can act on this* or *this is selected*. Primary buttons,
  progress fill, selected borders, focused inputs. Cobalt rather than azure: it
  has to read as a star seen through glass, not as a hyperlink.
- **Brass** (`#c9a06a`) — the engraver's annotation ink. Plate numbers, catalog
  labels, counts, timestamps, the letter beside an answer, tick rules, step
  markers. Brass is never a fill and never interactive.

Supporting stops: **Star Blue Light** (`#93b8f5`) for on-ink text, hover rules,
graph curves and flashcard answer copy; **Star Blue Deep** (`#24508f`) for the
pressed state; **Brass Dim** (`rgba(201,160,106,0.42)`) for marks that should be
felt rather than read; **Brass Wash** (`rgba(201,160,106,0.09)`) for the hover
state of any ruled row.

### Neutral
- **Plate Ink** (`#07080d`): the page. Near-black with barely any cast — the navy
  of the prior system was itself part of the generated look.
- **Surface** (`#0d0f16`): a plate laid on the ink — modals, the code editor, the
  flashcard, the JSON box. Used far less than the fill it replaced; most content
  now sits directly on the ink.
- **Surface Raised** (`#151823`): the same plate lifted one step.
- **Border Hairline** (`rgba(233,230,224,0.10)`) / **Border Strong** (`0.22`):
  every rule in the system, struck in the ivory rather than in white.
- **Text Primary** (`#e9e6e0`): ivory. Printed ink, not screen white — the half
  step of warmth is most of what separates this page from a dark-mode template.
- **Text Muted** (`#8b8a8c`): secondary copy.

### Flashcard Mode Atmospheres
Each study mode owns a four-token family (`--mode-{name}-tint / -light / -fill /
-veil`), projected through four scoped properties that
`#flashcard-screen[data-mode]` reassigns. All four are registered via `@property`
as `<color>`, so a mode switch interpolates over 700ms instead of snapping.

- **Standard** — Star Blue (`#3a6dc0` / `#93b8f5` / fill `#35619f`): the app's
  everyday accent, unchanged. The mode that adds nothing also changes nothing.
- **Mastery** — ionized violet (`#8f6ec9` / `#c0aae8` / fill `#614296`): the one
  hue in the system that is neither star nor brass, which is exactly why it can
  mean "you are somewhere else now."

`-tint` is the identity hue (rims, the card's tonal cast); `-light` is the
readable-on-ink variant (flipped-card answer copy, the tally, ambient particles);
`-fill` is deliberately deeper, used where white sits on top, so every mode clears
4.5:1; `-veil` is the radial ground wash.

### Semantic
- **Success Green** (`#63bd80`): correct-answer highlight only.
- **Alert Red** (`#e35f5a`): incorrect-answer highlight, delete hover, error
  toast, and the flashcard's Still Learning verdict.

### Named Rules

**The Two-Inks Rule.** Blue marks actions; brass marks the plate. A number, a
label, a count, a letter, a rule or a tick is brass — it annotates, and annotation
is never clickable. Anything the student can act on or has selected is blue, and
there is one such thing per view. Putting a count in blue, or a button in brass,
breaks the only distinction the chrome makes.

**The Signal Rule.** Star Blue appears on exactly one thing per view — the current
primary action, the active selection, or the in-progress fill — and never as
decoration.

**The Mode-Owns-Its-Screen Rule.** Inside the Flashcard screen the mode's hue
*replaces* Star Blue as the accent: ambience, rims, tonal casts, and every control
that would otherwise be blue — the filled button, the switches, the pill's thumb,
focus rings. The screen therefore still has exactly one color meaning "act here."
Nothing outside `#flashcard-screen` is touched. Alert Red is the one exception
inside the screen: a destructive button's red is a warning, not a theme.

**The Feedback-Only Rule.** Success Green and Alert Red exist solely to answer
"was this right or wrong." Its one extension: Alert Red also carries the
flashcard's **Still Learning** swipe, which is the same answer given about
oneself. Green is *not* the counterpart there — Know It wears the mode's own hue,
because inside the Flashcard screen that hue already means "the good direction."

**The No-Glow Rule.** Nothing in this system emits light. No gradient-filled
button, no colored box-shadow, no glow behind a headline, no gradient-clipped
text. A glowing blue button on a dark page is the most-copied artifact in
generated web design, and removing it is most of why this app no longer reads as
one. The exceptions are two, both inside the flashcard, both motion: the swipe
verdict's edge glow, and the drag shadow.

## Typography

**Display / Heading / Reading:** `'Newsreader', 'Iowan Old Style', Georgia, serif`
— self-hosted (`@fontsource/newsreader`, 400/500/600 plus 400 italic).
**Body / UI:** `'IBM Plex Sans', -apple-system, …` — self-hosted
(`@fontsource/ibm-plex-sans`, 400/500/600/700).
**Label / Mono:** `'IBM Plex Mono', ui-monospace, Consolas, monospace` —
self-hosted (`@fontsource/ibm-plex-mono`, 400/500).

**Character:** a quiet literary serif over an engineered sans. Newsreader is set
at weight 400 everywhere, never bold — an atlas plate's authority comes from the
setting, not from the weight. IBM Plex Sans is deliberately not a neutral
workhorse: its quirks are what keep the chrome from reading as a system default.
The pair that came before — Space Grotesk over Inter — are both excellent and
both, together, the house fonts of AI-generated sites.

### Hierarchy
- **Display** (400, `clamp(2.6rem, 2rem + 2.6vw, 4rem)`, Newsreader): `h1` only —
  Home's and Share's wordmark, plain ivory under a brass rule.
- **Heading** (400, `1.75rem` / `1.2rem`, Newsreader): `h2`/`h3` — screen titles,
  modal titles, mode-card names, deck titles in the catalog.
- **Reading** (400, `1.5rem`, Newsreader, `1.5` leading, `62ch` measure): quiz
  question text. Flashcard faces take the same voice at
  `clamp(1.45rem, 1.1rem + 1vw, 2.05rem)`, fluid because the card they sit in is
  itself sized off the viewport. **The serif carries reading, not just headings** —
  a study question set in the same sans as the buttons around it reads as a form
  to fill in rather than as something to think about.
- **Body** (400, `1rem`, IBM Plex Sans): UI copy, answer text, button labels
  (`0.8rem` with `0.06em` tracking on buttons).
- **Plate Label** (500, `0.66–0.72rem`, IBM Plex Mono, `0.14em` tracking,
  uppercase, brass): the app's single metadata voice — catalog headers, plate
  numbers, question counts, the quiz timer, progress text, the streak tally, the
  flashcard hint, mode-pill labels, answer letters. See the rule below.
- **Mono** (400, `0.85rem`, IBM Plex Mono): the JSON paste box and code editor.

### Named Rules

**The One-Annotation-Voice Rule.** Every piece of metadata in the app is set the
same way: small, letter-spaced, uppercase, brass, mono. Not "grey small text tuned
per screen" — one voice, so the chrome reads as a single hand annotating the
plate. Before this rule there were six differently-sized muted labels doing the
same job; the difference between them was noise a reader had to filter.

**The Three-Voice Rule.** Every text role resolves to exactly one of three faces —
Newsreader (headings *and* reading), IBM Plex Sans (UI/chrome), IBM Plex Mono
(annotation and code). A fourth face breaks the system, and so does bolding
Newsreader.

## Layout

A single centered column, `max-width: 960px`, `32px` top / `24px` side / `64px`
bottom padding. No sidebar, no persistent chrome. One full-page screen mounts at a
time and fades/slides in (150ms). The spacing scale (`8 / 12 / 16 / 24 / 32px`)
governs gaps and internal padding.

**Lists are ruled, not tiled.** Home's library, the quiz's answers and Stats'
breakdown are all the same object: full-width rows separated by one hairline
apiece, with a brass marking in the left margin and the row's controls held at the
right. This replaced an `auto-fill minmax()` card grid, which truncated deck
titles into identical bordered tiles — the exact shape the redesign was called to
remove. A grid of identical boxes is what a layout looks like when nobody decided
anything about the content.

Every screen is a top-anchored document inside that column, with one exception:
Flashcards fills the viewport height and sizes its card off the leftover space. It
qualifies because the card is the screen's entire content.

## Elevation & Depth

There is no elevation. No blur, no translucency, no shadow at rest, and — new in
this system — **almost no fill**. Depth comes from rules and space: content sits
directly on the ink, and a hairline says where one thing ends and the next begins.
Surface is reserved for objects that genuinely float above the page (modals, the
flashcard, the code editor) or that need to be legible against a running field
(the JSON box).

### Shadow Vocabulary
- **Floating-drag** (`0 8px 24px rgba(0,0,0,0.4)`): the order-list item being dragged.
- **Card-in-flight** (`0 14px 34px rgb(0 0 0 / 0.42)`): the flashcard mid-throw.
- **Tooltip-lift** (`0 4px 14px rgba(0,0,0,0.45)`): the graph axis-label tooltip.

**The Shadow-Is-Motion Rule.** Shadow appears only on an element the user is
actively moving — never on a static, at-rest surface.

## Shapes

**Corners, not curves.** `4px` (`--radius`) is the system's maximum, on plates and
the flashcard; controls step down to `3px` (`--radius-md`) and the smallest chrome
to `2px`. The radius exists to stop a 1px edge looking chipped, not to soften
anything. The prior system's `16px` signature curve, its `999px` pills and its
`50%` discs are all gone — a rounded pill on a ruled plate is the one shape that
gives the game away. Circles survive only where the object genuinely is one: the
auth avatar.

Border weight no longer signals interactivity — everything is 1px, and the
distinction is carried by color instead (a ruled row washes brass on hover; a
selected one takes a full Star Blue border).

## Components

### Buttons
- **Shape:** `3px` radius, `0.8rem` label at `0.06em` tracking.
- **Primary:** flat Star Blue fill, white text, 1px border of the same color, no
  shadow. Hover lightens to `#4a7fd0`; press drops the button `1px` and darkens to
  Star Blue Deep — a key going down, not a bubble squashing.
- **Ghost:** transparent, muted text, hairline border; hover brightens both.
- **Disabled:** `opacity: 0.35`, no hover or press response.

### Plates (`.glass-card`)
The class name is historical — there has been no glass in this system for two
redesigns, and renaming it would touch fifteen components for no visual gain.
- Surface fill, 1px hairline, `4px` radius.
- **Brass registration marks** at the top-left and bottom-right corners
  (`::before` / `::after`, 9px, `--brass-dim`) — the way a plate is marked up for
  the press. This is the plate's signature and the reason it needs no shadow.
- Used only by objects that float: modals, the drop region, the share panel, the
  round-complete card. Ruled rows explicitly opt out of the corner marks.

### Catalog Row
Home's library and Stats' breakdown. Grid of content / controls. Deck title in
Newsreader at `1.25rem` flush with the section label above it, plate-label
metadata beneath, one hairline underneath, brass wash on hover. The row's two
controls hold a fixed column so nothing reflows, at `0.66` opacity until the row
is hovered or one of them takes focus — twenty rows should not read as forty
buttons.

**A held-back control is still a control.** That opacity was `0.25` until
2026-08-22, which put the annotation grey at ~1.4:1 on the ink — beneath the 3:1
any control owes when its own drawing is the only thing identifying it, and on a
coarse pointer, where hover never fires, low enough that share and remove were
unreachable in practice rather than merely quiet. `0.66` computes to ~3.1:1: read
as a marking in the margin, never mistaken for the title. **Restraint in this
system is opacity above the contrast floor, never below it** — anything dimmer
than 3:1 is hidden, and a hidden control that only a mouse can summon is not a
design decision. The pair sit in `32px` boxes on `17px` drawings (`44px` under
`(pointer: coarse)`), divided by a hairline rather than by a gap, since the
constructive control and the destructive one should not share an edge. Both are
authored SVG on the same 24px grid at the same `1.8` stroke — remove was a
`&times;` character until the same date, which took its weight from the running
font and sat visibly lighter than the icon beside it.

The row carried a brass plate number in a `46px` left column until
2026-08-22; it was dropped (Davis's call) — a running 001/002/003 down the
margin annotated nothing the student needed, and the title reads better flush
left. Don't reintroduce it. The catalog head keeps its total count.

### Answer Row
`border: 1px solid transparent` with only `border-bottom-color` set at rest, so
the list reads as four rules; brass mono letter in the margin; brass wash on
hover. A full colored border appears only once the row is selected or judged, and
because the border box is declared at full width all along, nothing reflows when
it colors in.

### Inputs / Fields
Solid dark fill, 1px hairline, `3px` radius. **Focus shifts the border to Star
Blue Light** — a color-only cue, never a glow or ring.

### Progress Header
A ghost ✕, a plate-label progress readout, and a `3px` hairline track filled
square (no radius) by Star Blue.

### Home Hero (signature moment)
Three things, none of them a glow:
1. **The graticule** — a star chart's right-ascension/declination ruling, struck
   at 4% ivory on a 64px cell and masked diagonally so it dissolves before it
   reaches the catalog. This is what replaced the radial glow blob behind the
   headline.
2. **The star field** (`Starfield.tsx`) — 48 stars carrying *magnitude*, not just
   size: a heavily dim-skewed distribution where only the top ~12% earns a
   four-point diffraction cross. The field hangs 260px below the header and fades
   out, so the first screenful reads as a patch of sky the page sits in rather
   than a banner with stars in it that stops on a ruled line. It is masked on the
   horizontal axis too — the left column is type, the right is sky — because a
   star sitting inside a word reads as a typo.
3. **The wordmark** — "StudyDeck" set plain in Newsreader with the tracking
   opened, ruled off underneath with a 92px brass line. One weight, one ink, no
   fill effect. It replaced a white-to-pale-blue gradient-clipped treatment.

### Flashcard (signature interaction)
Unchanged in behavior; restated for completeness. A real 3D CSS flip
(`perspective: 1400px`, `400ms`) reveals the answer in the mode's own light. **A
verdict looks the same however it is given:** Know It throws the card right, Still
Learning throws it left, and a button press runs the same arc a swipe does.

**The card is draggable by any pointer** — one Pointer Events path covers finger,
pen and mouse. Right is forward in both modes (next card / Know It), left is back
(previous / Still Learning), matching the arrow keys. The card follows the finger
with a tilt capped at 6°, springs home over 300ms short of commitment, and carries
on off the edge on commitment. The page clips its own horizontal overflow — a card
thrown off screen must never answer the throw with a scrollbar.

In **Mastery** the drag is a crossfade: the card's words fade out and the verdict
fades in where they were, driven by one `--swipe-p` property. **Know It wears the
mode's hue; Still Learning wears Alert Red. Standard gets no cue** — it records
nothing, so a color promising a consequence would be lying.

**On touch the buttons are gone and the gesture is the whole interface.** The test
is `(pointer: coarse)` at any width, not a breakpoint. Undo survives in the options
row at every size; the buttons survive in the accessibility tree; a **Card buttons**
switch in Settings brings them back on touch.

**The card is sized as a stage, not as a panel** — `#flashcard-screen` is a
full-height flex column and the card takes every pixel the chrome doesn't,
`flex: 1` between a `280px` floor and a `500px` ceiling, `760px` wide at most. Its
faces are set in Newsreader, the same reading voice as a quiz question.

### Flashcard Atmosphere (second signature moment)
`FlashAmbience.tsx`, a Canvas 2D field giving each mode its own physics.
**Standard** — stars breathe in place; nothing travels, because nothing is at
stake. **Mastery** — an accretion disc, inner particles sweeping faster than
outer, with a core whose brightness scales with the share of the deck mastered.
Both are pure functions of `(particle, time)` over one pool, so a mode switch lerps
each particle between its two positions over 700ms. **It is frozen by default** —
decoration is opt-in on a study screen; a "Play motion" button starts it and the
choice is remembered per device.

### Anchored Plate (`AnchorPlate`)

The header's grammar, and the app's answer to "a control needs to ask one small
question." A control in the page's top corner drops a small ruled plate directly
beneath itself; it never covers the viewport. Three consumers share one
primitive: the account menu, Copy Prompt, and — on a mouse — Log in.

- Absolute off the control's own wrapper, `top: calc(100% + 8px)`, `min-width`
  208px, clamped to `min(320px, 100vw - 32px)` so a narrow viewport can't push
  it off-screen. Right-anchored in the header (the control is in the far corner,
  so a plate hung off its left edge would overflow); left-anchored when the
  control sits mid-card, as step 1 of the first-run card does.
- Kept mounted and hidden rather than conditionally rendered, so it animates out
  as well as in; `visibility: hidden` is also what drops a closed plate from the
  tab order. Motion is a **3px settle over 140ms — a plate is set down, it does
  not grow**. No control in this system changes its own geometry.
- It carries the account menu's `0 14px 34px` shadow, which remains the system's
  one sanctioned floating shadow. Plates share it; they do not add a second
  recipe (The Shadow-Is-Motion Rule).
- **A plate's action is a ruled row** (`.plate-row-btn`) — full width, under a
  hairline, ivory ink, brass-free. Not a button floating inside a box (Lists Are
  Ruled, Not Tiled). Its content rows (`.plate-menu-row`) wash brass on hover,
  exactly like a catalog row.
- **Not a modal, and does not trap focus.** Escape closes and hands focus back
  to the trigger; tabbing past the last control leaves, and leaving closes. A
  plate declaring `role="menu"` wires arrow keys, Home and End across its rows,
  and opening it from the keyboard lands on the first row — opening it by
  pointer does not.

**The two inks hold.** Copy Prompt keeps the header's single star-blue and the
one caret in the app — it is the only control up there whose label promises an
immediate result, so it alone has to say a choice comes first. The plate itself
is ink, hairline and brass; nothing inside it is blue but a focused field's
border.

**Where a plate is wrong.** Anything needing real room, or reached from
somewhere other than its own trigger, stays a centred modal: the Share panel,
Confirm, and login itself both on touch — where a plate sits exactly where the
on-screen keyboard is about to — and when the Share flow opens it. The test is
`(pointer: coarse)`, not a width, matching the flashcard's buttons.

### Mode Icons
`24px` line SVGs (`stroke="currentColor"`, no fill) — **Brass Dim** at rest, Brass
on hover, Star Blue Light when selected. They are markings before they are buttons.

### Scrollbars
Thin, transparent track, `rgba(233,230,224,0.16)` thumb → `0.32` on hover.
`scrollbar-width`/`scrollbar-color` set once on `html`; `::-webkit-scrollbar` rules
live only inside `@supports not (scrollbar-color: auto)`, so macOS keeps its native
overlay behavior. **Not the accent** — a scrollbar is on every long screen at once,
and belongs to the neutral ladder like a rule.

### Toggle
A `38×20px` track at `2px` radius with a `14px` square thumb. Checked fills the
track Star Blue and slides the thumb to white. Deliberately not a pill.

### Segmented Pill
A `3px` radius track (not `999px`) holding equal-width labels, with a thumb one
segment wide sliding by `translateX(100% × index)` over 220ms. Labels are set in
the plate-label voice; the selected one turns white. Radios are visually hidden
inside the labels so the group is keyboard-operable. Cap it at three.

## Do's and Don'ts

### Do:
- **Do** keep Star Blue for the one actionable/selected element per view, and
  brass for everything that annotates (The Two-Inks Rule).
- **Do** build new structure from rules and space before reaching for a plate —
  most content in this system sits directly on the ink.
- **Do** answer a header control with an anchored plate, not an overlay — a
  two-item choice or a single field is not worth dimming the page and walking
  the pointer to the middle of the screen and back.
- **Do** set every piece of metadata in the plate-label voice (The
  One-Annotation-Voice Rule).
- **Do** use Newsreader for headings *and* reading roles, at weight 400.
- **Do** let Success Green and Alert Red appear only as correct/incorrect feedback
  (The Feedback-Only Rule).

### Don't:
- **Don't** add a gradient fill, a colored glow, a glowing shadow, or
  gradient-clipped text anywhere (The No-Glow Rule). This is the single rule that
  keeps the app from sliding back into looking generated.
- **Don't** reintroduce radii above `4px`, pills, or discs. Corners are the system.
- **Don't** lay content out as a grid of identically-bordered cards. If the content
  is a list, rule it.
- **Don't** add `backdrop-filter`/blur — this system is ink and rules, not glass.
- **Don't** let a mode's hue out of `#flashcard-screen`.
- **Don't** add drop shadows to static, at-rest surfaces (The Shadow-Is-Motion
  Rule).
- **Don't** add bright, multi-color, gamified educational-app styling — badges,
  confetti, mascots, cheerful illustration, color emoji icons. The project is
  explicitly "not a Quizlet clone."
- **Don't** style focus with a glow or ring. The cue is a border shift to Star Blue
  Light — or, inside the Flashcard screen, to the mode's `-light`.
