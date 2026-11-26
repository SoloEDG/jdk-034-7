import { clamp } from '../../../shared/geometry';
import type {
  BalanceInfo, BoardPose, ContactMap, Level, Limb, LoadInfo, MechHold, MovePreview,
  PartialContacts, Point, TriggerPreview,
} from './types';

export const mechanismLimbs: Limb[] = ['lh', 'rh', 'lf', 'rf'];
export const mechanismLimbNames: Record<Limb, string> = {
  lh: '左手', rh: '右手', lf: '左脚', rf: '右脚',
};
export const mechanismLimbTags: Record<Limb, string> = {
  lh: 'LH', rh: 'RH', lf: 'LF', rf: 'RF',
};

export const holdGrip = {
  jug: { name: '大把手', support: 3.25, reach: 10 },
  edge: { name: '薄边点', support: 2.65, reach: 2 },
  slope: { name: '斜面点', support: 1.05, reach: -14 },
  step: { name: '脚点', support: 2.85, reach: 4 },
  trigger: { name: '踏压机关', support: 3.05, reach: 8 },
  finish: { name: '完攀点', support: 3.55, reach: 12 },
} as const;

const limbLoad: Record<Limb, number> = { lh: 0.72, rh: 0.72, lf: 1.18, rf: 1.18 };

export function holdById(level: Level, id: string): MechHold {
  const hold = level.holds.find(item => item.id === id);
  if (!hold) throw new Error(`未知岩点 ${id}`);
  return hold;
}

export function boardPose(level: Level, angle: number): BoardPose {
  const radians = angle * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const move = (side: -1 | 1) => ({
    dx: side * level.radius * (cos - 1),
    dy: side * level.radius * sin,
  });
  const left = move(-1);
  const right = move(1);
  return {
    angle,
    leftDx: left.dx,
    leftDy: left.dy,
    rightDx: right.dx,
    rightDy: right.dy,
    leftEndpoint: {
      x: level.pivot.x - level.radius * cos,
      y: level.pivot.y - level.radius * sin,
    },
    rightEndpoint: {
      x: level.pivot.x + level.radius * cos,
      y: level.pivot.y + level.radius * sin,
    },
  };
}

export function worldHold(level: Level, hold: string | MechHold, angle: number): MechHold {
  const base = typeof hold === 'string' ? holdById(level, hold) : hold;
  if (base.board === 'fixed') return base;
  const pose = boardPose(level, angle);
  const dx = base.board === 'left' ? pose.leftDx : pose.rightDx;
  const dy = base.board === 'left' ? pose.leftDy : pose.rightDy;
  return { ...base, x: base.x + dx, y: base.y + dy };
}

