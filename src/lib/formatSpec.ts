// The AI-facing prompts, composed at build time (?raw) from a per-deck-type
// schema contract plus a matching per-deck-type "how to respond" intro. The
// Copy Prompt modal asks Quiz vs Flashcards up front, so each composed prompt
// only carries the one schema it actually needs (deck type no longer has to be
// inferred mid-conversation). The quiz contract inlines every answer format and
// context add-on as a compact delta off mcq, so a pasted prompt is fully
// self-contained — no runtime fetch, and formats work on AI surfaces without
// browsing.
//
// There used to be a second Quick/Guided axis; the Quick variants are archived
// under prompts/archive/ and no longer imported. The surviving intros always
// confirm purpose/scope first (capped at one follow-up round).
import quizSpec from '../../prompts/studydeck-quiz-spec.md?raw';
import flashcardSpec from '../../prompts/studydeck-flashcard-spec.md?raw';
import quizIntro from '../../prompts/studydeck-quiz-intro.md?raw';
import flashcardIntro from '../../prompts/studydeck-flashcard-intro.md?raw';

export const QUIZ_PROMPT_MD: string = quizIntro + '\n\n---\n\n' + quizSpec;
export const FLASHCARD_PROMPT_MD: string = flashcardIntro + '\n\n---\n\n' + flashcardSpec;
