---
name: StudyDeck
description: A dependency-light, AI-agnostic web app for practicing, testing, and flashcard-drilling AI-generated study decks.
colors:
  void-navy: "#080d16"
  surface: "#11161f"
  surface-raised: "#1a2029"
  border-hairline: "rgba(255, 255, 255, 0.08)"
  starlight-blue: "#3093ec"
  starlight-blue-light: "#63b3ff"
  starlight-blue-deep: "#0267c7"
  nebula-ember: "#ef852e"
  nebula-pink: "#c841a5"
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
- One accent (Starlight Blue) for everyday interactive/selected state; one reserved gradient (Nebula) for exactly one place: Home's hero
- Three purposeful webfonts (Inter / Space Grotesk / JetBrains Mono), replacing the prior system-font-only rule
- Correct/incorrect green and red are feedback-only, never decorative (carried over unchanged)
- A procedural starfield (small twinkling dots) decorates Home's header only — nowhere else in the app

## Colors

A near-black navy canvas with tonal-layered solid panels, one confident blue accent, and a reserved multi-hue gradient held back for exactly one moment.

### Primary
- **Starlight Blue** (`#3093ec`): the system's one everyday accent fill — primary buttons (as a top-to-bottom gradient into Starlight Blue Deep), progress-bar fill, selected-card border/tint, toggle-on state, focused-input border (as Starlight Blue Light). Never used as a background wash.
- **Starlight Blue Light** (`#63b3ff`): the accent's "active/light" counterpart — hover/focus borders, link/label color on dark surfaces, flashcard answer text, graph line color.
- **Starlight Blue Deep** (`#0267c7`): the gradient base for filled buttons and the slider fill's leading edge.

### Nebula (reserved — see Named Rules)
- **Nebula Ember** (`#ef852e`) / **Nebula Pink** (`#c841a5`): combine with Starlight Blue in a conic gradient (`--nebula-gradient`) used by exactly one thing: the radial glow behind Home's hero header. Never appears on interactive chrome.

### Neutral
- **Void Navy** (`#080d16`): the page background — a near-black with a cool navy undertone, never pure `#000`.
- **Surface** (`#11161f`): the solid fill for every panel/card at rest.
- **Surface Raised** (`#1a2029`): the same surfaces on hover, or a card's next tonal step up — a lightness step, not a hue change.
- **Border Hairline** (`rgba(255, 255, 255, 0.08)`): the 1px edge on every panel.
- **Text Primary** (`#e1e5eb`): primary text — a cool off-white, never pure `#fff` outside the hero gradient's top stop.
- **Text Muted** (`#79818d`): secondary/meta text — timestamps, hints, subtitles, progress labels.

### Semantic
- **Success Green** (`#5dc879`): correct-answer highlight only.
- **Alert Red** (`#f75d59`): incorrect-answer highlight, delete-button hover, error-toast border.

### Named Rules
**The Signal Rule.** Starlight Blue is the only color that means "you can act on this" or "this is selected." It appears on exactly one thing per view — the current primary action, the active selection, or the in-progress fill — and never as decoration.

**The Nebula-Is-Rare Rule.** The Nebula gradient exists in exactly one place system-wide: Home's hero glow. It is never a button fill, a selection state, or chart/decoration color — diluting it past that one spot breaks both its own impact and Starlight Blue's claim to "interactive."

**The Feedback-Only Rule.** Success Green and Alert Red exist solely to answer "was this right or wrong." They never appear as generic UI accents, chart colors, or decoration outside a quiz-feedback context.

## Typography

**Display/Heading Font:** `'Space Grotesk', 'Inter', sans-serif` — self-hosted (`@fontsource/space-grotesk`, weights 600/700).
**Body Font:** `'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` — self-hosted (`@fontsource/inter`, weights 400/500/600/700).
**Label/Mono Font:** `'JetBrains Mono', ui-monospace, Consolas, monospace` — self-hosted (`@fontsource/jetbrains-mono`, weights 400/500), used for the deck-JSON paste textarea and the quiz timer.

