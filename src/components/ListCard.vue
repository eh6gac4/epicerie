<template>
  <div
    class="card"
    :class="{ 'card--archived': archived }"
    :style="archived ? undefined : `--i: ${index}`"
    @click="longPress.click(list)"
    @touchstart="longPress.start(list)"
    @touchend="longPress.end()"
    @touchcancel="longPress.cancel()"
    @touchmove="longPress.cancel()"
    @mousedown="longPress.start(list)"
    @mouseup="longPress.end()"
    @mouseleave="longPress.cancel()"
    @contextmenu.prevent="emit('menu', list)"
  >
    <div class="card-body">
      <div class="card-name">{{ list.name }}</div>
      <div class="card-foot">
        <span v-if="archived" class="foot-hint">アーカイブ済み</span>
        <span v-else-if="list.item_count === 0" class="foot-hint">空のリスト</span>
        <template v-else>
          <span class="foot-frac">
            <span class="frac-done">{{ list.checked_count }}</span>
            <span class="frac-slash"> / </span>
            <span class="frac-total">{{ list.item_count }}</span>
          </span>
          <span class="foot-hint">完了</span>
          <span v-if="list.checked_count === list.item_count" class="foot-badge">✓</span>
        </template>
      </div>
    </div>
    <div v-if="!archived && list.item_count > 0" class="card-bar">
      <div class="card-bar-fill" :style="`width: ${progress}%`" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLongPress } from '../composables/useLongPress.js'

const props = defineProps({
  list: { type: Object, required: true },
  index: { type: Number, default: 0 },
  archived: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'menu'])

const longPress = useLongPress(() => emit('menu', props.list), {
  onTap: () => emit('open', props.list),
})

const progress = computed(() => {
  const { item_count, checked_count } = props.list
  return item_count > 0 ? Math.round((checked_count / item_count) * 100) : 0
})
</script>

<style scoped>
.card {
  background: var(--tg-secondary-bg);
  border-radius: var(--radius);
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  animation: rise 0.32s calc(var(--i, 0) * 60ms) cubic-bezier(0.22, 0.61, 0.36, 1) both;
  transition: transform 0.12s, opacity 0.12s;
}

.card:active {
  transform: scale(0.975);
  opacity: 0.88;
}

@keyframes rise {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.card-body {
  padding: 16px 18px 14px;
}

.card-name {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin-bottom: 6px;
}

.card-foot {
  display: flex;
  align-items: center;
  gap: 5px;
}

.foot-frac {
  font-size: 13px;
}

.frac-done {
  font-weight: 500;
}

.frac-slash {
  color: var(--tg-hint);
  opacity: 0.5;
}

.frac-total {
  color: var(--tg-hint);
}

.foot-hint {
  font-size: 13px;
  color: var(--tg-hint);
}

.foot-badge {
  font-size: 12px;
  color: var(--tg-button);
  font-weight: 600;
  margin-left: 2px;
}

.card-bar {
  height: 3px;
  background: color-mix(in srgb, var(--tg-hint) 14%, transparent);
}

.card-bar-fill {
  height: 100%;
  background: var(--tg-button);
  transition: width 0.45s cubic-bezier(0.22, 0.61, 0.36, 1);
  border-radius: 0 2px 2px 0;
}

.card--archived {
  opacity: 0.6;
}
</style>
