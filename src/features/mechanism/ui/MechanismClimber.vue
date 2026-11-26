<script setup lang="ts">
import { computed } from 'vue';
import { bodyAt, mechanismLimbTags, worldHold } from '../lib/engine';
import type { Limb, PartialContacts } from '../lib/types';
import type { Level } from '../lib/types';

const props = defineProps<{
  level: Level;
  contacts: PartialContacts;
  angle: number;
  selected: Limb;
  attemptTarget?: string | null;
}>();

const limbs: Limb[] = ['lh', 'rh', 'lf', 'rf'];
const center = computed(() => bodyAt(props.level, props.contacts, props.angle));

const lines = computed(() => limbs.map((limb) => {
  const id = props.contacts[limb];
  const side = limb.startsWith('l') ? -1 : 1;
  const hand = limb === 'lh' || limb === 'rh';
  const joint = {
    x: center.value.x + side * (hand ? 15 : 10),
    y: center.value.y + (hand ? -21 : 21),
  };
  if (!id) {
    const target = props.attemptTarget ? worldHold(props.level, props.attemptTarget, props.angle) : null;
    const reachEnd = target
      ? { x: joint.x + (target.x - joint.x) * 0.72, y: joint.y + (target.y - joint.y) * 0.72 }
      : joint;
    return { limb, joint, path: `M${joint.x} ${joint.y} L${reachEnd.x} ${reachEnd.y}`, missing: true, end: reachEnd };
  }
  const end = worldHold(props.level, id, props.angle);
  const bend = {
    x: (joint.x + end.x) / 2 + side * 16,
    y: (joint.y + end.y) / 2 + (hand ? 10 : -10),
  };
  return {
    limb, joint, end, missing: false,
    path: `M${joint.x} ${joint.y} L${bend.x} ${bend.y} ${end.x} ${end.y}`,
  };
}));

const attempt = computed(() => {
  if (!props.attemptTarget) return null;
  return worldHold(props.level, props.attemptTarget, props.angle);
});
const selectedJoint = computed(() => lines.value.find(item => item.limb === props.selected)?.joint ?? center.value);
</script>

<template>
  <g class="mech-pose" aria-hidden="true">
    <path
      v-if="attempt && contacts[selected]"
      :d="`M${selectedJoint.x} ${selectedJoint.y} L${attempt.x} ${attempt.y}`"
      class="mech-preview-line"
    />
    <path v-else-if="attempt" :d="`M${center.x} ${center.y} L${attempt.x} ${attempt.y}`" class="mech-attempt-line" />
    <g v-for="line in lines" :key="line.limb" :class="['mech-limb', { active: line.limb === selected, broken: line.missing }]">
      <path :d="line.path" class="mech-limb-shadow" />
      <path :d="line.path" class="mech-limb-line" />
      <circle v-if="!line.missing" :cx="line.end.x" :cy="line.end.y" r="6.5" class="mech-contact" />
      <circle v-else :cx="line.end.x" :cy="line.end.y" r="5" class="mech-detached" />
      <text
        v-if="!line.missing"
        :x="line.end.x + (line.limb.startsWith('l') ? -25 : 25)"
        :y="line.end.y + 4"
        class="mech-contact-label"
      >{{ mechanismLimbTags[line.limb] }}</text>
    </g>
    <g :transform="`translate(${center.x} ${center.y})`">
      <path d="M-17-23Q0-29 17-23L13 18Q0 28-13 18Z" fill="#f1f0df" stroke="#172d27" stroke-width="3" />
      <path d="M-13 7H13L11 19Q0 26-11 19Z" fill="#f2b85d" />
      <circle cy="-36" r="12.5" fill="#e6b18f" stroke="#172d27" stroke-width="3" />
      <path d="M-12-38A12.5 12.5 0 0 1 12-38L12-34H-12Z" fill="#eef0df" />
    </g>
  </g>
</template>
