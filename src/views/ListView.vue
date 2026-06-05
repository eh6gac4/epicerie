<template>
  <div class="list-view">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="戻る">
        <svg width="9" height="16" viewBox="0 0 9 16" fill="none">
          <path d="M8 1L1 8L8 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <span class="header-title">{{ list?.name ?? '…' }}</span>
      <button class="share-btn" @click="share" :disabled="!list" aria-label="シェア">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/>
          <circle cx="6" cy="12" r="3"/>
          <circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </button>
    </header>

    <main class="main">
      <div v-if="loading && items.length === 0" class="center-state">
        <div class="spinner" />
      </div>

      <div v-else-if="error && items.length === 0" class="center-state">
        <p class="state-msg error-msg">{{ error }}</p>
      </div>

      <div v-else-if="items.length === 0" class="center-state">
        <svg class="empty-art" width="64" height="64" viewBox="0 0 64 64" fill="none">
          <path d="M16 32h32M16 22h32M16 42h20" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <circle cx="50" cy="50" r="10" fill="var(--tg-bg)" stroke="currentColor" stroke-width="1.4"/>
          <path d="M50 45v10M45 50h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <p class="state-title">まだ何もありません</p>
        <p class="state-sub">下の入力欄からアイテムを追加できます</p>
      </div>

      <template v-else>
        <!-- Unchecked items -->
        <TransitionGroup name="item" tag="div" class="item-group">
          <div
            v-for="item in uncheckedItems"
            :key="item.id"
            class="item"
            @click="toggleItem(item)"
          >
            <div class="checkbox">
              <svg v-if="item.checked" width="12" height="10" viewBox="0 0 12 10" fill="none">
                <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <span class="item-name">{{ item.name }}</span>
            <button class="del-btn" @click.stop="deleteItem(item)" aria-label="削除">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </TransitionGroup>

        <!-- Checked section -->
        <template v-if="checkedItems.length > 0">
          <div class="section-label">完了済み {{ checkedItems.length }}件</div>
          <TransitionGroup name="item" tag="div" class="item-group muted">
            <div
              v-for="item in checkedItems"
              :key="item.id"
              class="item"
              @click="toggleItem(item)"
            >
              <div class="checkbox is-checked">
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                  <path d="M1 5L4.5 8.5L11 1.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <span class="item-name is-done">{{ item.name }}</span>
              <button class="del-btn" @click.stop="deleteItem(item)" aria-label="削除">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M1.5 1.5l10 10M11.5 1.5l-10 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </TransitionGroup>
        </template>
      </template>
    </main>

    <footer class="footer">
      <div class="input-row">
        <input
          ref="addInput"
          v-model="newItem"
          class="add-input"
          placeholder="アイテムを追加…"
          maxlength="100"
          @keydown.enter="addItem"
        />
        <button
          class="add-btn"
          :disabled="!newItem.trim()"
          @click="addItem"
          aria-label="追加"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 15.5V2.5M3 8.5l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </footer>

    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toast" class="toast">{{ toast }}</div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../composables/useApi.js'
import { getWebApp } from '../composables/useTelegram.js'

const route = useRoute()
const router = useRouter()
const listId = route.params.id

const list = ref(null)
const items = ref([])
const loading = ref(true)
const error = ref(null)
const newItem = ref('')
const toast = ref('')
let pollTimer = null

const uncheckedItems = computed(() => items.value.filter(i => !i.checked))
const checkedItems = computed(() => items.value.filter(i => i.checked))

async function loadList() {
  try {
    list.value = await api.getList(listId)
  } catch (e) {
    error.value = e.message
  }
}

async function loadItems() {
  try {
    items.value = await api.getItems(listId)
    error.value = null
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function toggleItem(item) {
  const prev = item.checked
  item.checked = !prev
  getWebApp()?.HapticFeedback?.selectionChanged()
  try {
    await api.updateItem(item.id, { checked: item.checked })
  } catch {
    item.checked = prev
  }
}

async function addItem() {
  const name = newItem.value.trim()
  if (!name) return
  newItem.value = ''
  const tmp = { id: '_tmp_' + Date.now(), list_id: listId, name, checked: false }
  items.value.push(tmp)
  getWebApp()?.HapticFeedback?.impactOccurred('light')
  try {
    const created = await api.addItem(listId, name)
    const idx = items.value.findIndex(i => i.id === tmp.id)
    if (idx !== -1) items.value[idx] = created
  } catch (e) {
    items.value = items.value.filter(i => i.id !== tmp.id)
    showToast(e.message)
    newItem.value = name
  }
}

async function deleteItem(item) {
  items.value = items.value.filter(i => i.id !== item.id)
  getWebApp()?.HapticFeedback?.impactOccurred('medium')
  try {
    await api.deleteItem(item.id)
  } catch {
    items.value.push(item)
  }
}

async function share() {
  const code = list.value?.share_code
  if (!code) return
  const botUsername = import.meta.env.VITE_BOT_USERNAME
  const url = botUsername
    ? `https://t.me/${botUsername}?startapp=${code}`
    : `シェアコード: ${code}`
  try {
    await navigator.clipboard.writeText(url)
    showToast('リンクをコピーしました')
  } catch {
    showToast(`コード: ${code}`)
  }
  getWebApp()?.HapticFeedback?.notificationOccurred('success')
}

function goBack() {
  router.push('/')
}

function showToast(msg, ms = 2500) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, ms)
}

