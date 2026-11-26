export type Limb = 'lh' | 'rh' | 'lf' | 'rf';
export type ContactMap = Record<Limb, string>;
export type PartialContacts = Partial<Record<Limb, string | null>>;
export type BoardId = 'left' | 'right' | 'fixed';
export type MechHoldKind = 'jug' | 'edge' | 'slope' | 'step' | 'trigger' | 'finish';
export type ActionType = 'move' | 'trigger';
export type FailureKind = 'occupied' | 'limb-kind' | 'reach' | 'release' | 'landing' | 'charges';
export type TriggerOutcome = 'flip' | 'jam' | 'imbalance' | 'empty';

export interface Point {
  x: number;
  y: number;
}

export interface MechHold extends Point {
  id: string;
  label: string;
  board: BoardId;
  kind: MechHoldKind;
  /** Extra resistance while this contact is the principal loaded cam contact. */
  brake?: number;
}

export interface SolutionAction {
  type: ActionType;
  limb?: Limb;
  target?: string;
  note: string;
}

export interface Level {
  id: string;
  name: string;
  grade: string;
  color: string;
  brief: string;
  pivot: Point;
  radius: number;
  maxAngle: number;
  startAngle: number;
  charges: number;
  drive: number;
  detent: number;
  holds: MechHold[];
  start: ContactMap;
  triggerHold: string;
  finish: string;
  solution: SolutionAction[];
}

export interface BoardPose {
  angle: number;
  leftDx: number;
  leftDy: number;
  rightDx: number;
  rightDy: number;
  leftEndpoint: Point;
  rightEndpoint: Point;
}

export interface BalanceInfo {
  margin: number;
  demand: number;
  support: number;
  center: Point;
  anchorCentroid: Point;
  span: number;
  offset: number;
}

export interface LoadInfo {
  limb: Limb;
  holdId: string;
  x: number;
  torque: number;
  opposing: number;
  brake: number;
}

export interface MovePreview {
  kind: 'move';
  limb: Limb;
  target: string;
  from: string;
  before: ContactMap;
  next: ContactMap;
  distance: number;
  reach: number;
  release: BalanceInfo;
  landing: BalanceInfo;
  failure: FailureKind | null;
  failureText: string | null;
}

export interface TriggerTracePoint {
  angle: number;
  margin: number;
  authority: number;
}

export interface TriggerPreview {
  kind: 'trigger';
  enabled: boolean;
  heldBy: Limb | null;
  chargesBefore: number;
  chargesAfter: number;
  fromAngle: number;
  targetAngle: number;
  direction: -1 | 1;
  outcome: TriggerOutcome;
  stopAngle: number;
  pose: BoardPose;
  totalTorque: number;
  loads: LoadInfo[];
  blocker: LoadInfo | null;
  balance: BalanceInfo;
  trace: TriggerTracePoint[];
  failure: FailureKind | null;
  failureText: string | null;
}

export interface MoveEvent {
  id: string;
  kind: 'move';
  index: number;
  at: number;
  limb: Limb;
  from: string;
  target: string;
  before: ContactMap;
  next: ContactMap;
  angle: number;
  pose: BoardPose;
  distance: number;
  reach: number;
  release: BalanceInfo;
  landing: BalanceInfo;
  failure: FailureKind | null;
  failureText: string | null;
  result: 'ok' | 'fall';
}

export interface TriggerEvent {
  id: string;
  kind: 'trigger';
  index: number;
  at: number;
  heldBy: Limb | null;
  contacts: ContactMap;
  beforeAngle: number;
  angle: number;
  pose: BoardPose;
  targetAngle: number;
  chargesBefore: number;
  chargesAfter: number;
  outcome: Exclude<TriggerOutcome, 'empty'>;
  totalTorque: number;
  loads: LoadInfo[];
  blocker: LoadInfo | null;
  balance: BalanceInfo;
  trace: TriggerTracePoint[];
  failure: FailureKind | null;
  failureText: string | null;
  result: 'ok' | 'fall' | 'jam';
}

export type TimelineEvent = MoveEvent | TriggerEvent;

export interface Attempt {
  id: string;
  levelId: string;
  result: 'success' | 'fall' | 'jam';
  guided: boolean;
  events: TimelineEvent[];
  at: number;
}
