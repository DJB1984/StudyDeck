---
name: StudyDeck
description: A dependency-light, AI-agnostic web app for practicing, testing, and flashcard-drilling AI-generated study decks.
colors:
  void-navy: "#080d16"
  surface: "#11161f"
  surface-raised: "#1a2029"
  border-hairline: "rgba(255, 255, 255, 0.08)"
  scrollbar-thumb: "rgba(255, 255, 255, 0.16)"
  starlight-blue: "#3093ec"
  starlight-blue-light: "#63b3ff"
  starlight-blue-deep: "#0267c7"
  nebula-ember: "#ef852e"
  nebula-pink: "#c841a5"
  mode-standard-fill: "#1673cf"
  mode-mastery-tint: "#a2519a"
  mode-mastery-light: "#d68cc9"
  mode-mastery-fill: "#8f4489"
  text-primary: "#e1e5eb"
  text-muted: "#79818d"
  on-accent: "#ffffff"
  success-green: "#5dc879"
  alert-red: "#f75d59"
typography:
  display:
    fontFamily: "'Space Grotesk', 'Inter', sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  heading:
    fontFamily: "'Space Grotesk', 'Inter', sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  question:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1.2rem"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "normal"
  label:
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, Consolas, monospace"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "20px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.starlight-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  panel-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  panel-selectable:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px 20px"
  input-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
---

# Design System: StudyDeck

## Overview

**Creative North Star: "Starfield"**

StudyDeck's surface is a deep-space navy void with solid, layered panels resting on it — flat fills stepped up in lightness (void → surface → surface-raised), edged with a hairline 8% white border. This is a deliberate departure from the prior "Dark Liquid Glass" identity: there is no `backdrop-filter` anywhere in the system. Depth now comes from tonal layering and a hairline edge, not translucency or blur.

Starlight Blue is the system's one everyday accent, governing every primary button, progress fill, selected card, and focused input — its rarity is what makes it read as intentional. A second, multi-hue "Nebula" gradient (ember → pink → starlight blue) exists in the system, but it is reserved exclusively for Home's hero header — the system's one Signature Moment, mirroring how the prior system reserved the flashcard flip as its one expressive beat. Nebula never appears on a button, a selection state, or anything a visitor interacts with; if it did, Starlight Blue's rarity — and the reliability of "blue means interactive" — would break.

Typography moved from a zero-webfont, borrowed-OS-font system to three purposeful self-hosted faces: Inter for all body/UI copy, Space Grotesk for headings and the hero wordmark, and JetBrains Mono for code/metadata. Density, spacing scale, layout grid, and screen-transition motion are unchanged from the prior system — this redesign replaces the *material and palette*, not the product's structure or interaction model.

**Key Characteristics:**
- Solid tonal-layered panels on a deep-space navy void — no blur, no translucency anywhere
- One accent (Starlight Blue) for everyday interactive/selected state; Nebula reserved to two places — Home's hero gradient, and the muted per-mode casts of the two Flashcard atmospheres
- Three purposeful webfonts (Inter / Space Grotesk / JetBrains Mono), replacing the prior system-font-only rule
- Correct/incorrect green and red are feedback-only, never decorative (carried over unchanged)
- Procedural star fields appear in exactly two places: the static decoration behind Home's header, and Flashcards' live per-mode atmosphere

## Colors

A near-black navy canvas with tonal-layered solid panels, one confident blue accent, and a reserved multi-hue gradient held back for exactly one moment.

### Primary
- **Starlight Blue** (`#3093ec`): the system's one everyday accent fill — primary buttons (as a top-to-bottom gradient into Starlight Blue Deep), progress-bar fill, selected-card border/tint, toggle-on state, focused-input border (as Starlight Blue Light). Never used as a background wash.
- **Starlight Blue Light** (`#63b3ff`): the accent's "active/light" counterpart — hover/focus borders, link/label color on dark surfaces, flashcard answer text, graph line color.
- **Starlight Blue Deep** (`#0267c7`): the gradient base for filled buttons and the slider fill's leading edge.

### Nebula (reserved — see Named Rules)
- **Nebula Ember** (`#ef852e`) / **Nebula Pink** (`#c841a5`): combine with Starlight Blue in a conic gradient (`--nebula-gradient`) used by exactly one thing: the radial glow behind Home's hero header. Never appears on interactive chrome.

