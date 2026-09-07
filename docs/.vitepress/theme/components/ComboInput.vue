<script setup lang="ts">
/** 可输入也可点选预设，对齐客户端 filterable + allow-create */
import { onMounted, onUnmounted, ref } from 'vue'

export interface ComboOption {
  value: string
  hint?: string
}

const model = defineModel<string>({ required: true })
defineProps<{ options: ComboOption[]; placeholder?: string }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function pick(value: string): void {
  model.value = value
  open.value = false
}

function onDocPointerDown(e: PointerEvent): void {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="ri-combo">
    <input v-model="model" type="text" :placeholder="placeholder" spellcheck="false" />
    <button type="button" class="ri-combo-arrow" @click="open = !open">▾</button>
    <ul v-show="open" class="ri-combo-list">
      <li
        v-for="opt in options"
        :key="opt.value"
        :class="{ on: model === opt.value }"
        @mousedown.prevent="pick(opt.value)">
        <span>{{ opt.value }}</span>
        <span v-if="opt.hint" class="ri-combo-hint">{{ opt.hint }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ri-combo {
  position: relative;
  width: 100%;
  min-width: 0;
}

.ri-combo input {
  width: 100%;
  padding-right: 26px;
}

.ri-combo-arrow {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 26px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0 6px 6px 0;
  background: transparent;
  color: var(--vp-c-text-3);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.ri-combo-list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 40;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-2);
  max-height: 240px;
  overflow: auto;
}

.ri-combo-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  margin: 0;
  border-radius: 4px;
  font-size: 13px;
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.ri-combo-list li:hover,
.ri-combo-list li.on {
  background: var(--vp-c-brand-soft);
}

.ri-combo-hint {
  color: var(--vp-c-text-3);
  font-size: 12px;
  white-space: nowrap;
}
</style>
