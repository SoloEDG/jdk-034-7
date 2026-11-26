import { computed, ref } from 'vue';
import {
  balanceAt, boardPose, evaluateMove, evaluateTrigger, triggerHeldBy,
} from '../lib/engine';
import { builtinAttempts, makeMoveEvent, makeTriggerEvent } from '../lib/examples';
import { firstCriticalIndex, readMechanismAttempts, saveMechanismAttempts } from '../lib/storage';
import { rockerLevel } from '../lib/level';
import type {
  Attempt, ContactMap, Limb, MovePreview, PartialContacts, TimelineEvent, TriggerPreview,
} from '../lib/types';

export type ReviewPhase = 'critical' | 'before' | 'result';

export function useMechanismChallenge() {
  const level = rockerLevel;
  const contacts = ref<ContactMap>({ ...level.start });
  const angle = ref(level.startAngle);
  const charges = ref(level.charges);
  const selected = ref<Limb>('rf');
  const target = ref<string | null>(null);
  const status = ref<'playing' | 'success' | 'fall'>('playing');
  const events = ref<TimelineEvent[]>([]);
  const notice = ref<string | null>(null);

  const guideActive = ref(false);
  const guideStep = ref(0);
  const autoPlaying = ref(false);

  const userAttempts = ref<Attempt[]>(readMechanismAttempts(window.localStorage));
  const stored = ref(true);
  const activeReview = ref<Attempt | null>(null);
  const reviewIndex = ref(0);
  const reviewPhase = ref<ReviewPhase>('critical');

  const allAttempts = computed(() => [...builtinAttempts, ...userAttempts.value]);
  const reviewEvent = computed(() => activeReview.value?.events[reviewIndex.value] ?? null);
  const locked = computed(() => Boolean(activeReview.value) || status.value !== 'playing' || autoPlaying.value);

  const movePreview = computed<MovePreview | null>(() => target.value
    ? evaluateMove(level, contacts.value, selected.value, target.value, angle.value)
    : null);
  const triggerPreview = computed<TriggerPreview>(() =>
    evaluateTrigger(level, contacts.value, angle.value, charges.value));
  const balance = computed(() => balanceAt(level, contacts.value, angle.value));
  const pose = computed(() => boardPose(level, angle.value));
  const heldBy = computed(() => triggerHeldBy(level, contacts.value));

  const expectedAction = computed(() => level.solution[guideStep.value] ?? null);
  const guideComplete = computed(() => guideStep.value >= level.solution.length);

  const reviewAngle = computed(() => {
    const event = reviewEvent.value;
    if (!event) return angle.value;
    if (event.kind === 'trigger' && reviewPhase.value === 'before') return event.beforeAngle;
    return event.angle;
  });
  const reviewPose = computed(() => boardPose(level, reviewAngle.value));

  const shownContacts = computed<PartialContacts>(() => {
    const event = reviewEvent.value;
    if (!event) return contacts.value;
    if (event.kind === 'trigger') return event.contacts;
    if (reviewPhase.value === 'before') return event.before;
    if (reviewPhase.value === 'result') return event.next;
    if (event.failure === 'release') return { ...event.before, [event.limb]: null };
    return event.next;
  });

  const shownBalance = computed(() => {
    const event = reviewEvent.value;
    if (!event) return balance.value;
    if (event.kind === 'trigger') return event.balance;
    if (reviewPhase.value === 'before') return balanceAt(level, event.before, event.angle);
    if (event.failure === 'release' && reviewPhase.value === 'critical') return event.release;
    return event.landing;
  });

  const shownBlocker = computed(() => {
    const event = reviewEvent.value;
    if (event?.kind === 'trigger' && reviewPhase.value !== 'before') return event.blocker;
    return activeReview.value ? null : triggerPreview.value.blocker;
  });

  const shownTarget = computed(() => {
    const event = reviewEvent.value;
    if (event?.kind === 'move') return event.target;
    return target.value;
  });

  function persist(attempt: Attempt) {
    userAttempts.value = [attempt, ...userAttempts.value].slice(0, 20);
    stored.value = saveMechanismAttempts(window.localStorage, userAttempts.value);
  }

  function finishAttempt(result: 'success' | 'fall') {
    status.value = result;
    const attempt: Attempt = {
      id: crypto.randomUUID(),
      levelId: level.id,
      result,
      guided: guideActive.value,
      events: [...events.value],
      at: Date.now(),
    };
    persist(attempt);
    return attempt;
  }

  function reset(options: { guide?: boolean; keepReviewClosed?: boolean } = {}) {
    contacts.value = { ...level.start };
    angle.value = level.startAngle;
    charges.value = level.charges;
    selected.value = 'rf';
    target.value = null;
    status.value = 'playing';
    events.value = [];
    notice.value = null;
    guideStep.value = 0;
    guideActive.value = options.guide ?? false;
    autoPlaying.value = false;
    if (!options.keepReviewClosed) activeReview.value = null;
    reviewIndex.value = 0;
    reviewPhase.value = 'critical';
  }

  function chooseLimb(limb: Limb) {
    if (locked.value) return;
    selected.value = limb;
    target.value = null;
  }

  function chooseHold(id: string) {
    if (locked.value) return;
    target.value = id;
  }

  function advanceGuide(type: 'move' | 'trigger', limb?: Limb, moveTarget?: string) {
    const expected = expectedAction.value;
    if (!guideActive.value || !expected) return;
    const matches = expected.type === type
      && (type === 'trigger' || (expected.limb === limb && expected.target === moveTarget));
    if (matches) {
      guideStep.value += 1;
      const next = level.solution[guideStep.value];
      if (next?.type === 'move' && next.limb) selected.value = next.limb;
    }
  }

  function commitMove(preview: MovePreview) {
    if (status.value !== 'playing') return null;
    const event = makeMoveEvent(preview, angle.value, events.value.length);
    events.value.push(event);
    target.value = null;
    if (preview.failure) {
      const attempt = finishAttempt('fall');
      openReview(attempt, true);
      return event;
    }
    contacts.value = { ...preview.next };
    advanceGuide('move', preview.limb, preview.target);
    if (preview.target === level.finish) {
      const attempt = finishAttempt('success');
      notice.value = '完攀！示例顺序已保留全部关键支撑。';
      activeReview.value = attempt;
      reviewIndex.value = firstCriticalIndex(attempt);
    }
    return event;
  }

  function executeMove() {
    if (locked.value || !movePreview.value) return null;
    if (movePreview.value.failure === 'occupied' || movePreview.value.failure === 'limb-kind') return null;
    return commitMove(movePreview.value);
  }

  function commitTrigger(preview: TriggerPreview) {
    if (status.value !== 'playing' || !preview.enabled) return null;
    const beforeAngle = angle.value;
    const event = makeTriggerEvent(preview, contacts.value, beforeAngle, events.value.length);
    events.value.push(event);
    charges.value = preview.chargesAfter;
    angle.value = preview.stopAngle;
    if (preview.outcome === 'imbalance') {
      const attempt = finishAttempt('fall');
      openReview(attempt, true);
      return event;
    }
    if (preview.outcome === 'jam') {
      notice.value = preview.failureText;
    } else {
      notice.value = null;
      advanceGuide('trigger');
    }
    return event;
  }

  function executeTrigger() {
    if (locked.value || !triggerPreview.value.enabled) return null;
    return commitTrigger(triggerPreview.value);
  }

  /** Directly performs the next scripted step; used by the auto demonstration. */
  function performExpected() {
    const action = expectedAction.value;
    if (!action || status.value !== 'playing') return false;
    if (action.type === 'move' && action.limb && action.target) {
      selected.value = action.limb;
      const preview = evaluateMove(level, contacts.value, action.limb, action.target, angle.value);
      commitMove(preview);
      return !preview.failure;
    }
    const preview = evaluateTrigger(level, contacts.value, angle.value, charges.value);
    commitTrigger(preview);
    return preview.outcome === 'flip';
  }

  function startGuide(auto = false) {
    reset({ guide: true });
    guideActive.value = true;
    if (expectedAction.value?.type === 'move' && expectedAction.value.limb) {
      selected.value = expectedAction.value.limb;
    }
    autoPlaying.value = auto;
  }

  function stopAuto() {
    autoPlaying.value = false;
  }

  function openReview(attempt: Attempt, critical = false) {
    activeReview.value = attempt;
    reviewIndex.value = critical ? firstCriticalIndex(attempt) : attempt.events.length - 1;
    reviewPhase.value = 'critical';
    autoPlaying.value = false;
  }

  function openFirstCritical() {
    if (!activeReview.value) return;
    reviewIndex.value = firstCriticalIndex(activeReview.value);
    reviewPhase.value = 'critical';
  }

  function jumpReview(index: number) {
    if (!activeReview.value) return;
    reviewIndex.value = Math.max(0, Math.min(activeReview.value.events.length - 1, index));
    reviewPhase.value = 'critical';
  }

  function closeReview() {
    activeReview.value = null;
    reviewIndex.value = 0;
    reviewPhase.value = 'critical';
  }

  return {
    level, contacts, angle, charges, selected, target, status, events, notice,
    guideActive, guideStep, guideComplete, expectedAction, autoPlaying,
    userAttempts, allAttempts, stored, activeReview, reviewIndex, reviewPhase, reviewEvent,
    locked, movePreview, triggerPreview, balance, pose, heldBy,
    reviewAngle, reviewPose, shownContacts, shownBalance, shownBlocker, shownTarget,
    reset, chooseLimb, chooseHold, executeMove, executeTrigger, performExpected,
    startGuide, stopAuto, openReview, closeReview, jumpReview, openFirstCritical,
    setReviewPhase: (phase: ReviewPhase) => { reviewPhase.value = phase; },
  };
}
