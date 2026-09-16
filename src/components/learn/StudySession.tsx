import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, GraduationCap, RotateCcw } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Tile } from "@/components/Tile";
import { TokenBalanceCapsule } from "@/components/TokenBalanceCapsule";
import { TokenEarnToast } from "@/components/TokenEarnToast";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { GradeButtons } from "./GradeButtons";
import { CardMedia } from "./CardMedia";
import {
  buildSession,
  previewIntervals,
} from "@/lib/learn/scheduler";
import { todayKey } from "@/lib/dates";
import { tokensEarnedOnDate } from "@/lib/economy";
import type { LearnCard, LearnGrade } from "@/lib/types";
import { useRegisterControls } from "@/store/useControls";
import { hapticSuccess, hapticTick } from "@/lib/haptic";

interface Props {
  deckId: string;
  onClose: () => void;
  onFinished?: () => void;
}

export function StudySession({ deckId, onClose, onFinished }: Props) {
  const data = useStore((s) => s.data);
  const reviewCard = useStore((s) => s.reviewCard);
  const dismissCard = useStore((s) => s.dismissCard);
  const undoLastReview = useStore((s) => s.undoLastReview);
  const completeStudySession = useStore((s) => s.completeStudySession);

  const plan = useMemo(
    () => buildSession(data, deckId, todayKey()),
    // Freeze queue on open; data changes would reshuffle mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deckId],
  );

  const [queue, setQueue] = useState<LearnCard[]>(() => plan?.cards ?? []);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [lastWasDismiss, setLastWasDismiss] = useState(false);

  const current = queue[index];
  const total = queue.length;
  const liveCard = current
    ? data.learn?.cards.find((c) => c.id === current.id) ?? current
    : undefined;

  const previews = useMemo(
    () => (liveCard ? previewIntervals(liveCard, todayKey()) : null),
    [liveCard],
  );

  const grade = (g: LearnGrade) => {
    if (!current) return;
    hapticTick();
    reviewCard(current.id, g);
    setAnswered((n) => n + 1);
    setCanUndo(true);
    setLastWasDismiss(false);
    setFlipped(false);
    if (g === "again") {
      setQueue((q) => {
        const rest = q.slice(index + 1);
        const item = q[index];
        return [...q.slice(0, index), ...rest, item];
      });
      return;
    }
    if (index + 1 >= total) {
      completeStudySession(deckId);
      setDone(true);
      hapticSuccess();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const finishOrAdvance = (nextQueue: LearnCard[], nextIndex: number) => {
    if (nextQueue.length === 0 || nextIndex >= nextQueue.length) {
      completeStudySession(deckId);
      setDone(true);
      hapticSuccess();
      return;
    }
    setIndex(nextIndex);
  };

  const dismiss = (e: MouseEvent) => {
    e.stopPropagation();
    if (!current) return;
    hapticTick();
    dismissCard(current.id);
    setAnswered((n) => n + 1);
    setCanUndo(true);
    setLastWasDismiss(true);
    setFlipped(false);
    const nextQueue = queue.filter((_, i) => i !== index);
    setQueue(nextQueue);
    finishOrAdvance(nextQueue, index);
  };

  const undo = () => {
    if (!canUndo) return;
    const restored = useStore.getState().lastLearnUndo?.before;
    if (!undoLastReview()) return;
    setCanUndo(false);
    setAnswered((n) => Math.max(0, n - 1));
    if (lastWasDismiss && restored) {
      setQueue((q) => {
        const copy = [...q];
        copy.splice(index, 0, restored);
        return copy;
      });
      setLastWasDismiss(false);
      setFlipped(true);
      return;
    }
    setFlipped(true);
  };

  useRegisterControls(
    {
      back: () => {
        if (done) onClose();
        else if (flipped) setFlipped(false);
        else onClose();
      },
      primary: () => {
        if (done) {
          onFinished?.();
          onClose();
        } else if (!flipped) setFlipped(true);
        else grade("good");
      },
      secondary: () => undo(),
    },
    [done, flipped, current, onClose, onFinished],
  );

  const [shell, setShell] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setShell(document.getElementById("app-shell"));
  }, []);

  if (!shell) return null;

  if (!plan || total === 0) {
    return createPortal(
      <div className="absolute inset-0 z-[55] flex flex-col">
        <BackgroundDecor />
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8 text-center">
          <Tile glyph="🎉" color="#2bc4a8" size={88} state="done" />
          <h2 className="mt-4 font-display text-2xl font-800 text-ink">
            Caught up
          </h2>
          <p className="mt-1 text-sm font-700 text-ink-soft">
            Nothing due in this deck right now.
          </p>
          <button onClick={onClose} className="btn mt-6">
            Back
          </button>
        </div>
      </div>,
      shell,
    );
  }

  if (done) {
    return createPortal(
      <Summary
        deckTitle={plan.deck.title}
        deckIcon={plan.deck.icon}
        deckColor={plan.deck.color}
        answered={answered}
        remaining={plan.counts.remainingAfterSession}
        onClose={() => {
          onFinished?.();
          onClose();
        }}
        onStay={onClose}
      />,
      shell,
    );
  }

  return createPortal(
    <div className="absolute inset-0 z-[55] flex min-h-0 flex-col">
      <BackgroundDecor />
      <TokenEarnToast />
      <div className="relative z-10 flex shrink-0 items-center justify-between px-4 pt-4">
        <button
          onClick={onClose}
          className="capsule flex h-10 w-10 items-center justify-center text-ink-soft active:scale-90"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="font-display text-lg font-800 text-ink">
          {plan.deck.title}
        </span>
        <button
          onClick={undo}
          disabled={!canUndo}
          className="capsule flex h-10 w-10 items-center justify-center text-ink-soft active:scale-90 disabled:opacity-30"
          title="Undo last answer"
        >
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="relative z-10 shrink-0 px-4 pt-3">
        <div className="flex items-center justify-between text-xs font-800 text-ink-soft">
          <span>
            {Math.min(index + 1, total)} of {total}
          </span>
          <span>
            {plan.counts.due + plan.counts.new > total
              ? `This sitting · ${plan.counts.remainingAfterSession} later`
              : `${Math.round((index / total) * 100)}%`}
          </span>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/70">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(index / Math.max(1, total)) * 100}%`,
              background: "linear-gradient(90deg,#74c0ff,#a06bff)",
            }}
          />
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFlipped((v) => !v);
            }
          }}
          className="card mt-3 flex min-h-0 w-full flex-1 flex-col overflow-hidden p-4 text-center animate-pop-in"
          key={`${current.id}-${flipped ? "b" : "f"}`}
        >
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-white px-3 py-1 text-xs font-800 text-ink-soft shadow-soft">
              <GraduationCap size={12} /> {flipped ? "Answer" : "Prompt"}
            </span>
            <button
              type="button"
              title="Don't show this card again"
              onClick={dismiss}
              data-sfx="success"
              className="capsule flex h-8 items-center gap-1 px-2.5 text-[11px] font-800 text-ink-soft active:scale-95"
            >
              <Check size={14} strokeWidth={2.8} className="text-cat-chores" />
              Got it
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
            <p className="whitespace-pre-wrap break-words font-display text-xl font-800 leading-snug text-ink">
              {flipped ? current.back || "-" : current.front}
            </p>
            <CardMedia
              audioKey={current.audioKey}
              imageKey={current.imageKey}
            />
            {!flipped && (
              <p className="mt-4 text-sm font-800 text-ink-faint">Tap to flip</p>
            )}
          </div>
        </div>

        {flipped && previews && (
          <div className="mt-3 w-full shrink-0">
            <GradeButtons previews={previews} onPick={grade} />
          </div>
        )}
      </div>
    </div>,
    shell,
  );
}

