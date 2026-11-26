<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, Crosshair, Footprints,
  ListOrdered, Play, RotateCcw, ScanSearch, X,
} from 'lucide-vue-next';
import MechanismWall from '../features/mechanism/ui/MechanismWall.vue';
import { evaluateMove, mechanismLimbNames } from '../features/mechanism/lib/engine';
import { useMechanismChallenge } from '../features/mechanism/model/useMechanismChallenge';
import type { Attempt, Limb } from '../features/mechanism/lib/types';
import './mechanism.css';

const game = useMechanismChallenge();
const {
  level, contacts, angle, charges, selected, target, status, notice,
  guideActive, guideStep, guideComplete, expectedAction, autoPlaying,
  allAttempts, stored, activeReview, reviewIndex, reviewPhase, reviewEvent, locked,
  movePreview, triggerPreview, balance, pose, heldBy,
  reviewPose, shownContacts, shownBlocker,
  reset, chooseLimb, chooseHold, executeMove, executeTrigger, performExpected,
  startGuide, stopAuto, openReview, closeReview, jumpReview, openFirstCritical, setReviewPhase,
} = game;

const limbs: Limb[] = ['lh', 'rh', 'lf', 'rf'];

const holdStates = computed<Record<string, string>>(() => {
  const states: Record<string, string> = {};
  const review = activeReview.value;
  if (review) {
    for (const [limb, id] of Object.entries(shownContacts.value)) {
      if (id) states[id] = states[id] ? `${states[id]} occupied` : 'occupied';
      void limb;
    }
    const event = reviewEvent.value;
    if (event?.kind === 'move') {
      states[event.target] = event.failure ? 'danger' : 'target';
      if (reviewPhase.value === 'before') states[event.target] = 'guide';
    }
    const blocker = shownBlocker.value;
    if (blocker) states[blocker.holdId] = 'blocked';
    return states;
  }

  for (const hold of level.holds) {
    if (target.value === hold.id) states[hold.id] = movePreview.value?.failure ? 'danger' : 'target';
    else if (Object.values(contacts.value).includes(hold.id)) states[hold.id] = 'occupied';
    else if (guideActive.value && expectedAction.value?.target === hold.id) states[hold.id] = 'guide';
    else states[hold.id] = 'idle';
  }
  if (triggerPreview.value.blocker && triggerPreview.value.outcome === 'jam') {
    states[triggerPreview.value.blocker.holdId] = 'blocked';
  }
  return states;
});

const availableIds = computed(() => {
  if (activeReview.value || status.value !== 'playing') return [];
  return level.holds
    .filter((hold) => {
      if (hold.id === contacts.value[selected.value]) return false;
      const preview = evaluateMove(level, contacts.value, selected.value, hold.id, angle.value);
      return !preview.failure;
    })
    .map(hold => hold.id);
});

const guideTarget = computed(() => {
  if (activeReview.value) return null;
  return expectedAction.value?.target ?? null;
});

const lostHoldId = computed(() => {
  const event = reviewEvent.value;
  return event?.kind === 'move' && event.failure === 'release' && reviewPhase.value === 'critical'
    ? event.from
    : null;
});

const attemptTarget = computed(() => {
  const event = reviewEvent.value;
  if (event?.kind === 'move' && reviewPhase.value === 'critical'
    && (event.failure === 'release' || event.failure === 'reach')) {
    return event.target;
  }
  return null;
});

const structuralMoveInvalid = computed(() => {
  const failure = movePreview.value?.failure;
  return failure === 'occupied' || failure === 'limb-kind';
});
const executeLabel = computed(() => {
  const failure = movePreview.value?.failure;
  if (failure === 'release' || failure === 'landing') return '执行并查看失衡瞬间';
  if (failure === 'reach') return '尝试这个远距离动作';
  return '执行移动';
});

const caption = computed(() => {
  if (activeReview.value) {
    const event = reviewEvent.value;
    if (!event) return '复盘';
    if (event.kind === 'trigger') {
      return event.outcome === 'jam'
        ? `复盘 · 第 ${event.index + 1} 步：在 ${event.angle.toFixed(1)}° 卡止`
        : event.outcome === 'imbalance'
          ? `复盘 · 第 ${event.index + 1} 步：摇臂中失衡于 ${event.angle.toFixed(1)}°`
          : `复盘 · 第 ${event.index + 1} 步：摇臂换向完成`;
    }
    return event.failure
      ? `复盘 · 第 ${event.index + 1} 步：${event.failureText ?? '动作失败'}`
      : `复盘 · 第 ${event.index + 1} 步：接触已更新`;
  }
  if (status.value === 'success') return '完攀 · 可打开复盘检查顺序';
  if (status.value === 'fall') return '坠落 · 复盘已停在第一次失衡位置';
  if (guideActive.value) return `示例引导 · 第 ${Math.min(guideStep.value + 1, level.solution.length)} / ${level.solution.length} 步`;
  return `${mechanismLimbNames[selected.value]} · 选择岩点后可预演`;
});