### Flashcard Mode Atmospheres (Nebula's one other home)
Nebula's second sanctioned appearance, and its only one outside Home: the two Flashcard study modes. Each mode owns a four-token family (`--mode-{name}-tint / -light / -fill / -veil`), projected onto the screen through four scoped properties (`--mode-tint`, `--mode-light`, `--mode-fill`, `--mode-veil`) that `#flashcard-screen[data-mode]` reassigns.

- **Standard** — Starlight Blue (`#3093ec` / `#63b3ff` / fill `#1673cf`): the system's everyday accent, unchanged. The mode that adds nothing also changes nothing.
- **Mastery** — muted Pink (`#a2519a` / `#d68cc9` / fill `#8f4489`): Nebula Pink pulled far down in saturation into a deep-space cast.

`-tint` is the identity hue (rims, the card's tonal cast, the hint dot); `-light` is the readable-on-void variant (flipped-card answer text, the progress tally, the ambient particles); `-fill` is a deliberately deeper tone used where white sits on top — the pill's label and the filled button's gradient base — so every mode clears 4.5:1; `-veil` is the radial ground wash. All four are registered via `@property` as `<color>`, so switching modes interpolates the hue over 700ms instead of snapping.

### Neutral
- **Void Navy** (`#080d16`): the page background — a near-black with a cool navy undertone, never pure `#000`.
- **Surface** (`#11161f`): the solid fill for every panel/card at rest.
- **Surface Raised** (`#1a2029`): the same surfaces on hover, or a card's next tonal step up — a lightness step, not a hue change.
- **Border Hairline** (`rgba(255, 255, 255, 0.08)`): the 1px edge on every panel.
- **Scrollbar Thumb** (`rgba(255, 255, 255, 0.16)`, hover `0.32`) on a transparent track: the same white-alpha ladder the borders sit on, one step above the hairline. Deliberately not the accent — see Scrollbars under Components.
- **Text Primary** (`#e1e5eb`): primary text — a cool off-white, never pure `#fff` outside the hero gradient's top stop.
- **Text Muted** (`#79818d`): secondary/meta text — timestamps, hints, subtitles, progress labels.

### Semantic
- **Success Green** (`#5dc879`): correct-answer highlight only.
- **Alert Red** (`#f75d59`): incorrect-answer highlight, delete-button hover, error-toast border.

### Named Rules
**The Signal Rule.** Starlight Blue is the only color that means "you can act on this" or "this is selected." It appears on exactly one thing per view — the current primary action, the active selection, or the in-progress fill — and never as decoration.

**The Nebula-Is-Rare Rule.** Nebula has exactly two sanctioned homes system-wide: the full-saturation conic gradient behind Home's hero, and the deeply muted cast of Flashcards' Mastery atmosphere. Nowhere else — never a button fill, never a chart or decoration color. Anything beyond those two breaks both Nebula's own impact and Starlight Blue's claim to "interactive."

**The Mode-Owns-Its-Screen Rule.** Inside the Flashcard screen the mode's hue *replaces* Starlight Blue as the accent: ambience, rims and tonal casts take it, and so does every control that would otherwise be blue — the filled button, the switches, the pill's thumb, focus rings. The screen therefore still has exactly one color meaning "act here" (The Signal Rule holds; the color it resolves to is what changed). Nothing outside `#flashcard-screen` is touched — the mode hue never leaks past that screen, and Starlight Blue remains the app's accent everywhere else. Alert Red is the one exception inside the screen: a destructive button's red is a warning, not a theme.

This reversed an earlier rule (the *Atmosphere-Is-Not-A-Control Rule*, which held every control on the screen to Starlight Blue); changed 2026-08-18 at Davis's call, because a blue Know It button on a purple Mastery screen read as a leftover from the other mode rather than as a signal.

**The Feedback-Only Rule.** Success Green and Alert Red exist solely to answer "was this right or wrong." They never appear as generic UI accents, chart colors, or decoration outside a quiz-feedback context.

## Typography

**Display/Heading Font:** `'Space Grotesk', 'Inter', sans-serif` — self-hosted (`@fontsource/space-grotesk`, weights 600/700).
**Body Font:** `'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` — self-hosted (`@fontsource/inter`, weights 400/500/600/700).
**Label/Mono Font:** `'JetBrains Mono', ui-monospace, Consolas, monospace` — self-hosted (`@fontsource/jetbrains-mono`, weights 400/500), used for the deck-JSON paste textarea and the quiz timer.

**Character:** A geometric, slightly technical display face (Space Grotesk) sits over a highly legible workhorse body face (Inter) — headings feel considered without becoming decorative, and body copy stays maximally readable at study-session length.

### Hierarchy
- **Display** (700, `2rem`, `1.25` line-height, Space Grotesk): `h1` only — currently just Home's "StudyDeck" hero wordmark, rendered with the gradient-text treatment (see Components).
- **Heading** (700, `1.4rem`/`1.1rem`, Space Grotesk): `h2`/`h3` — screen titles ("Results", "Flashcards"), modal titles, mode-card names.
- **Question** (400, `1.2rem`, `1.7` line-height, Inter): the primary reading role — quiz question text and flashcard front/back copy. Flashcard copy is the one fluid role in the system: `clamp(1.3rem, 1.05rem + 0.85vw, 1.75rem)` at `1.55`, because the card it sits in is itself sized off the viewport (see Flashcard, below) and fixed type in a growing frame reads as an under-filled card rather than a generous one.
- **Body** (400, `1rem`, Inter): default UI copy, answer-button and button label text.
- **Label** (400, `0.72–0.9rem`, usually Text Muted, Inter): the workhorse size for surrounding chrome — meta text, progress labels, hints, breakdown rows, form descriptions.
- **Mono** (400, `0.85rem`, JetBrains Mono): the deck-JSON paste textarea and the quiz session timer; never used for prose.

### Named Rules
**The Three-Voice Rule.** Every text role resolves to exactly one of three faces — Space Grotesk (headings), Inter (everything else prose/UI), JetBrains Mono (code/timestamps/metadata). A fourth face, or using Space Grotesk below heading scale, breaks the system.

## Layout

Unchanged from the prior system: a single centered column, `max-width: 960px`, with `32px` top / `24px` side / `64px` bottom padding. No sidebar, no multi-column dashboard, no persistent chrome outside that column. One full-page screen mounts at a time and fades/slides in (150ms). Responsive behavior comes from CSS Grid `auto-fill`/`auto-fit` + `minmax()` rather than explicit breakpoints. The spacing scale (`8 / 12 / 16 / 24 / 32px`) governs gaps and internal padding consistently.

Every screen is a top-anchored document inside that column, with one exception: Flashcards fills the viewport height and sizes its card off the leftover space (see Components → Flashcard). It qualifies because the card is the screen's entire content; a screen with a list, a form, or a results breakdown on it does not, however much void sits under it.

## Elevation & Depth

No blur, no translucency, no shadow-based elevation at rest. Depth comes entirely from solid tonal layering: Void Navy (page) → Surface (panel) → Surface Raised (panel hover, or a nested/next-step surface), each a flat fill one lightness step up from the last, edged with a 1px Border Hairline. A panel reads as "raised" purely through that lightness contrast against its background, never through shadow or blur.

### Shadow Vocabulary
- **Floating-drag** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4)`): the order-list item currently being dragged.
- **Tooltip-lift** (`box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45)`): the graph axis-label hover tooltip.

### Named Rules
**The Shadow-Is-Motion Rule.** Shadow appears only on an element the user is actively moving or hovering out of flow — never on a static, at-rest surface. If a new component needs a shadow at rest, that's a signal it isn't actually part of this system.

## Shapes

`16px` radius (the `--radius` token) is the system's signature curve: every panel, the flashcard, graph containers, and the error toast all share it. Interactive controls step down to `12px` (buttons, inputs, answer/order rows); the smallest chrome (icon buttons, drag/order step buttons, tooltips) uses `8px`. Fully circular elements — the step-number badge, the auth avatar circle, toggle-switch tracks/thumbs — use `50%` or a radius equal to half their own height. Border weight is still the system's tell for interactivity: static surfaces get a 1px Border Hairline; anything clickable/selectable (mode cards, copy-prompt option cards) steps up to 2px, then shifts to Starlight Blue Light + a faint blue tint when selected.

## Components

### Buttons
- **Shape:** `12px` radius.
- **Primary:** a top-to-bottom gradient from Starlight Blue into Starlight Blue Deep, white text, `10px 20px` padding, a soft blue glow shadow (`0 2px 10px rgba(2,103,199,0.35)`); hover brightens via `filter: brightness(1.12)`, press scales to `0.97`. The only element permitted this gradient fill — no other component uses it.
- **Ghost:** transparent fill, Text Muted text, `1px` Border Hairline; hover brightens text to Text Primary and the border. Used for secondary/dismissive actions.
- **Disabled:** `opacity: 0.35`, default cursor, no hover or press response.

### Cards / Containers
- **Corner Style:** `16px` radius, uniform across every card type.
- **Background:** Surface at rest, brightening to Surface Raised on hover.
- **Shadow Strategy:** none — see Elevation & Depth.
- **Border:** `1px` Border Hairline on static cards; the selectable variant (mode cards, copy-prompt options) uses `2px` and shifts to Starlight Blue Light with a faint blue tint (`rgba(48, 147, 236, 0.14)`) when selected.
- **Internal Padding:** `16px` for a standard card, `24px 20px` for larger selectable cards, `28px` for modal cards.

### Inputs / Fields
- **Style:** solid dark fill (Surface, or `rgba(0,0,0,0.25)` for the larger JSON textarea), `1px` Border Hairline, `10–12px` radius.
- **Focus:** border shifts to Starlight Blue Light — a clean color-only cue, no glow or ring.
- **Error / Disabled:** no inline field-error state exists; errors surface globally via the toast.

### Navigation (Progress Header)
No persistent top nav — each screen is a full-page state. Practice, Test, and Review share one Progress Header: a ghost ✕ "abandon" icon, a compact progress-text label, and a `4px` Surface-Raised track filled by Starlight Blue as the session advances.

### Home Hero (signature moment)
Home's header sits inside `.home-hero`: a radial navy glow plus a static procedural starfield (`Starfield.tsx` — ~48 small dots at fixed pseudo-random positions, gently twinkling, `prefers-reduced-motion`-aware) behind the title row only. The "StudyDeck" `h1` renders with a top-to-bottom white-to-Text-Hero-End (`#abbfdf`) gradient-text treatment, standing alone as the wordmark. This is the only screen with either the starfield or the gradient text; everywhere else stays on the plain Void Navy background with solid Text Primary type.

