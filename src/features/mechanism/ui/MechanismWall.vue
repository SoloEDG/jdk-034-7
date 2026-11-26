<script setup lang="ts">
import { computed } from 'vue';
import { RotateCcw } from 'lucide-vue-next';
import { worldHold } from '../lib/engine';
import type { BoardPose, Level, Limb, PartialContacts } from '../lib/types';
import MechanismClimber from './MechanismClimber.vue';

const props = defineProps<{
  level: Level;
  pose: BoardPose;
  contacts: PartialContacts;
  selected: Limb;
  states: Record<string, string>;
  availableIds?: string[];
  targetId?: string | null;
  previewTarget?: string | null;
  guideTarget?: string | null;
  blockerHoldId?: string | null;
  lostHoldId?: string | null;
  attemptTarget?: string | null;
  locked?: boolean;
  caption: string;
}>();

const emit = defineEmits<{ choose: [id: string]; reset: [] }>();
const available = computed(() => new Set(props.availableIds ?? []));
const blockerWorld = computed(() => props.blockerHoldId
  ? worldHold(props.level, props.blockerHoldId, props.pose.angle)
  : null);
const lostWorld = computed(() => props.lostHoldId
  ? worldHold(props.level, props.lostHoldId, props.pose.angle)
  : null);
const blockerLabelX = computed(() => {
  const x = blockerWorld.value?.x ?? 360;
  return Math.max(18, Math.min(518, x - 84));
});
const blockerCalloutPath = computed(() => {
  const target = blockerWorld.value;
  if (!target) return '';
  const startX = blockerLabelX.value + 92;
  return `M${startX} 160 C${startX} 196 ${target.x} 188 ${target.x} ${target.y - 24}`;
});

function holdClasses(id: string) {
  const state = props.states[id] ?? 'idle';
  return [
    'mhold',
    `state-${state}`,
    {
      available: available.value.has(id),
      blocker: props.blockerHoldId === id,
      lost: props.lostHoldId === id,
      guide: props.guideTarget === id,
    },
  ];
}

function choose(id: string) {
  if (!props.locked) emit('choose', id);
}
</script>