const criticalExists = computed(() => activeReview.value?.events.some(event =>
  (event.kind === 'move' && Boolean(event.failure))
  || (event.kind === 'trigger' && event.outcome !== 'flip')) ?? false);

function fillExpected() {
  const action = expectedAction.value;
  if (!action || action.type !== 'move' || !action.limb) return;
  selected.value = action.limb;
  target.value = action.target ?? null;
}

function replaySameOrder() {
  startGuide(false);
}

function openAttempt(attempt: Attempt) {
  openReview(attempt, true);
}

let autoTimer: number | undefined;
watch(autoPlaying, (auto) => {
  if (autoTimer) window.clearTimeout(autoTimer);
  const tick = () => {
    if (!autoPlaying.value) return;
    const ok = performExpected();
    if (!ok || guideComplete.value) {
      stopAuto();
      return;
    }
    autoTimer = window.setTimeout(tick, 1050);
  };
  if (auto) autoTimer = window.setTimeout(tick, 650);
});
onUnmounted(() => {
  if (autoTimer) window.clearTimeout(autoTimer);
});
</script>

<template>
  <div class="mech-page">
    <header class="mech-header">
      <div class="mech-brand">
        <span class="mech-brand-icon"><Footprints :size="24" /></span>
        <strong>CRUX</strong>
        <span>摇臂机关岩壁</span>
      </div>
      <div class="mech-header-status"><i></i> 有限触发 · 接触级失衡 · 卡止复盘</div>
    </header>

    <main class="mech-main">
      <aside class="solution-panel mech-card" aria-label="通关示例">
        <div class="panel-title"><ListOrdered :size="18" /><h2>保留支撑的通关顺序</h2></div>
        <p class="panel-tip">示例始终保留至少三个可用接触；第二次触发前，左脚 05 是关键反向支撑。贪踩右板 21 号承重脚点再换向，预演会直接指出是哪只脚在何角度卡止。</p>
        <ol class="solution-list">
          <li v-for="(action, index) in level.solution" :key="index"
            :class="{ done: guideActive && index < guideStep, current: guideActive && index === guideStep && !guideComplete }">
            <span class="step-index">
              <Check v-if="guideActive && index < guideStep" :size="13" />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span>{{ action.note }}</span>
          </li>
        </ol>
        <div class="guide-actions">
          <button class="primary-button" @click="replaySameOrder"><Crosshair :size="16" /> 按此顺序引导我</button>
          <button class="secondary-button" :disabled="autoPlaying" @click="startGuide(true)"><Play :size="15" /> 自动演示</button>
          <button v-if="guideActive && !guideComplete && expectedAction?.type === 'move'" class="text-button" @click="fillExpected">填入下一步目标</button>
          <p v-else-if="guideActive && !guideComplete" class="guide-trigger-hint">下一步：直接点击下方“踩下机关”。</p>
        </div>
      </aside>

      <MechanismWall
        :level="level"
        :pose="activeReview ? reviewPose : pose"
        :contacts="shownContacts"
        :selected="reviewEvent?.kind === 'move' ? reviewEvent.limb : selected"
        :states="holdStates"
        :available-ids="availableIds"
        :target-id="target"
        :preview-target="movePreview && !activeReview ? movePreview.target : null"
        :guide-target="guideTarget"
        :blocker-hold-id="shownBlocker?.holdId ?? null"
        :lost-hold-id="lostHoldId"
        :attempt-target="attemptTarget"
        :locked="locked"
        :caption="caption"
        @choose="chooseHold"
        @reset="reset()"
      />

      <aside class="console-panel mech-card" aria-label="机关控制台">
        <div class="console-title"><ScanSearch :size="18" /><b>预演与控制台</b></div>

        <template v-if="activeReview && reviewEvent">
          <section class="review-box">
            <div class="review-head">
              <h2>复盘时间线</h2>
              <button class="icon-button small" aria-label="关闭复盘" @click="closeReview"><X :size="16" /></button>
            </div>
            <div class="review-nav">
              <button class="icon-button small" :disabled="reviewIndex === 0" @click="jumpReview(reviewIndex - 1)"><ChevronLeft :size="17" /></button>
              <b>{{ reviewIndex + 1 }} / {{ activeReview.events.length }}</b>
              <button class="icon-button small" :disabled="reviewIndex >= activeReview.events.length - 1" @click="jumpReview(reviewIndex + 1)"><ChevronRight :size="17" /></button>
            </div>
            <button class="critical-button" :disabled="!criticalExists" @click="openFirstCritical">
              <AlertTriangle :size="15" /> 停到第一次失衡 / 卡止
            </button>
            <div class="phase-tabs">
              <button :class="{ active: reviewPhase === 'critical' }" @click="setReviewPhase('critical')">关键瞬间</button>
              <button :class="{ active: reviewPhase === 'before' }" @click="setReviewPhase('before')">动作前</button>
              <button :class="{ active: reviewPhase === 'result' }" @click="setReviewPhase('result')">结果姿态</button>
            </div>

            <template v-if="reviewEvent.kind === 'move'">
              <h3>{{ mechanismLimbNames[reviewEvent.limb] }}：{{ reviewEvent.from }} → {{ reviewEvent.target }}</h3>
              <dl class="data-list">
                <div><dt>触及距离 / 范围</dt><dd>{{ reviewEvent.distance }} / {{ reviewEvent.reach }}</dd></div>
                <div><dt>断开余量</dt><dd :class="reviewEvent.release.margin < 0 ? 'bad' : 'good'">{{ reviewEvent.release.margin }}</dd></div>
                <div><dt>落点余量</dt><dd :class="reviewEvent.landing.margin < 0 ? 'bad' : 'good'">{{ reviewEvent.landing.margin }}</dd></div>
                <div><dt>板角度</dt><dd>{{ reviewEvent.angle.toFixed(1) }}°</dd></div>
              </dl>
              <p v-if="reviewEvent.failureText" class="warning"><AlertTriangle :size="15" />{{ reviewEvent.failureText }}</p>
              <p v-else class="ok-text">该接触转换保持可用支撑。</p>
            </template>

            <template v-else>
              <h3>摇臂触发：{{ reviewEvent.beforeAngle.toFixed(1) }}° → {{ reviewEvent.angle.toFixed(1) }}°</h3>
              <dl class="data-list">
                <div><dt>触发次数</dt><dd>{{ reviewEvent.chargesBefore }} → {{ reviewEvent.chargesAfter }}</dd></div>
                <div><dt>目标角</dt><dd>{{ reviewEvent.targetAngle.toFixed(1) }}°</dd></div>
                <div><dt>当时支撑余量</dt><dd :class="reviewEvent.balance.margin < 0 ? 'bad' : 'good'">{{ reviewEvent.balance.margin }}</dd></div>
                <div><dt>左 / 右板位移</dt><dd>{{ Math.round(reviewEvent.pose.leftDy) }} / {{ Math.round(reviewEvent.pose.rightDy) }}</dd></div>
              </dl>
              <div v-if="reviewEvent.blocker" class="blocker-detail">
                <AlertTriangle :size="16" />
                <div><b>{{ mechanismLimbNames[reviewEvent.blocker.limb] }} · 岩点 {{ reviewEvent.blocker.holdId }}</b><span>在 {{ reviewEvent.angle.toFixed(1) }}° 拦住摇臂，承重阻力 {{ reviewEvent.blocker.opposing }}</span></div>
              </div>
              <p v-if="reviewEvent.failureText" class="warning"><AlertTriangle :size="15" />{{ reviewEvent.failureText }}</p>
              <p v-else-if="reviewEvent.outcome === 'flip'" class="ok-text">摇臂完整翻过，两块板已反向换位。</p>
            </template>
          </section>
        </template>

        <template v-else>
          <section class="status-grid">
            <div><span>剩余触发</span><b :class="{ zero: charges === 0 }">{{ charges }} / {{ level.charges }}</b></div>
            <div><span>摇臂角度</span><b>{{ angle.toFixed(1) }}°</b></div>
            <div><span>当前平衡余量</span><b :class="balance.margin < 1.5 ? 'warn' : 'good'">{{ balance.margin }}</b></div>
          </section>
          <div class="charge-pips" aria-label="触发次数">
            <i v-for="n in level.charges" :key="n" :class="{ spent: n > charges }"></i>
          </div>
          <p class="held-line">压点脚：<b>{{ heldBy ? mechanismLimbNames[heldBy] + ' · T' : '未压住' }}</b>；移动其他三肢时会继续保持。</p>

          <section class="trigger-preview" :class="{ jam: triggerPreview.outcome === 'jam', bad: triggerPreview.outcome === 'imbalance' }">
            <div class="section-row"><h2>脚踩机关预演</h2><span>空载 {{ level.startAngle }}° ↔ {{ level.maxAngle }}° 可翻过</span></div>
            <dl class="data-list">
              <div><dt>方向 / 目标角</dt><dd>{{ triggerPreview.direction > 0 ? '左升右降' : '左降右升' }} · {{ triggerPreview.targetAngle }}°</dd></div>
              <div><dt>预计停止角</dt><dd :class="triggerPreview.outcome !== 'flip' ? 'bad' : 'good'">{{ triggerPreview.stopAngle.toFixed(1) }}°</dd></div>
              <div><dt>触发后剩余</dt><dd>{{ triggerPreview.chargesAfter }} 次</dd></div>
            </dl>
            <div v-if="triggerPreview.blocker && triggerPreview.outcome === 'jam'" class="blocker-detail">
              <AlertTriangle :size="16" />
              <div><b>{{ mechanismLimbNames[triggerPreview.blocker.limb] }} · {{ triggerPreview.blocker.holdId }} 拦住</b><span>承重接触在 {{ triggerPreview.stopAngle.toFixed(1) }}° 卡止；先转移或保留反向支撑。</span></div>
            </div>
            <p v-else-if="triggerPreview.outcome === 'flip'" class="ok-text">当前承重不会阻止摇臂越过中心。</p>
            <p v-if="triggerPreview.failureText && triggerPreview.outcome !== 'jam'" class="warning">{{ triggerPreview.failureText }}</p>
            <button class="trigger-button" :disabled="!triggerPreview.enabled || locked" @click="executeTrigger">
              踩下机关（剩 {{ charges }} 次）
            </button>
          </section>

          <section class="limb-section">
            <h2>移动肢体</h2>
            <div class="limb-grid">
              <button v-for="limb in limbs" :key="limb" class="limb-button"
                :class="{ selected: selected === limb }" :disabled="locked"
                @click="chooseLimb(limb)">
                <b>{{ mechanismLimbNames[limb] }}</b><small>{{ contacts[limb] }}</small>
              </button>
            </div>
          </section>

          <section class="move-preview">
            <h2>抓点预演</h2>
            <dl v-if="movePreview" class="data-list">
              <div><dt>{{ mechanismLimbNames[movePreview.limb] }} → {{ movePreview.target }}</dt><dd>{{ movePreview.distance }} / {{ movePreview.reach }}</dd></div>
              <div><dt>断开 / 落点余量</dt><dd><span :class="movePreview.release.margin < 0 ? 'bad' : 'good'">{{ movePreview.release.margin }}</span> / <span :class="movePreview.landing.margin < 0 ? 'bad' : 'good'">{{ movePreview.landing.margin }}</span></dd></div>
            </dl>
            <p v-else class="muted">先选肢体，再点岩壁上的目标点。</p>
            <p v-if="movePreview?.failureText" class="warning"><AlertTriangle :size="15" />{{ movePreview.failureText }}</p>
            <button class="primary-button execute"
              :class="{ dangerous: movePreview?.failure === 'release' || movePreview?.failure === 'landing' }"
              :disabled="!movePreview || structuralMoveInvalid || locked"
              @click="executeMove">
              {{ executeLabel }}
            </button>
          </section>

          <div v-if="status !== 'playing'" class="ended-box">
            <b>{{ status === 'success' ? '已完攀' : '已坠落' }}</b>
            <button class="secondary-button" @click="openReview(allAttempts.find(a => !a.id.startsWith('builtin')) ?? allAttempts[0])">回看本次</button>
            <button class="primary-button" @click="reset({ guide: guideActive })"><RotateCcw :size="16" /> 重开</button>
          </div>
          <p v-else-if="notice" class="notice">{{ notice }}</p>
        </template>
      </aside>
    </main>

    <section class="attempt-bar mech-card" aria-label="复盘记录">
      <div class="attempt-heading">
        <h2>复盘样本与我的尝试</h2>
        <span>{{ stored ? '记录保存在本机' : '浏览器存储不可用，仅保留当前列表' }}</span>
      </div>
      <div class="attempt-chips">
        <button v-for="attempt in allAttempts" :key="attempt.id" class="attempt-chip"
          :class="[attempt.result, { active: activeReview?.id === attempt.id }]"
          @click="openAttempt(attempt)">
          <b>{{ attempt.id === 'builtin-success' ? '通关示例' : attempt.id === 'builtin-jam' ? '卡止样本' : attempt.id === 'builtin-imbalance' ? '失衡样本' : '我的尝试' }}</b>
          <span>{{ attempt.events.length }} 步 · {{ attempt.result === 'success' ? '成功' : attempt.result === 'jam' ? '卡止' : '坠落' }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
