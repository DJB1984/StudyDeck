// App — the screen state machine. Owns navigation and the cross-screen payloads
// (current deck, quiz session, stats record, review origin). Mirrors the legacy
// Router.showScreen flow: Home → Mode Select → Quiz/Flashcard → Stats → Home,
// with a Review branch off both Mode Select and Stats.

import { useState } from 'react';
import type {
  Deck,
  HistoryEntry,
  QuizMode,
  QuizQuestion,
  QuizSession,
  SessionRecord,
} from './types';
import { Toast } from './components/Toast';
import { HomeScreen } from './features/home/HomeScreen';
import { ModeSelectScreen } from './features/modeSelect/ModeSelectScreen';
import { QuizScreen } from './features/quiz/QuizScreen';
import { StatsScreen } from './features/stats/StatsScreen';
import { ReviewScreen } from './features/review/ReviewScreen';
import { FlashcardScreen } from './features/flashcard/FlashcardScreen';

type Route =
  | { name: 'home' }
  | { name: 'mode'; file: HistoryEntry }
  | { name: 'quiz'; session: QuizSession }
  | { name: 'stats'; record: SessionRecord; session: QuizSession }
  | { name: 'review'; questions: QuizQuestion[]; order: number[]; origin: Route }
  | { name: 'flashcard'; deck: Deck };

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });

  function startQuiz(file: HistoryEntry, mode: QuizMode, order: number[], wasRandom: boolean) {
    const session: QuizSession = {
      deck: file.data,
      questions: file.data.questions as QuizQuestion[],
      mode,
      order,
      wasRandom,
    };
    setRoute({ name: 'quiz', session });
  }

  function renderScreen() {
    switch (route.name) {
      case 'home':
        return (
          <HomeScreen
            // Route by deck type: quiz decks pick a mode; flashcard decks have
            // exactly one mode, so they auto-open (Home R4/R10, ModeSelect R2).
            // Omitted `type` means quiz, same as validation.
            onOpenDeck={(entry) =>
              setRoute(
                entry.data.type === 'flashcard'
                  ? { name: 'flashcard', deck: entry.data }
                  : { name: 'mode', file: entry },
              )
            }
          />
        );

      case 'mode':
        return (
          <ModeSelectScreen
            file={route.file}
            onBack={() => setRoute({ name: 'home' })}
            onStartQuiz={(mode, order, wasRandom) => startQuiz(route.file, mode, order, wasRandom)}
            onStartReview={(order) =>
              setRoute({
                name: 'review',
                questions: route.file.data.questions as QuizQuestion[],
                order,
                origin: route,
              })
            }
          />
        );

      case 'quiz':
        return (
          <QuizScreen
            session={route.session}
            onFinish={(record) => setRoute({ name: 'stats', record, session: route.session })}
            onAbandon={() => setRoute({ name: 'home' })}
          />
        );

      case 'stats':
        return (
          <StatsScreen
            record={route.record}
            session={route.session}
            onHome={() => setRoute({ name: 'home' })}
            onReview={() =>
              setRoute({
                name: 'review',
                questions: route.session.questions,
                order: route.session.order,
                origin: route,
              })
            }
            onRetake={(order) =>
              setRoute({ name: 'quiz', session: { ...route.session, order } })
            }
          />
        );

      case 'review':
        return (
          <ReviewScreen
            questions={route.questions}
            order={route.order}
            onBack={() => setRoute(route.origin)}
          />
        );

      case 'flashcard':
        // R13: Back exits to Home — Mode Select is unreachable for flashcard decks.
        return <FlashcardScreen deck={route.deck} onBack={() => setRoute({ name: 'home' })} />;
    }
  }

  return (
    <div id="app">
      {/* key by screen name so the .screen mount animation replays on navigation */}
      <div key={route.name}>{renderScreen()}</div>
      <Toast />
    </div>
  );
}
