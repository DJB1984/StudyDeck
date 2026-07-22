---
type: prd
project: StudyDeck
date: 2026-07-21
status: draft
tags: [studydeck, prd, planning, question-types]
---

## Overview

Extends [[StudyDeck]]'s core PRD (`PRD.md`) with a batch of new question/answer formats. The current app's differentiator over "just ask ChatGPT for practice questions" is real math rendering (KaTeX) and graphs (Chart.js) — but both are read-only today: multiple choice is the only way to answer anything. This batch adds gradeable free-response input, click-based graph/table interaction, structured selection formats, and real client-side code execution — things a stateless chat window cannot give a student, regardless of how good its questions are.

## Problem

A chat conversation can hand a student a question, but it can't: grade a typed numeric answer deterministically without being re-asked, let a student interact with a graph or a data table instead of just reading it, track structured formats that match how their actual exams are shaped, or run and test code they wrote. Several of the formats below aren't novelty — they're the native format of real exams in specific majors:

- Nursing (NCLEX): select-all-that-apply and prioritization/ordering questions are the dominant real exam format, not a nice-to-have.
- Computer science: writing and testing real code (JavaScript, Python, Java) is how CS courses actually assess understanding, not multiple choice.
- Business: reading and computing from a data table (financial statements, schedules) is a routine assessment format.
- Cybersecurity: recalling exact command syntax is a real, if lower-priority, study need.

## Users

Same as the core PRD (Davis and college friends sharing `.json` decks), extended to the specific coursework this batch targets: nursing/health-sciences students (select-all-that-apply, drag-to-order, numeric dosage-style calculations), business students (data tables, existing graph engine applied to business content), CS students (code-execution questions in JavaScript, Python, and Java), and cybersecurity students (command-line syntax recall, lowest priority).

## New Question/Answer Formats

**Free-response & numeric input**
- **Numeric free-response.** Type a plain number as the answer instead of picking from 4 choices, graded within a tolerance the deck author sets. v1 is numbers only — no fractions, variables, or symbolic expressions (that's future work, see Non-Goals).
- **Slider input.** Same grading as numeric free-response, but the student drags a slider to a value instead of typing one — useful for estimation-style questions.

**Structured selection**
- **Select-all-that-apply.** A question can have more than one correct answer among its options; the student must select the full correct set. Matches the NCLEX SATA format directly.
- **Drag-to-order.** The student drags a shuffled list of items into the correct sequence — matches NCLEX-style prioritization questions, and works for any ordered process (steps of a derivation, historical sequence, etc.).

**Context objects**
- **Data tables.** A question can show a real rendered table (not an image) as context — a financial statement, a dataset, a schedule — the same way `graph` already provides chart context today. The student can then answer via normal multiple choice or a numeric free-response computed from the table.

**Graph interaction**
- **Graph click-to-answer.** Instead of choosing from text answers, the student clicks directly on the rendered graph (e.g. "click the vertex," "click where the curve crosses zero"). The graph stops being purely illustrative and becomes the answer surface itself.

**Code**
- **Code-execution questions (JavaScript, Python, Java).** A real code editor is embedded in the question. Grading happens in up to three independent layers: does the code even parse (syntax), does it have the required structure (e.g. a "write a class for X" prompt checking required names/methods exist), and does it behave correctly against test cases the deck author defines. Not every question needs all three layers — a pure syntax/structure question doesn't need test cases, and vice versa. All three languages run fully client-side (no backend) — JavaScript natively, Python via Pyodide, Java via CheerpJ.

**Flashcards**
- **Type-the-answer flashcards.** A flashcard deck can require the student to type their answer before flipping, rather than just flipping to self-grade. Especially useful for memorization-heavy content like syntax or terminology, where guessing "I probably knew that" is easy to fool yourself with.

**Optional, lowest priority**
- **Command-line syntax matching.** A free-response format (usable as a quiz question or a type-the-answer flashcard) specifically for recalling exact CLI command syntax. Not a real shell or filesystem — grading tolerates harmless variation (extra whitespace, reordered flags like `-la` vs `-al`) while still requiring the student to actually know the command, rather than picking it out of a list.

## Success Criteria

- A numeric free-response question correctly accepts an answer within its stated tolerance and rejects one outside it.
- A select-all-that-apply question requires the full correct set to be selected — partial selections are marked incorrect, matching real SATA grading.
- A drag-to-order question grades the exact sequence, and the initial display order is always shuffled (never shown pre-solved).
- A graph click-to-answer question accepts a click within its tolerance radius of the target point and rejects one outside it, on both mouse and touch input.
- A data table renders legibly on both desktop and mobile widths without horizontal overflow breaking the layout.
- A JavaScript code question runs a student's submission against author-defined test cases and reports pass/fail per case, without ever crashing the app on malformed code (same never-throw contract as `Graph.tsx`).
- A Python or Java code question executes correctly the first time a student reaches that question type, with a visible loading state while the runtime downloads (not a silent hang).
- A type-the-answer flashcard deck grades typed input before allowing flip, using the same tolerance/matching rules as numeric or command free-response, whichever fits the content.

## Non-Goals / Backlog

- **Diagram/image hotspot labeling (e.g. click-to-label a heart diagram).** Considered and explicitly rejected. No existing library targets this well enough, and building it properly would require StudyDeck to start curating and shipping its own diagram content library — a first-of-its-kind content-ownership commitment for an app that otherwise ships zero subject matter of its own. Not worth the cost right now.
- **C++ code execution.** Deferred, not abandoned. Unlike JavaScript/Python/Java, there's no clean no-backend path: the mature option (Judge0/Piston-style sandboxed execution) is a real backend dependency, and the alternative (in-browser Clang/WASM compilation) is real but meaningfully less mature than Pyodide or CheerpJ. Needs its own deliberate architecture decision later.
- **Full symbolic/algebraic free-response** (fractions, variables, expression equivalence like `2x+4` vs `2(x+2)`). Deferred phase of numeric free-response — v1 is plain numbers only.
- **Simulated terminal / fake filesystem (CTF-style command practice).** The "ambitious" tier of the command-line idea — actually navigating a virtual filesystem rather than just typing a remembered command. Not in scope; only worth revisiting if the lightweight command-matching format proves there's real demand.
