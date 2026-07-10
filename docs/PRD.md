---
type: prd
project: StudyDeck
date: 2026-06-29
status: active
tags: [studydeck, prd, planning]
---

## Overview

[[StudyDeck]] is a lightweight runtime and player for AI-generated study decks. The AI generates the content. StudyDeck provides the polished environment for practice, testing, flashcards, review, and progress tracking. Students load a `.json` file, pick a mode, and study. StudyDeck intentionally contains no built-in AI, making it AI-agnostic and compatible with [[Claude]], [[ChatGPT]], [[Grok]], [[Gemini]], or any future model capable of generating a valid StudyDeck JSON file.

## Problem

College students using AI to study get generic answers because the AI doesn't know their course materials. The [[study-system-operating-instructions|study system]] solves the generation side — give Claude your professor's slides, get grounded questions back. But there's no dedicated tool to practice from those questions. Copying questions into a chat is tedious. Khan Academy and Quizlet are closed ecosystems. StudyDeck fills the gap: open, shareable, AI-agnostic.

## Users

Primary: Davis and college friends sharing `.json` study sets. Secondary: anyone who wants a lightweight, open-source quiz tool they can run locally or host statically.

## Modes

**Quiz — Practice.** One question per page. Immediate right/wrong feedback after each answer. Wrong answers can be retried; retries don't affect stats. Copy-to-AI button on wrong answers generates a pre-formatted prompt the student pastes into any AI for an explanation.

**Quiz — Test.** Same flow, no feedback until the end. No retries. Stats screen shows collapsed correct answers and expanded wrong ones so the student can review what they missed.

**Flashcard.** Front = question, back = correct answer only (no multiple choice options). Quizlet-style flip animation. Cards are sorted into Know It / Still Learning piles. Student can drill the Still Learning pile or all cards. Pile state persists in localStorage per file between sessions.

## Core Features

**Home screen.** Lists all previously loaded `.json` files (persisted via localStorage). Clicking a file loads it instantly. New files added via drag-and-drop or file picker (browser remembers last folder natively). Each file card has a trash/delete button — deleting a file removes it from history and clears its flashcard pile state, keeping localStorage clean. All storage writes handle quota errors gracefully.

**Question rendering.** Full KaTeX support for math and physics notation using `$...$` (inline) and `$$...$$` (display). Graphs rendered with Chart.js — supports data point arrays or equation strings, required axis labels and title.

**Stats screen.** Pie chart showing % correct. Per-question breakdown. Retake or review buttons.

**Format spec file.** A shareable markdown document (lives in the vault at `Resources/`) that tells any AI exactly how to generate a valid StudyDeck `.json`. Covers schema, LaTeX conventions, graph format, stable question IDs, versioning, and best practices for answer quality.

**Statistics.** All sessions track first-attempt correctness and total session duration. Test mode additionally tracks time spent per question. Retry attempts never affect first-attempt scoring.

## Success Criteria

- A friend with no setup knowledge can download the HTML file, generate a `.json` with any AI using the format spec, and complete a study session in under 5 minutes.
- Math and graph questions from a physics course render correctly.
- Flashcard progress persists between browser sessions.
- Works on Windows and Mac in any modern browser without installation.

## Non-Goals

- No built-in AI generation (keeps it dependency-free and AI-agnostic).
- No backend, no accounts, no sync — everything is local.
- No multi-subject filtering or tagging in v1.
- No graph-as-answer-choice (only graphs as question context).
- No timed quiz mode in v1.
- No explanation field in JSON — copy-to-AI handles this.
