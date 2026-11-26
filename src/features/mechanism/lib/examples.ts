import { rockerLevel } from './level';
import { boardPose, evaluateMove, evaluateTrigger } from './engine';
import type {
  Attempt, ContactMap, MoveEvent, MovePreview, TimelineEvent, TriggerEvent, TriggerPreview,
} from './types';

let sequence = 0;
function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

export function makeMoveEvent(preview: MovePreview, angle: number, index: number, id = nextId('move')): MoveEvent {
  return {
    id,
    kind: 'move',
    index,
    at: Date.now(),
    limb: preview.limb,
    from: preview.from,
    target: preview.target,
    before: preview.before,
    next: preview.next,
    angle,
    pose: boardPose(rockerLevel, angle),
    distance: preview.distance,
    reach: preview.reach,
    release: preview.release,
    landing: preview.landing,
    failure: preview.failure,
    failureText: preview.failureText,
    result: preview.failure ? 'fall' : 'ok',
  };
}

export function makeTriggerEvent(
  preview: TriggerPreview,
  contacts: ContactMap,
  beforeAngle: number,
  index: number,
  id?: string,
): TriggerEvent {
  return {
    id: id ?? nextId('trigger'),
    kind: 'trigger',
    index,
    at: Date.now(),
    heldBy: preview.heldBy,
    contacts: { ...contacts },
    beforeAngle,
    angle: preview.stopAngle,
    pose: preview.pose,
    targetAngle: preview.targetAngle,
    chargesBefore: preview.chargesBefore,
    chargesAfter: preview.chargesAfter,
    outcome: preview.outcome === 'empty' ? 'jam' : preview.outcome,
    totalTorque: preview.totalTorque,
    loads: preview.loads,
    blocker: preview.blocker,
    balance: preview.balance,
    trace: preview.trace,
    failure: preview.failure,
    failureText: preview.failureText,
    result: preview.outcome === 'imbalance' ? 'fall' : preview.outcome === 'jam' ? 'jam' : 'ok',
  };
}

export interface ScriptAction {
  type: 'move' | 'trigger';
  limb?: MovePreview['limb'];
  target?: string;
}

export function replayScript(script: ScriptAction[], idPrefix: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let contacts: ContactMap = { ...rockerLevel.start };
  let angle = rockerLevel.startAngle;
  let charges = rockerLevel.charges;

  script.forEach((action, index) => {
    if (action.type === 'move' && action.limb && action.target) {
      const preview = evaluateMove(rockerLevel, contacts, action.limb, action.target, angle);
      const event = makeMoveEvent(preview, angle, index, `${idPrefix}-${index}`);
      event.at = 0;
      events.push(event);
      if (preview.failure) return;
      contacts = preview.next;
    } else {
      const preview = evaluateTrigger(rockerLevel, contacts, angle, charges);
      const event = makeTriggerEvent(preview, contacts, angle, index, `${idPrefix}-${index}`);
      event.at = 0;
      events.push(event);
      if (preview.outcome === 'empty') return;
      charges = preview.chargesAfter;
      angle = preview.stopAngle;
    }
  });
  return events;
}

const jamScript: ScriptAction[] = [
  { type: 'move', limb: 'rf', target: 'T' },
  { type: 'trigger' },
  { type: 'move', limb: 'rh', target: '11' },
  { type: 'move', limb: 'lh', target: '12' },
  { type: 'move', limb: 'lf', target: '20' },
  { type: 'move', limb: 'lf', target: '21' },
  { type: 'move', limb: 'rh', target: '13' },
  { type: 'trigger' },
];

const fallScript: ScriptAction[] = [
  { type: 'move', limb: 'rf', target: 'T' },
  { type: 'trigger' },
  { type: 'move', limb: 'lf', target: '05' },
  { type: 'move', limb: 'rh', target: '11' },
  { type: 'move', limb: 'lh', target: '12' },
  { type: 'trigger' },
  { type: 'move', limb: 'rh', target: '13' },
  { type: 'move', limb: 'lh', target: '14' },
  { type: 'move', limb: 'rh', target: '15' },
  { type: 'move', limb: 'rh', target: '18' },
  { type: 'move', limb: 'lh', target: '19' },
  { type: 'move', limb: 'rf', target: '11' },
];

export const builtinAttempts: Attempt[] = [
  {
    id: 'builtin-success',
    levelId: rockerLevel.id,
    result: 'success',
    guided: true,
    at: 0,
    events: replayScript(rockerLevel.solution, 'success'),
  },
  {
    id: 'builtin-jam',
    levelId: rockerLevel.id,
    result: 'jam',
    guided: false,
    at: 0,
    events: replayScript(jamScript, 'jam'),
  },
  {
    id: 'builtin-imbalance',
    levelId: rockerLevel.id,
    result: 'fall',
    guided: false,
    at: 0,
    events: replayScript(fallScript, 'fall'),
  },
];