function centroid(points: Point[]): Point {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

export function activeLimbs(excluded?: Limb | null): Limb[] {
  return mechanismLimbs.filter(item => item !== excluded);
}

/**
 * The body is derived only from contacts which are still connected.
 * Releasing a grip therefore changes both its support polygon and COM.
 */
export function bodyAt(
  level: Level,
  contacts: PartialContacts,
  angle: number,
  excluded?: Limb | null,
): Point {
  const available = mechanismLimbs.filter(limb => limb !== excluded && contacts[limb]);
  const hands = available.filter(limb => limb === 'lh' || limb === 'rh')
    .map(limb => worldHold(level, contacts[limb]!, angle));
  const feet = available.filter(limb => limb === 'lf' || limb === 'rf')
    .map(limb => worldHold(level, contacts[limb]!, angle));
  if (hands.length && feet.length) {
    const h = centroid(hands);
    const f = centroid(feet);
    return { x: h.x * 0.52 + f.x * 0.48, y: h.y * 0.53 + f.y * 0.47 };
  }
  const points = [...hands, ...feet];
  return centroid(points.length ? points : [level.pivot]);
}

export function balanceAt(
  level: Level,
  contacts: PartialContacts,
  angle: number,
  excluded?: Limb | null,
): BalanceInfo {
  const limbs = activeLimbs(excluded).filter(limb => contacts[limb]);
  const anchors = limbs.map(limb => worldHold(level, contacts[limb]!, angle));
  const center = bodyAt(level, contacts, angle, excluded);
  const anchorCentroid = centroid(anchors.length ? anchors : [center]);
  const support = limbs.reduce((sum, limb) => {
    const hold = holdById(level, contacts[limb]!);
    return sum + holdGrip[hold.kind].support;
  }, 0);
  const span = anchors.length ? Math.max(...anchors.map(p => Math.hypot(center.x - p.x, center.y - p.y))) : 220;
  const offset = Math.abs(center.x - anchorCentroid.x);
  const demand = 3.35 + offset / 48 + Math.max(0, span - 132) / 78 + Math.abs(angle) * 0.022;
  const margin = Math.round((support - demand) * 10) / 10;
  return {
    margin,
    demand: Math.round(demand * 10) / 10,
    support: Math.round(support * 10) / 10,
    center,
    anchorCentroid,
    span: Math.round(span),
    offset: Math.round(offset),
  };
}

export function reachFor(level: Level, contacts: ContactMap, limb: Limb, targetId: string, angle: number) {
  const target = worldHold(level, targetId, angle);
  const center = bodyAt(level, contacts, angle);
  const hand = limb === 'lh' || limb === 'rh';
  const side = limb.startsWith('l') ? -1 : 1;
  const origin = {
    x: center.x + side * (hand ? 19 : 13),
    y: center.y + (hand ? -34 : 27),
  };
  const hold = holdById(level, targetId);
  const baseReach = hand ? 218 : 184;
  const reach = Math.round(baseReach + holdGrip[hold.kind].reach - Math.abs(angle) * 0.35);
  const distance = Math.round(Math.hypot(origin.x - target.x, origin.y - target.y));
  return { distance, reach, origin, target };
}

export function evaluateMove(
  level: Level,
  contacts: ContactMap,
  limb: Limb,
  targetId: string,
  angle: number,
): MovePreview {
  const from = contacts[limb];
  const before = { ...contacts };
  const base: MovePreview = {
    kind: 'move', limb, target: targetId, from, before, next: { ...contacts, [limb]: targetId },
    distance: 0, reach: 0,
    release: balanceAt(level, contacts, angle, limb),
    landing: balanceAt(level, { ...contacts, [limb]: targetId }, angle),
    failure: null, failureText: null,
  };
  const target = level.holds.find(hold => hold.id === targetId);
  if (!target) return { ...base, failure: 'occupied', failureText: '未知岩点' };
  if (targetId === from) return { ...base, failure: 'occupied', failureText: '该肢体已经在这个岩点上' };
  if (Object.entries(contacts).some(([other, id]) => other !== limb && id === targetId)) {
    return { ...base, failure: 'occupied', failureText: '岩点已被其他肢体占用' };
  }
  if (target.kind === 'trigger' && (limb === 'lh' || limb === 'rh')) {
    return { ...base, failure: 'limb-kind', failureText: '机关只能用脚踩下' };
  }

  const measure = reachFor(level, contacts, limb, targetId, angle);
  base.distance = measure.distance;
  base.reach = measure.reach;
  if (measure.distance > measure.reach) {
    base.failure = 'reach';
    base.failureText = `超出触及范围：${measure.distance} / ${measure.reach}`;
  } else if (base.release.margin < 0) {
    base.failure = 'release';
    base.failureText = `断开${mechanismLimbNames[limb]}后失衡，余量 ${base.release.margin}`;
  } else if (base.landing.margin < 0) {
    base.failure = 'landing';
    base.failureText = `落到 ${target.label} 后支撑不足，余量 ${base.landing.margin}`;
  }
  return base;
}

export function triggerHeldBy(level: Level, contacts: ContactMap): Limb | null {
  return (['lf', 'rf'] as Limb[]).find(limb => contacts[limb] === level.triggerHold) ?? null;
}

export function contactLoads(level: Level, contacts: ContactMap, angle: number, direction: -1 | 1): LoadInfo[] {
  return mechanismLimbs.map(limb => {
    const id = contacts[limb];
    const hold = worldHold(level, id, angle);
    // Gravity torque about the rocker pivot. Positive is clockwise/right-side down.
    const torque = limbLoad[limb] * (hold.x - level.pivot.x) / 100;
    const opposing = Math.max(0, -direction * torque);
    const brake = hold.brake ?? 0;
    return {
      limb,
      holdId: id,
      x: Math.round(hold.x),
      torque: Math.round(torque * 100) / 100,
      opposing: Math.round((opposing + brake) * 100) / 100,
      brake,
    };
  }).sort((a, b) => b.opposing - a.opposing);
}

/**
 * Sweep the rocker toward the opposite detent. The first non-positive
 * authority is a load jam; the first negative balance is an imbalance.
 */
export function evaluateTrigger(
  level: Level,
  contacts: ContactMap,
  angle: number,
  charges: number,
): TriggerPreview {
  const heldBy = triggerHeldBy(level, contacts);
  const direction: -1 | 1 = angle >= 0 ? -1 : 1;
  const targetAngle = direction > 0 ? level.maxAngle : -level.maxAngle;
  const chargesAfter = Math.max(0, charges - 1);
  const emptyFailure = charges <= 0 ? 'charges' as const : heldBy ? null : 'limb-kind' as const;
  const baseBalance = balanceAt(level, contacts, angle);
  const base: TriggerPreview = {
    kind: 'trigger',
    enabled: charges > 0 && Boolean(heldBy),
    heldBy,
    chargesBefore: charges,
    chargesAfter,
    fromAngle: angle,
    targetAngle,
    direction,
    outcome: charges <= 0 ? 'empty' : 'flip',
    stopAngle: angle,
    pose: boardPose(level, angle),
    totalTorque: 0,
    loads: [],
    blocker: null,
    balance: baseBalance,
    trace: [],
    failure: emptyFailure,
    failureText: charges <= 0 ? '机关触发次数已用完' : heldBy ? null : '需要有一只脚压住踏点',
  };
  if (emptyFailure || !heldBy) {
    return { ...base, failure: emptyFailure ?? 'limb-kind', outcome: 'empty' };
  }

  const step = 0.1;
  let current = angle;
  let outcome: TriggerPreview['outcome'] = 'flip';
  let blocker: LoadInfo | null = null;
  let stopBalance = baseBalance;
  const trace: TriggerPreview['trace'] = [];

  // Include the starting point so a jam at the current angle is reviewable.
  for (let iteration = 0; iteration <= 400; iteration += 1) {
    const loads = contactLoads(level, contacts, current, direction);
    // Do not let a support on the assisted side silently cancel a seized cam:
    // each opposing contact and its load-sensitive brake is reported separately.
    const opposingTorque = loads.reduce((sum, item) => sum + item.opposing, 0);
    const centerResist = level.detent * Math.max(0, 1 - Math.abs(current) / 5.4);
    const authority = Math.round((level.drive - opposingTorque - centerResist) * 100) / 100;
    const balance = balanceAt(level, contacts, current);
    trace.push({ angle: Math.round(current * 10) / 10, margin: balance.margin, authority });

    if (balance.margin < 0) {
      outcome = 'imbalance';
      stopBalance = balance;
      blocker = loads[0] ?? null;
      break;
    }
    if (authority <= 0) {
      outcome = 'jam';
      stopBalance = balance;
      blocker = loads[0] ?? null;
      break;
    }
    if (Math.abs(current - targetAngle) < 0.001) break;

    current = direction > 0
      ? Math.min(targetAngle, current + step)
      : Math.max(targetAngle, current - step);
  }

  const stopAngle = clamp(Math.round(current * 10) / 10, -level.maxAngle, level.maxAngle);
  const pose = boardPose(level, stopAngle);
  const finalLoads = contactLoads(level, contacts, stopAngle, direction);
  const totalTorque = finalLoads.reduce((sum, item) => sum + item.torque, 0);
  if (!blocker && outcome !== 'flip') blocker = finalLoads[0] ?? null;
  const failureText = outcome === 'jam' && blocker
    ? `${mechanismLimbNames[blocker.limb]} · ${blocker.holdId} 承重，摇臂在 ${stopAngle.toFixed(1)}° 卡止`
    : outcome === 'imbalance'
      ? `摇到 ${stopAngle.toFixed(1)}° 时失衡，支撑余量 ${stopBalance.margin}`
      : null;

  return {
    ...base,
    outcome,
    stopAngle,
    pose,
    totalTorque: Math.round(totalTorque * 100) / 100,
    loads: finalLoads,
    blocker,
    balance: stopBalance,
    trace,
    failure: outcome === 'flip' ? null : outcome === 'imbalance' ? 'release' : null,
    failureText,
  };
}

export function formatBoardOffset(pose: BoardPose, board: 'left' | 'right') {
  const dy = board === 'left' ? pose.leftDy : pose.rightDy;
  return `${dy >= 0 ? '下降' : '升高'} ${Math.abs(Math.round(dy))}`;
}
