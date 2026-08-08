<template>
  <div class="home">
    <header class="header">
      <div class="brand">
        <div class="brand-name">Épicerie</div>
        <div class="brand-sub">買い物リスト</div>
      </div>
      <button class="new-btn" @click="openCreate" aria-label="新しいリストを作成">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </header>

    <main class="main">
      <div v-if="loading" class="center-state">
        <div class="spinner" />
      </div>

      <div v-else-if="error" class="center-state">
        <p class="state-msg error-msg">{{ error }}</p>
      </div>

      <div v-else-if="lists.length === 0" class="center-state">
        <svg class="empty-art" width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect x="16" y="12" width="40" height="50" rx="5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M25 28h22M25 37h22M25 46h14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <circle cx="54" cy="54" r="12" fill="var(--tg-bg)" stroke="currentColor" stroke-width="1.4"/>
          <path d="M54 49v10M49 54h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <p class="state-title">リストがありません</p>
        <p class="state-sub">「＋」から最初のリストを作りましょう</p>
      </div>

      <div v-else class="cards">
        <ListCard
          v-for="(list, i) in lists"
          :key="list.id"
          :list="list"
          :index="i"
          @open="goToList"
          @menu="openListMenu"
        />
      </div>

      <div v-if="archivedLists.length > 0" class="archived-section">
        <button class="archived-toggle" @click="showArchived = !showArchived">
          <span>アーカイブ済み ({{ archivedLists.length }})</span>
          <svg
            class="archived-chevron"
            :class="{ 'archived-chevron--open': showArchived }"
            width="12" height="12" viewBox="0 0 12 12" fill="none"
          >
            <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        <div v-if="showArchived" class="cards archived-cards">
          <ListCard
            v-for="list in archivedLists"
            :key="list.id"
            :list="list"
            archived
            @open="goToList"
            @menu="openListMenu"
          />
        </div>
      </div>
    </main>

    <!-- Bottom sheet -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="showCreate" class="overlay" @click.self="closeCreate">
          <div class="sheet">
            <div class="sheet-handle" />
            
            <div class="sheet-tabs">
              <button
                class="sheet-tab"
                :class="{ 'sheet-tab--active': sheetMode === 'create' }"
                @click="sheetMode = 'create'"
              >
                新しく作成
              </button>
              <button
                class="sheet-tab"
                :class="{ 'sheet-tab--active': sheetMode === 'join' }"
                @click="sheetMode = 'join'"
              >
                コードで参加
              </button>
            </div>

            <template v-if="sheetMode === 'create'">
              <input
                ref="nameInput"
                v-model="newName"
                class="sheet-input"
                placeholder="リスト名…"
                maxlength="50"
                @keydown.enter="createList"
              />
              <button
                class="sheet-btn"
                :class="{ 'sheet-btn--muted': !newName.trim() || creating }"
                @click="createList"
              >
                {{ creating ? '作成中…' : 'リストを作成' }}
              </button>
            </template>

            <template v-else>
              <input
                ref="codeInput"
                v-model="shareCode"
                class="sheet-input"
                placeholder="共有コード（英数字6文字）…"
                maxlength="10"
                @keydown.enter="joinListByCode"
                style="text-transform: uppercase;"
              />
              <button
                class="sheet-btn"
                :class="{ 'sheet-btn--muted': !shareCode.trim() || joining }"
                @click="joinListByCode"
              >
                {{ joining ? '参加中…' : '参加する' }}
              </button>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- List action sheet -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="menuList" class="overlay" @click.self="menuList = null">
          <div class="sheet">
            <div class="sheet-handle" />

            <button v-if="isArchived(menuList)" class="sheet-btn" @click="unarchiveSelected">アーカイブを解除</button>
            <button v-else class="sheet-btn" @click="archiveSelected">アーカイブする</button>
            <button
              v-if="isOwner(menuList)"
              class="sheet-btn sheet-btn--danger"
              @click="deleteSelected"
            >削除する</button>
            <button
              v-else
              class="sheet-btn sheet-btn--danger"
              @click="leaveSelected"
            >リストから抜ける</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Toast -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toast" class="toast">{{ toast }}</div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../composables/useApi.js'
import { getWebApp, getMyUserId } from '../composables/useTelegram.js'
import { useListActions } from '../composables/useListActions.js'
import ListCard from '../components/ListCard.vue'

const router = useRouter()
const listActions = useListActions()
const myUserId = getMyUserId()
const allLists = ref([])
const lists = computed(() => allLists.value.filter(l => !l.archived_at))
const archivedLists = computed(() => allLists.value.filter(l => !!l.archived_at))
const showArchived = ref(false)
const loading = ref(true)
const error = ref(null)
const showCreate = ref(false)
const sheetMode = ref('create')
const newName = ref('')
const shareCode = ref('')
const creating = ref(false)
const joining = ref(false)
const toast = ref('')
const nameInput = ref(null)
const codeInput = ref(null)
const menuList = ref(null)

function goToList(list) {
  router.push(`/list/${list.id}`)
}

function openListMenu(list) {
  menuList.value = list
}

function isOwner(list) {
  return list && myUserId != null && list.created_by === myUserId
}

function isArchived(list) {
  return !!list?.archived_at
}

async function archiveSelected() {
  const list = menuList.value
  menuList.value = null
  if (!list) return
  try {
    if (await listActions.archive(list.id)) await load()
  } catch (e) {
    showToast(e.message)
  }
}

async function unarchiveSelected() {
  const list = menuList.value
  menuList.value = null
  if (!list) return
  try {
    if (await listActions.unarchive(list.id)) await load()
  } catch (e) {
    showToast(e.message)
  }
}