### Flashcard (signature interaction)
A real 3D CSS flip (`perspective: 1400px`, `rotateY(180deg)`, `400ms ease`) reveals the answer in the mode's own light. "Know It" slides the card off-screen with rotation and fade; "Still Learning" shakes it in place.

**The card is sized as a stage, not as a panel.** Flashcards is the one screen in the app with a single object on it and nothing below the fold, so `#flashcard-screen` is a full-height flex column (`100dvh` less `#app`'s padding and the ambience canvas's bottom overhang) and the card takes every pixel the chrome above it doesn't — `flex: 1` between a `280px` floor and a `500px` ceiling, `760px` wide at most. That puts a full-size card at roughly 3:2, the proportions of a 6×4 index card, which is what lets a one-word front read as generous rather than as empty. Because the floor is fixed, the width steps down with the viewport height (`640px` under `820px` tall, `560px` under `680px`) so a short window gets a smaller card instead of a letterboxed one. Padding and type scale with the frame.

This is the only screen permitted to claim the viewport this way. Every other screen stays a top-anchored document in the standard column — the flashcard earns it by being the entire content of its screen.

### Flashcard Atmosphere (second signature moment)
Behind the flashcard sits `FlashAmbience.tsx`, a Canvas 2D field that gives each study mode its own physics — the visible difference between the two modes, and the only animated decoration in the app outside Home's starfield.