function Summary({
  deckTitle,
  deckIcon,
  deckColor,
  answered,
  remaining,
  onClose,
  onStay,
}: {
  deckTitle: string;
  deckIcon: string;
  deckColor: string;
  answered: number;
  remaining: number;
  onClose: () => void;
  onStay: () => void;
}) {
  const data = useStore((s) => s.data);
  const earnedToday = tokensEarnedOnDate(data.wallet, todayKey());

  return (
    <div className="absolute inset-0 z-[55] flex flex-col">
      <BackgroundDecor />
      <TokenEarnToast />
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Tile glyph={deckIcon} color={deckColor} size={96} state="selected" />
        <h2 className="mt-4 font-display text-3xl font-800 text-ink">
          Session done
        </h2>
        <p className="mt-1 text-sm font-700 text-ink-soft">
          {answered} card{answered === 1 ? "" : "s"} in {deckTitle}
          {remaining > 0 ? ` · ${remaining} waiting for next time` : ""}
        </p>
        <div className="mt-4 flex flex-col items-center gap-2">
          <TokenBalanceCapsule />
          {earnedToday > 0 && (
            <p className="text-xs font-800 text-cat-project">
              +{earnedToday} Play Token{earnedToday === 1 ? "" : "s"} today
            </p>
          )}
        </div>
        <button onClick={onClose} className="btn mt-6 w-full">
          <Check size={18} /> Done
        </button>
        <button onClick={onStay} className="btn-ghost mt-2 w-full">
          Back to Learn
        </button>
      </div>
    </div>
  );
}