**Character:** A geometric, slightly technical display face (Space Grotesk) sits over a highly legible workhorse body face (Inter) — headings feel considered without becoming decorative, and body copy stays maximally readable at study-session length.

### Hierarchy
- **Display** (700, `2rem`, `1.25` line-height, Space Grotesk): `h1` only — currently just Home's "StudyDeck" hero wordmark, rendered with the gradient-text treatment (see Components).
- **Heading** (700, `1.4rem`/`1.1rem`, Space Grotesk): `h2`/`h3` — screen titles ("Results", "Flashcards"), modal titles, mode-card names.
- **Question** (400, `1.2rem`, `1.7` line-height, Inter): the primary reading role — quiz question text and flashcard front/back copy (flashcard runs marginally larger, `1.3rem`/`1.6`).
- **Body** (400, `1rem`, Inter): default UI copy, answer-button and button label text.
- **Label** (400, `0.72–0.9rem`, usually Text Muted, Inter): the workhorse size for surrounding chrome — meta text, progress labels, hints, breakdown rows, form descriptions.
- **Mono** (400, `0.85rem`, JetBrains Mono): the deck-JSON paste textarea and the quiz session timer; never used for prose.

### Named Rules
**The Three-Voice Rule.** Every text role resolves to exactly one of three faces — Space Grotesk (headings), Inter (everything else prose/UI), JetBrains Mono (code/timestamps/metadata). A fourth face, or using Space Grotesk below heading scale, breaks the system.

## Layout

Unchanged from the prior system: a single centered column, `max-width: 960px`, with `32px` top / `24px` side / `64px` bottom padding. No sidebar, no multi-column dashboard, no persistent chrome outside that column. One full-page screen mounts at a time and fades/slides in (150ms). Responsive behavior comes from CSS Grid `auto-fill`/`auto-fit` + `minmax()` rather than explicit breakpoints. The spacing scale (`8 / 12 / 16 / 24 / 32px`) governs gaps and internal padding consistently.

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
Unchanged from the prior system: a real 3D CSS flip (`perspective: 1000px`, `rotateY(180deg)`, `400ms ease`) reveals the answer in Starlight Blue Light text. "Know It" slides the card off-screen with rotation and fade; "Still Learning" shakes it in place.

### Mode Icons
Practice/Test/Review use small `24px` line-SVG icons (`stroke="currentColor"`, `1.6` stroke width, no fill) instead of color emoji — Text Muted at rest, Starlight Blue Light when the card is selected. Replaces the prior full-color-emoji icons, which were the one ornamental element left over from before this redesign.

### Toggle
- **Style:** a `38×22px` pill track (Surface Raised fill, Border Hairline) with a `14px` circular thumb. Checked state fills the track Starlight Blue and slides the thumb to white.

## Do's and Don'ts

### Do:
- **Do** keep Starlight Blue reserved for the single actionable or selected element per view (The Signal Rule).
- **Do** build new surfaces from the panel recipe — Surface fill, `1px` Border Hairline, `16px` radius — rather than reintroducing blur/glass.
- **Do** use Inter for body/UI text, Space Grotesk only at heading scale, and JetBrains Mono strictly for code/metadata (The Three-Voice Rule).
- **Do** let Success Green and Alert Red appear only as quiz correct/incorrect feedback (The Feedback-Only Rule).

### Don't:
- **Don't** add `backdrop-filter`/blur anywhere — this system is solid, tonal-layered panels, not glass.
- **Don't** use the Nebula gradient on anything interactive — it lives on Home's hero only (The Nebula-Is-Rare Rule).
- **Don't** add drop shadows to static, at-rest surfaces — depth comes from tonal layering, not elevation (The Shadow-Is-Motion Rule).
- **Don't** add bright, multi-color, gamified educational-app styling — badges, confetti, mascots, cheerful illustration, color emoji icons. The project is explicitly "not a Quizlet clone."
- **Don't** style focus states with a glow or ring. The established cue is a border-color shift to Starlight Blue Light only.