- **Standard** — stars breathe in place around fixed homes and twinkle out of phase. Nothing travels, because nothing is at stake.
- **Mastery** — an accretion disc: inner particles sweep faster than outer ones around a foreshortened ellipse, with a central core whose brightness scales with the share of the deck already mastered.

Both are pure functions of `(particle, time)` over one fixed pool, so a mode switch **crossfades by lerping each particle between its two mode positions** — the field physically flies from one behavior into the other over 700ms, matched to the CSS `@property` hue transition. Sorting a card fires a small expanding ring off the Mastery core. The canvas overhangs the active area and carries a radial vignette mask so no edge of it is ever visible as a line; it pauses when the tab is hidden or it scrolls out of view, and under `prefers-reduced-motion` it renders one composed still frame per mode.

**It is frozen by default.** Decoration is opt-in on a study screen — a compact "Play motion" button in the options row starts it, the label names the action it will take rather than asking anyone to read state off a switch, and the choice is remembered per device. The atmosphere survives the freeze intact: hue, card rim, tonal cast and a composed still frame all read exactly as they do in motion, so the default costs the mode nothing. Motion off also suppresses the 700ms hue interpolation — the effect is one thing, and half of it left running on a screen someone asked to hold still is worse than none of it.

### Mode Icons
Practice/Test/Review use small `24px` line-SVG icons (`stroke="currentColor"`, `1.6` stroke width, no fill) instead of color emoji — Text Muted at rest, Starlight Blue Light when the card is selected. Replaces the prior full-color-emoji icons, which were the one ornamental element left over from before this redesign.