onMounted(async () => {
  await Promise.all([loadList(), loadItems()])
  pollTimer = setInterval(loadItems, 3000)
})

onUnmounted(() => {
  clearInterval(pollTimer)
})
</script>

<style scoped>
.list-view {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-width: 600px;
  margin: 0 auto;
}

/* ── Header ── */
.header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 10px 10px 6px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  background: var(--tg-bg);
  z-index: 10;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-hint) 11%, transparent);
}

.back-btn {
  padding: 9px 12px;
  color: var(--tg-link);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: 8px;
  transition: opacity 0.14s;
}

.back-btn:active { opacity: 0.55; }

.header-title {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-btn {
  padding: 9px;
  color: var(--tg-link);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: 8px;
  transition: opacity 0.14s;
}

.share-btn:active { opacity: 0.55; }
.share-btn:disabled { opacity: 0.28; }

/* ── Main ── */
.main {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* ── States ── */
.center-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 48px 24px;
  gap: 8px;
  text-align: center;
}

.empty-art {
  color: var(--tg-hint);
  opacity: 0.3;
  margin-bottom: 10px;
}

.state-title {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
}

.state-sub {
  margin: 0;
  font-size: 13px;
  color: var(--tg-hint);
  line-height: 1.6;
}

.state-msg {
  margin: 0;
  font-size: 14px;
}

.error-msg { color: #e05050; }

.spinner {
  width: 26px;
  height: 26px;
  border: 2px solid color-mix(in srgb, var(--tg-hint) 28%, transparent);
  border-top-color: var(--tg-hint);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Items ── */
.item-group {
  position: relative;
}

.muted {
  opacity: 0.6;
}

.item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-hint) 8%, transparent);
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}

.item:active {
  background: color-mix(in srgb, var(--tg-hint) 7%, transparent);
}

/* Custom checkbox – rounded square */
.checkbox {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  border: 1.8px solid color-mix(in srgb, var(--tg-hint) 55%, transparent);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.18s, border-color 0.18s, transform 0.14s;
}

.checkbox.is-checked {
  background: var(--tg-button);
  border-color: var(--tg-button);
  color: var(--tg-button-text);
  transform: scale(1.06);
}

.item-name {
  flex: 1;
  font-size: 16px;
  line-height: 1.4;
  font-weight: 400;
}

.item-name.is-done {
  text-decoration: line-through;
  color: var(--tg-hint);
}

.del-btn {
  flex-shrink: 0;
  color: var(--tg-hint);
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.item:hover .del-btn,
.item:focus-within .del-btn {
  opacity: 0.55;
}

@media (hover: none) {
  .del-btn { opacity: 0.45; }
}

.del-btn:active {
  opacity: 1;
  color: #e05050;
}

/* Section label */
.section-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--tg-hint);
  padding: 16px 16px 6px;
}

/* ── Footer ── */
.footer {
  flex-shrink: 0;
  background: var(--tg-bg);
  border-top: 1px solid color-mix(in srgb, var(--tg-hint) 11%, transparent);
  padding: 10px 12px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 10px);
}

.input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.add-input {
  flex: 1;
  background: var(--tg-secondary-bg);
  border: none;
  border-radius: 12px;
  padding: 13px 16px;
  font-size: 16px;
  color: var(--tg-text);
  outline: none;
  transition: background 0.15s;
}

.add-input:focus {
  background: color-mix(in srgb, var(--tg-secondary-bg) 80%, var(--tg-hint));
}

.add-input::placeholder {
  color: var(--tg-hint);
}

.add-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--tg-button);
  color: var(--tg-button-text);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: opacity 0.14s, transform 0.12s;
}

.add-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.add-btn:not(:disabled):active {
  opacity: 0.8;
  transform: scale(0.91);
}

/* ── Item Transitions ── */
.item-enter-active,
.item-leave-active {
  transition: opacity 0.18s, transform 0.18s;
}

.item-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.item-leave-to {
  opacity: 0;
  transform: translateX(8px);
}

.item-leave-active {
  position: absolute;
  width: 100%;
}

/* ── Toast ── */
.toast {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
  left: 50%;
  transform: translateX(-50%);
  background: color-mix(in srgb, var(--tg-text) 88%, transparent);
  color: var(--tg-bg);
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 14px;
  white-space: nowrap;
  z-index: 200;
  pointer-events: none;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