async function deleteSelected() {
  const list = menuList.value
  menuList.value = null
  if (!list) return
  try {
    if (await listActions.delete(list.id)) await load()
  } catch (e) {
    showToast(e.message)
  }
}

async function leaveSelected() {
  const list = menuList.value
  menuList.value = null
  if (!list) return
  try {
    if (await listActions.leave(list.id)) await load()
  } catch (e) {
    showToast(e.message)
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    allLists.value = await api.getLists()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function openCreate() {
  sheetMode.value = 'create'
  showCreate.value = true
}

function closeCreate() {
  showCreate.value = false
  newName.value = ''
  shareCode.value = ''
}

async function createList() {
  const name = (nameInput.value?.value ?? newName.value).trim()
  if (!name || creating.value) return
  newName.value = name
  creating.value = true
  try {
    const list = await api.createList(name)
    closeCreate()
    getWebApp()?.HapticFeedback?.notificationOccurred('success')
    await router.push(`/list/${list.id}`)
  } catch (e) {
    showToast(e.message)
  } finally {
    creating.value = false
  }
}

async function joinListByCode() {
  const code = (codeInput.value?.value ?? shareCode.value).trim()
  if (!code || joining.value) return
  shareCode.value = code
  joining.value = true
  try {
    const list = await api.joinList(code)
    closeCreate()
    getWebApp()?.HapticFeedback?.notificationOccurred('success')
    await router.push(`/list/${list.id}`)
  } catch (e) {
    showToast(e.message)
  } finally {
    joining.value = false
  }
}

function showToast(msg, ms = 2500) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, ms)
}

async function handleStartParam() {
  const tg = getWebApp()
  const code = tg?.initDataUnsafe?.start_param
  if (!code) return
  try {
    const list = await api.joinList(code)
    getWebApp()?.HapticFeedback?.notificationOccurred('success')
    await router.push(`/list/${list.id}`)
  } catch (e) {
    if (e.status !== 404) showToast(e.message)
  }
}

watch(showCreate, (val) => {
  if (val) {
    newName.value = ''
    shareCode.value = ''
    if (sheetMode.value === 'create') {
      nextTick(() => nameInput.value?.focus())
    } else {
      nextTick(() => codeInput.value?.focus())
    }
  }
})

watch(sheetMode, (mode) => {
  if (showCreate.value) {
    if (mode === 'create') nextTick(() => nameInput.value?.focus())
    else nextTick(() => codeInput.value?.focus())
  }
})

onMounted(async () => {
  await handleStartParam()
  await load()
})
</script>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  max-width: 600px;
  margin: 0 auto;
}

/* ── Header ── */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 14px;
  position: sticky;
  top: 0;
  background: var(--tg-bg);
  z-index: 10;
}

.brand-name {
  font-family: var(--font-serif);
  font-size: 32px;
  font-style: italic;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.025em;
}

.brand-sub {
  font-size: 10px;
  letter-spacing: 0.13em;
  color: var(--tg-hint);
  text-transform: uppercase;
  margin-top: 3px;
  font-weight: 300;
}

.new-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--tg-button);
  color: var(--tg-button-text);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.14s, opacity 0.14s;
}

.new-btn:active {
  transform: scale(0.9);
  opacity: 0.85;
}

/* ── Main ── */
.main {
  flex: 1;
  padding: 6px 16px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
}

/* ── States ── */
.center-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
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
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.01em;
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

.error-msg {
  color: #e05050;
}

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

/* ── Cards ── */
.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* card 自体の見た目は ListCard.vue 側で定義 */

/* ── Archived section ── */
.archived-section {
  margin-top: 18px;
}

.archived-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  font-size: 13px;
  color: var(--tg-hint);
  width: 100%;
}

.archived-chevron {
  transition: transform 0.2s;
}

.archived-chevron--open {
  transform: rotate(180deg);
}

.archived-cards {
  margin-top: 8px;
}

/* ── Overlay + Sheet ── */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: flex-end;
  z-index: 100;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.sheet {
  width: 100%;
  background: var(--tg-bg);
  border-radius: 22px 22px 0 0;
  padding: 10px 20px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
  animation: sheetUp 0.32s cubic-bezier(0.32, 0.72, 0, 1) both;
}

@keyframes sheetUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--tg-hint) 32%, transparent);
  margin: 0 auto 22px;
}

.sheet-title {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 18px;
}

.sheet-tabs {
  display: flex;
  background: var(--tg-secondary-bg);
  border-radius: 10px;
  padding: 4px;
  margin-bottom: 20px;
}

.sheet-tab {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--tg-hint);
  background: transparent;
  transition: all 0.2s;
}

.sheet-tab--active {
  background: var(--tg-bg);
  color: var(--tg-text);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.sheet-input {
  display: block;
  width: 100%;
  background: var(--tg-secondary-bg);
  border: none;
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 16px;
  color: var(--tg-text);
  outline: none;
  margin-bottom: 12px;
}

.sheet-input::placeholder {
  color: var(--tg-hint);
}

.sheet-btn {
  display: block;
  width: 100%;
  background: var(--tg-button);
  color: var(--tg-button-text);
  border-radius: 12px;
  padding: 15px;
  font-size: 16px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
  transition: opacity 0.15s;
}

.debug-banner {
  background: #ff6b35;
  color: #fff;
  font-size: 12px;
  text-align: center;
  padding: 4px 8px;
  border-radius: 6px;
  margin-bottom: 12px;
}

.sheet-btn--muted {
  opacity: 0.38;
}

.sheet-btn--danger {
  background: color-mix(in srgb, #e05050 12%, transparent);
  color: #e05050;
  margin-top: 8px;
}

.sheet-btn:not(.sheet-btn--muted):active {
  opacity: 0.78;
}

/* ── Transitions ── */
.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.28s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

/* ── Toast ── */
.toast {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 28px);
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