### Scrollbars
- **Style:** a thin bar with a transparent track and a `rgba(255,255,255,0.16)` thumb, brightening to `0.32` on hover. Because the track carries no fill, the same bar reads correctly over the Void Navy page and inside a panel or the JSON textarea.
- **Not the accent.** A scrollbar is present on every long screen at once, so a Starlight Blue thumb would put the app's one "act here" color on chrome the student never needs to look at (The Signal Rule). The scrollbar belongs to the tonal ladder, like a border.
- **Standard properties first.** `scrollbar-width`/`scrollbar-color` are set once on `html` and inherit to every scroll container, so macOS keeps its native overlay behavior — `::-webkit-scrollbar` would force a permanent gutter there. The `-webkit-` rules exist only inside `@supports not (scrollbar-color: auto)`, for Chrome < 121 and Safari < 18.2.

### Toggle
- **Style:** a `38×22px` pill track (Surface Raised fill, Border Hairline) with a `14px` circular thumb. Checked state fills the track Starlight Blue and slides the thumb to white.

### Segmented Pill
- **Style:** a fully-rounded track (Panel fill, Border Hairline, `3px` padding) holding equal-width labels, with a Starlight Blue thumb one segment wide (`calc((100% - 6px) / n)`) that slides between them by `translateX(100% × index)` (`220ms`, `cubic-bezier(0.4, 0, 0.2, 1)`, suppressed under `prefers-reduced-motion`). The selected label turns white; unselected stay Text Muted.
- **Use for:** picking between two or three named, mutually exclusive modes of the same activity (Flashcards' Standard / Mastery). Use the Toggle instead for an on/off option layered on top of a default — a toggle leaves its off state unnamed, which is exactly wrong when the choices are all real modes. Cap it at three: past that the labels get too narrow to read at this size, and it wants a dropdown.
- **Markup:** visually-hidden radios inside the labels (same hidden-input treatment as Toggle) so the group is keyboard-operable and announces as one control.

## Do's and Don'ts

### Do:
- **Do** keep Starlight Blue reserved for the single actionable or selected element per view (The Signal Rule).
- **Do** build new surfaces from the panel recipe — Surface fill, `1px` Border Hairline, `16px` radius — rather than reintroducing blur/glass.
- **Do** use Inter for body/UI text, Space Grotesk only at heading scale, and JetBrains Mono strictly for code/metadata (The Three-Voice Rule).
- **Do** let Success Green and Alert Red appear only as quiz correct/incorrect feedback (The Feedback-Only Rule).

### Don't:
- **Don't** add `backdrop-filter`/blur anywhere — this system is solid, tonal-layered panels, not glass.
- **Don't** use the Nebula gradient on anything interactive, or take its hues anywhere beyond Home's hero and the Flashcard mode atmospheres (The Nebula-Is-Rare Rule).
- **Don't** let a mode's hue out of `#flashcard-screen` — inside it the mode hue is the accent and every blue control follows it, but the rest of the app stays Starlight Blue (The Mode-Owns-Its-Screen Rule).
- **Don't** add drop shadows to static, at-rest surfaces — depth comes from tonal layering, not elevation (The Shadow-Is-Motion Rule).
- **Don't** add bright, multi-color, gamified educational-app styling — badges, confetti, mascots, cheerful illustration, color emoji icons. The project is explicitly "not a Quizlet clone."
- **Don't** style focus states with a glow or ring. The established cue is a border-color shift to Starlight Blue Light — or, inside the Flashcard screen, to the mode's `-light` (The Mode-Owns-Its-Screen Rule).
