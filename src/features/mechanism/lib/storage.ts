import type { Attempt, TimelineEvent } from './types';

const key = 'crux-rocker-mechanism-v1';

function eventShape(event: unknown): event is TimelineEvent {
  if (!event || typeof event !== 'object') return false;
  const item = event as Record<string, unknown>;
  return (item.kind === 'move' || item.kind === 'trigger')
    && typeof item.index === 'number'
    && typeof item.pose === 'object'
    && typeof item.angle === 'number';
}

function attemptShape(item: unknown): item is Attempt {
  if (!item || typeof item !== 'object') return false;
  const attempt = item as Record<string, unknown>;
  return typeof attempt.id === 'string'
    && typeof attempt.levelId === 'string'
    && (attempt.result === 'success' || attempt.result === 'fall' || attempt.result === 'jam')
    && Array.isArray(attempt.events)
    && attempt.events.length > 0
    && attempt.events.every(eventShape);
}

export function readMechanismAttempts(storage: Storage): Attempt[] {
  try {
    const raw = JSON.parse(storage.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(attemptShape).slice(0, 20);
  } catch {
    return [];
  }
}

export function saveMechanismAttempts(storage: Storage, attempts: Attempt[]) {
  try {
    storage.setItem(key, JSON.stringify(attempts));
    return true;
  } catch {
    return false;
  }
}

export function firstCriticalIndex(attempt: Attempt): number {
  const index = attempt.events.findIndex(event =>
    (event.kind === 'move' && event.failure)
    || (event.kind === 'trigger' && (event.outcome === 'jam' || event.outcome === 'imbalance')),
  );
  return index >= 0 ? index : attempt.events.length - 1;
}
