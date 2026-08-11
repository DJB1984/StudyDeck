// The AI-facing prompts, composed at build time (?raw) from a per-deck-type
// schema contract plus a matching per-deck-type "how to respond" intro. The
// Copy Prompt modal now asks Quick/Guided x Quiz/Flashcard up front, so each
// composed prompt only carries the one schema it actually needs (deck type
// no longer has to be inferred mid-conversation). The quiz contract
// documents mcq inline and points the AI at studydeck.brookslanding.com/
// formats/*.md (served from public/formats/) for the other answer formats,
// fetched only if the material actually calls for one — mcq itself still
// needs no runtime fetch and works offline.
import quizSpec from '../../prompts/studydeck-quiz-spec.md?raw';
import flashcardSpec from '../../prompts/studydeck-flashcard-spec.md?raw';
import quickQuizIntro from '../../prompts/studydeck-quick-quiz-intro.md?raw';
import quickFlashcardIntro from '../../prompts/studydeck-quick-flashcard-intro.md?raw';
import guidedQuizIntro from '../../prompts/studydeck-guided-quiz-intro.md?raw';
import guidedFlashcardIntro from '../../prompts/studydeck-guided-flashcard-intro.md?raw';

export const QUICK_QUIZ_PROMPT_MD: string = quickQuizIntro + '\n\n---\n\n' + quizSpec;
export const QUICK_FLASHCARD_PROMPT_MD: string = quickFlashcardIntro + '\n\n---\n\n' + flashcardSpec;
export const GUIDED_QUIZ_PROMPT_MD: string = guidedQuizIntro + '\n\n---\n\n' + quizSpec;
export const GUIDED_FLASHCARD_PROMPT_MD: string =
  guidedFlashcardIntro + '\n\n---\n\n' + flashcardSpec;