<template>
  <section class="mech-wall" :style="{ '--route': level.color }" aria-label="双板摇臂岩壁">
    <div class="mech-wall-head">
      <div>
        <span class="mech-grade">{{ level.grade }}</span>
        <h1>{{ level.name }}</h1>
      </div>
      <button class="icon-button" aria-label="重开机关关卡" title="重开机关关卡" @click="emit('reset')">
        <RotateCcw :size="19" />
      </button>
    </div>

    <svg viewBox="0 0 720 560" class="mech-svg" role="img" aria-label="两块随摇臂反向升降的岩点板">
      <defs>
        <pattern id="mech-bolts" width="34" height="34" patternUnits="userSpaceOnUse">
          <circle cx="6" cy="6" r="1.3" fill="#10261f" opacity=".48" />
        </pattern>
        <filter id="mech-grain"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2" stitchTiles="stitch" /></filter>
        <marker id="arrow-warning" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0 0L8 4L0 8Z" fill="#ff9a83" />
        </marker>
      </defs>

      <rect width="720" height="560" fill="#2d473e" />
      <path d="M0 0H350L330 560H0Z" fill="#38574a" />
      <path d="M370 0H720V560H390Z" fill="#405f50" />
      <rect width="720" height="560" fill="url(#mech-bolts)" />
      <rect width="720" height="560" opacity=".12" filter="url(#mech-grain)" pointer-events="none" />

      <!-- fixed frame and floor -->
      <path d="M54 528H666" stroke="#b9c8ad" stroke-width="2" stroke-dasharray="7 7" opacity=".55" />
      <text x="66" y="520" class="mech-axis-label">地面 / 安全垫</text>
      <rect x="333" y="462" width="54" height="24" rx="5" fill="#20372f" stroke="#78917f" stroke-width="2" />
      <circle :cx="level.pivot.x" :cy="level.pivot.y" r="15" fill="#d8c071" stroke="#172d27" stroke-width="4" />
      <circle :cx="level.pivot.x" :cy="level.pivot.y" r="5" fill="#263d34" />

      <!-- shared rocker -->
      <line
        :x1="pose.leftEndpoint.x" :y1="pose.leftEndpoint.y"
        :x2="pose.rightEndpoint.x" :y2="pose.rightEndpoint.y"
        class="rocker-shadow"
      />
      <line
        :x1="pose.leftEndpoint.x" :y1="pose.leftEndpoint.y"
        :x2="pose.rightEndpoint.x" :y2="pose.rightEndpoint.y"
        class="rocker-beam"
      />
      <path
        :d="`M${level.pivot.x - 42} ${level.pivot.y + 34} A42 42 0 0 1 ${level.pivot.x + 42} ${level.pivot.y + 34}`"
        class="angle-arc"
      />
      <text :x="level.pivot.x" :y="level.pivot.y + 55" text-anchor="middle" class="angle-text">{{ pose.angle.toFixed(1) }}°</text>

      <!-- left board -->
      <g :transform="`translate(${pose.leftDx} ${pose.leftDy})`" class="board board-left">
        <rect x="42" y="64" width="286" height="430" rx="18" class="board-rect" />
        <path d="M68 104L176 78 292 126 268 260 306 402 214 474 82 452 60 318Z" class="board-facet" />
        <text x="70" y="94" class="board-name">左板</text>
        <path d="M155 454v20" stroke="#9fb49f" stroke-width="7" stroke-linecap="round" />
        <g v-for="hold in level.holds.filter(h => h.board === 'left')" :key="hold.id"
          :class="holdClasses(hold.id)" role="button" tabindex="0"
          :aria-label="`岩点 ${hold.label}`"
          @click="choose(hold.id)"
          @keydown.enter.prevent="choose(hold.id)"
          @keydown.space.prevent="choose(hold.id)">
          <circle v-if="hold.brake" r="21" class="brake-ring" />
          <circle r="16" class="hold-shape" />
          <text y="4" class="hold-text">{{ hold.label }}</text>
        </g>
      </g>

      <!-- right board -->
      <g :transform="`translate(${pose.rightDx} ${pose.rightDy})`" class="board board-right">
        <rect x="392" y="64" width="286" height="430" rx="18" class="board-rect" />
        <path d="M420 116 512 78 650 112 658 268 626 438 500 476 414 410 438 270Z" class="board-facet" />
        <text x="420" y="94" class="board-name">右板</text>
        <path d="M565 454v20" stroke="#9fb49f" stroke-width="7" stroke-linecap="round" />
        <g v-for="hold in level.holds.filter(h => h.board === 'right')" :key="hold.id"
          :class="holdClasses(hold.id)" role="button" tabindex="0"
          :aria-label="`岩点 ${hold.label}`"
          @click="choose(hold.id)"
          @keydown.enter.prevent="choose(hold.id)"
          @keydown.space.prevent="choose(hold.id)">
          <circle v-if="hold.brake" r="21" class="brake-ring" />
          <circle r="16" class="hold-shape" />
          <text y="4" class="hold-text">{{ hold.label }}</text>
        </g>
      </g>

      <!-- fixed holds are outside board transforms -->
      <g v-for="hold in level.holds.filter(h => h.board === 'fixed')" :key="hold.id"
        :transform="`translate(${hold.x} ${hold.y})`"
        :class="holdClasses(hold.id)" role="button" tabindex="0"
        :aria-label="hold.kind === 'trigger' ? '机关踏点 T' : '完攀点 F'"
        @click="choose(hold.id)"
        @keydown.enter.prevent="choose(hold.id)"
        @keydown.space.prevent="choose(hold.id)">
        <template v-if="hold.kind === 'trigger'">
          <rect x="-25" y="-15" width="50" height="30" rx="7" class="trigger-shape" />
          <text y="5" text-anchor="middle" class="trigger-text">踏</text>
        </template>
        <template v-else>
          <path d="M0-22L6-7H22L9 3L14 20 0 10-14 20-9 3-22-7H-6Z" class="finish-shape" />
          <text y="5" text-anchor="middle" class="finish-text">F</text>
        </template>
      </g>

      <circle v-if="lostWorld" :cx="lostWorld.x" :cy="lostWorld.y" r="20" class="lost-ring" />
      <MechanismClimber
        :level="level" :contacts="contacts" :angle="pose.angle" :selected="selected"
        :attempt-target="attemptTarget ?? previewTarget ?? targetId"
      />

      <g v-if="blockerHoldId" class="blocker-callout" pointer-events="none">
        <path :d="blockerCalloutPath" class="blocker-arrow" marker-end="url(#arrow-warning)" />
        <rect :x="blockerLabelX - 8" y="118" rx="7" width="184" height="42" class="blocker-box" />
        <text :x="blockerLabelX + 84" y="136" text-anchor="middle" class="blocker-title">接触 {{ blockerHoldId }} 拦住</text>
        <text :x="blockerLabelX + 84" y="153" text-anchor="middle" class="blocker-sub">承重凸轮 / 摇臂卡止</text>
      </g>
    </svg>

    <div class="mech-wall-foot">
      <span>{{ caption }}</span>
      <span class="board-readout">左 {{ pose.leftDy >= 0 ? '降' : '升' }}{{ Math.abs(Math.round(pose.leftDy)) }} · 右 {{ pose.rightDy >= 0 ? '降' : '升' }}{{ Math.abs(Math.round(pose.rightDy)) }}</span>
    </div>
  </section>
</template>
