<template>
  <div class="list-view">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="戻る">
        <svg width="9" height="16" viewBox="0 0 9 16" fill="none">
          <path d="M8 1L1 8L8 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <span class="header-title">{{ list?.name ?? '…' }}</span>
      <div class="header-actions">
        <button class="keep-checked-btn" :class="{ 'is-active': keepCheckedMode }" @click="keepCheckedMode = !keepCheckedMode" aria-label="チェックしたものを消さない">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 11 12 14 22 4"></polyline>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
        </button>
        <button class="fav-list-btn" @click="showFavSheet = true" aria-label="よく使うもの">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
        <button class="share-btn" @click="share" :disabled="!list" aria-label="シェア">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
      </div>
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
        <button v-if="checkedCount > 0" class="checked-toggle" @click="showChecked = !showChecked">
          <div class="ct-rule" />
          <span class="ct-label">
            購入済み {{ checkedCount }}件
            <svg class="ct-chevron" :class="{ 'ct-chevron--open': showChecked }"
              width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <div class="ct-rule" />
        </button>

        <div v-for="group in groupedItems" :key="group.category" class="cat-section">
          <div class="cat-header">
            <span class="cat-label">{{ group.category }}</span>
            <div class="cat-rule" />
            <button
              v-if="group.category === 'その他'"
              class="recat-btn"
              :disabled="recategorizing"
              @click.stop="recategorizeOthers"
              @pointerdown.stop @pointerup.stop @pointermove.stop
            >
              <span v-if="recategorizing" class="recat-spinner" />
              <span v-else class="recat-icon">✦</span>
              <span class="recat-label">{{ recategorizing ? '分類中…' : '再分類' }}</span>
            </button>
          </div>
          <TransitionGroup name="item" tag="div" class="item-group">
            <div
              v-for="item in group.items"
              :key="item.id"
              class="item"
              :class="{ 'item--done': item.checked }"
              @click="handleItemClick(item)"
              @pointerdown="onPointerDown(item, $event)"
              @pointermove="onPointerMove($event)"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
            >
              <div class="checkbox" :class="{ 'is-checked': item.checked }">
                <svg v-if="item.checked" width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1 4.5L4 7.5L10 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div class="item-body">
                <span class="item-name" :class="{ 'is-done': item.checked }">{{ item.name }}</span>
                <span v-if="item.note" class="item-note">{{ item.note }}</span>
                <span v-if="item.isCategorizing" class="item-categorizing">
                  <span class="recat-spinner" />
                  分類中...
                </span>
                <span v-if="item.attachment_count > 0" class="item-attachment-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                  {{ item.attachment_count }}
                </span>
              </div>

              <!-- quantity controls -->
              <div v-if="isNumericQty(item)" class="qty-ctrl"
                @click.stop @pointerdown.stop @pointerup.stop @pointermove.stop>
                <button class="qty-btn" @click="decrementQty(item)">−</button>
                <span class="qty-val">{{ item.quantity }}</span>
                <button class="qty-btn" @click="incrementQty(item)">＋</button>
              </div>
              <span v-else-if="item.quantity" class="item-qty">{{ item.quantity }}</span>

              <!-- favorite button -->
              <button class="fav-btn" :class="{ 'is-fav': isFavorite(item) }"
                @click.stop="toggleFavorite(item)"
                @pointerdown.stop @pointerup.stop @pointermove.stop>
                <svg width="15" height="15" viewBox="0 0 24 24"
                  :fill="isFavorite(item) ? 'currentColor' : 'none'"
                  stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </button>
            </div>
          </TransitionGroup>
        </div>
      </template>
    </main>

    <footer class="footer">
      <div v-if="showSuggestions" class="suggest-backdrop" @click="blurInput" @touchstart.passive="blurInput"></div>
      <Transition name="suggest">
        <div v-if="showSuggestions" class="suggest-panel">
          <div v-for="s in filteredSuggestions" :key="s.name" class="suggest-item" @click="addFromSuggestion(s)">
            <span class="suggest-name">{{ s.name }}</span>
            <span class="suggest-cat">{{ s.category }}</span>
          </div>
        </div>
      </Transition>
      <div class="input-row">
        <input type="file" ref="fileInput" @change="onFileSelected" accept="image/*,application/pdf" style="display: none;" />
        <button class="upload-btn" @click="triggerUpload" :disabled="isUploading" aria-label="画像/PDFから追加">
          <span v-if="isUploading" class="upload-spinner" />
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
        <input
          ref="addInput"
          v-model="newItem"
          class="add-input"
          placeholder="アイテムを追加…"
          maxlength="100"
          @focus="inputFocused = true"
          @blur="onInputBlur"
          @keydown.enter="quickAdd"
        />
        <button
          class="add-btn"
          :class="{ 'add-btn--disabled': !newItem.trim() }"
          @click="quickAdd"
          aria-label="追加"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 15.5V2.5M3 8.5l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </footer>

    <!-- Edit sheet -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="editItem" class="overlay" @click.self="closeEdit">
          <div class="sheet">
            <div class="sheet-handle" />

            <div class="field-group">
              <label class="field-label">名前</label>
              <input v-model="editForm.name" class="sheet-input" maxlength="100" />
            </div>

            <div class="field-group">
              <label class="field-label">カテゴリ</label>
              <div class="pills">
                <button
                  v-for="cat in CATEGORIES"
                  :key="cat"
                  class="pill"
                  :class="{ 'pill--active': editForm.category === cat }"
                  @click="editForm.category = cat"
                >{{ cat }}</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">数量</label>
              <input
                v-model="editForm.quantity"
                class="sheet-input"
                placeholder="なし"
                maxlength="10"
              />
            </div>

            <div class="field-group">
              <label class="field-label">メモ</label>
              <textarea
                v-model="editForm.note"
                class="sheet-textarea"
                placeholder="補足・メモ…"
                maxlength="200"
                rows="2"
              />
            </div>

            <div class="field-group">
              <label class="field-label">添付ファイル</label>
              <div v-if="loadingAttachments" class="spinner-small" style="margin-bottom: 8px;"></div>
              <div class="attachments-list" v-else>
                <div v-for="att in attachments" :key="att.id" class="attachment-item">
                  <a :href="api.getAttachmentUrl(att.id)" target="_blank" class="attachment-link">
                    <svg v-if="att.file_type.startsWith('image/')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    <span>{{ att.file_name }}</span>
                  </a>
                  <button class="attachment-del-btn" @click="deleteAttachment(att.id)" aria-label="削除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <button class="add-attachment-btn" @click="triggerUploadAttachment" :disabled="isUploadingAttachment">
                  <span v-if="isUploadingAttachment" class="upload-spinner" style="width: 14px; height: 14px;" />
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  ファイルを追加
                </button>
                <input type="file" ref="uploadAttachmentInput" @change="onAttachmentSelected" accept="image/*,application/pdf" style="display: none;" />
              </div>
            </div>

            <button class="sheet-btn" @click="saveEdit">保存する</button>
            <button class="sheet-btn sheet-btn--danger" @click="confirmDeleteFromEdit">削除する</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="showShare" class="overlay" @click.self="showShare = false">
          <div class="sheet">
            <div class="sheet-handle" />
            <h2 class="sheet-title">リストを共有</h2>
            
            <div class="share-info">
              <p class="share-desc">以下の共有コードを他の人に教えるか、招待リンクを送ってください。</p>
              <div class="share-code-box" @click="copyShareCode">
                <span class="share-code-text">{{ list?.share_code }}</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </div>
            </div>

            <button class="sheet-btn" @click="copyShareLink">招待リンクをコピーする</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Favorites sheet -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="showFavSheet" class="overlay" @click.self="showFavSheet = false">
          <div class="sheet">
            <div class="sheet-handle" />
            <h2 class="sheet-title">よく使うもの</h2>
            <div class="fav-list-container">
              <div v-if="favorites.length === 0" class="fav-empty">
                よく使うものがありません。<br>アイテム横の星マークをタップして追加できます。
              </div>
              <div v-else class="fav-grid">
                <div v-for="fav in favorites" :key="fav.id" class="fav-grid-item" @click="addFromFavorite(fav)">
                  <span class="fav-grid-name">{{ fav.name }}</span>
                  <button class="fav-grid-del" @click.stop="toggleFavorite(fav)" aria-label="お気に入りから削除">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <button class="sheet-btn" @click="showFavSheet = false">閉じる</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toast" class="toast">{{ toast }}</div>
      </Transition>
    </Teleport>

    <!-- Upload Loading Overlay -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="isUploading" class="overlay upload-overlay">
          <div class="upload-loading-box">
            <div class="spinner-large" />
            <p class="upload-loading-text">AIが画像を解析中...<br><span>(数十秒かかる場合があります)</span></p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../composables/useApi.js'
import { getWebApp } from '../composables/useTelegram.js'
import { CATEGORIES, SUGGESTIONS } from '../data/suggestions.js'

const route = useRoute()
const router = useRouter()
const listId = route.params.id

const list = ref(null)
const items = ref([])
const favorites = ref([])
const loading = ref(true)
const error = ref(null)
const newItem = ref('')
const toast = ref('')
const inputFocused = ref(false)
const editItem = ref(null)
const editForm = reactive({ name: '', category: 'その他', quantity: '', note: '' })
const showChecked = ref(false)
const recategorizing = ref(false)
const showShare = ref(false)
const showFavSheet = ref(false)
const isUploading = ref(false)
const fileInput = ref(null)
const addInput = ref(null)

const attachments = ref([])
const loadingAttachments = ref(false)
const isUploadingAttachment = ref(false)
const uploadAttachmentInput = ref(null)

const keepCheckedMode = ref(localStorage.getItem('keepCheckedMode') === 'true')
watch(keepCheckedMode, (newVal) => {
  localStorage.setItem('keepCheckedMode', newVal)
  if (newVal) {
    showToast('チェック維持モードON')
  }
})

let pollTimer = null
let longPressTimer = null
let longPressTriggered = false
let pressStart = { x: 0, y: 0 }

const CATEGORY_ORDER = ['野菜・果物', '肉・魚', '乳製品・卵', '冷凍食品', 'パン・穀物', '飲み物', '調味料', '日用品', 'その他']

const checkedCount = computed(() => items.value.filter(i => i.checked).length)

const groupedItems = computed(() => {
  const byCategory = {}
  for (const item of items.value) {
    if (!keepCheckedMode.value && !showChecked.value && item.checked) continue
    const cat = item.category || 'その他'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(item)
  }
  const known = CATEGORY_ORDER.filter(cat => byCategory[cat]?.length)
  const unknown = Object.keys(byCategory).filter(cat => !CATEGORY_ORDER.includes(cat))
  return [...known, ...unknown].map(cat => ({
    category: cat,
    items: [...byCategory[cat]].sort((a, b) => {
      if (!keepCheckedMode.value && a.checked !== b.checked) return a.checked ? 1 : -1
      return (a.created_at || 0) - (b.created_at || 0)
    }),
  }))
})

const favoriteNames = computed(() => new Set(favorites.value.map(f => f.name)))

const filteredSuggestions = computed(() => {
  const q = newItem.value.trim()
  if (!q) return []
  return SUGGESTIONS.filter(s => s.name.includes(q)).slice(0, 6)
})

const showSuggestions = computed(() => inputFocused.value && !!newItem.value.trim() && filteredSuggestions.value.length > 0)

// ── Long press ───────────────────────────────────────────────
function onPointerDown(item, e) {
  longPressTriggered = false
  pressStart = { x: e.clientX, y: e.clientY }
  longPressTimer = setTimeout(() => {
    longPressTriggered = true
    openEdit(item)
    getWebApp()?.HapticFeedback?.impactOccurred('medium')
  }, 500)
}

function onPointerMove(e) {
  const dx = e.clientX - pressStart.x
  const dy = e.clientY - pressStart.y
  if (Math.sqrt(dx * dx + dy * dy) > 6) clearTimeout(longPressTimer)
}

function onPointerUp() { clearTimeout(longPressTimer) }

function handleItemClick(item) {
  if (longPressTriggered) { longPressTriggered = false; return }
  toggleItem(item)
}

// ── Edit sheet ───────────────────────────────────────────────
async function openEdit(item) {
  editItem.value = item
  editForm.name = item.name
  editForm.category = item.category || 'その他'
  editForm.quantity = item.quantity ?? ''
  editForm.note = item.note || ''
  
  attachments.value = []
  loadingAttachments.value = true
  try {
    attachments.value = await api.getItemAttachments(item.id)
  } catch (e) {
    showToast('添付ファイルの取得に失敗しました')
  } finally {
    loadingAttachments.value = false
  }
}

function closeEdit() { editItem.value = null }

async function saveEdit() {
  const item = editItem.value
  if (!item || !editForm.name.trim()) return
  const updates = {
    name: editForm.name.trim(),
    category: editForm.category,
    quantity: editForm.quantity || null,
    note: editForm.note.trim(),
  }
  Object.assign(item, updates)
  closeEdit()
  try {
    const res = await api.updateItem(item.id, updates)
    if (res && res.category) {
      item.category = res.category
    }
  } catch (e) {
    showToast(e.message)
  }
}

async function confirmDeleteFromEdit() {
  const item = editItem.value
  closeEdit()
  if (item) await deleteItem(item)
}

// ── Favorites ────────────────────────────────────────────────
function isFavorite(item) {
  return favoriteNames.value.has(item.name)
}

async function toggleFavorite(item) {
  const existing = favorites.value.find(f => f.name === item.name)
  if (existing) {
    favorites.value = favorites.value.filter(f => f.id !== existing.id)
    getWebApp()?.HapticFeedback?.impactOccurred('light')
    try {
      await api.removeFavorite(existing.id)
    } catch (e) {
      favorites.value.push(existing)
      showToast(e.message)
    }
  } else {
    const tmp = { id: '_fav_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7), name: item.name, category: item.category || 'その他' }
    favorites.value.push(tmp)
    getWebApp()?.HapticFeedback?.impactOccurred('light')
    try {
      const created = await api.addFavorite(item.name, item.category || 'その他')
      const idx = favorites.value.findIndex(f => f.id === tmp.id)
      if (idx !== -1) favorites.value[idx] = created
    } catch (e) {
      favorites.value = favorites.value.filter(f => f.id !== tmp.id)
      showToast(e.message)
    }
  }
}

// ── Suggestions / Favorites panel ───────────────────────────
function onInputBlur() {
  setTimeout(() => { inputFocused.value = false }, 300)
}

function blurInput() {
  addInput.value?.blur()
  inputFocused.value = false
}

async function addFromSuggestion(s) {
  newItem.value = ''
  inputFocused.value = false
  await addItemFull(s.name, s.category, null, '')
}

async function addFromFavorite(fav) {
  newItem.value = ''
  inputFocused.value = false
  await addItemFull(fav.name, fav.category, null, '')
}

async function recategorizeOthers() {
  if (recategorizing.value) return
  recategorizing.value = true
  getWebApp()?.HapticFeedback?.impactOccurred('light')
  try {
    const { updated } = await api.recategorize(listId)
    await loadItems()
    showToast(updated > 0 ? `${updated}件を再分類しました` : '対象なし')
  } catch (e) {
    showToast(e.message)
  } finally {
    recategorizing.value = false
  }
}

async function quickAdd() {
  const name = newItem.value.trim()
  if (!name) return
  newItem.value = ''
  await addItemFull(name, null, null, '')
}

async function addItemFull(name, category, quantity, note) {
  const tmpId = '_tmp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
  const tmp = {
    id: tmpId,
    list_id: listId,
    name,
    checked: false,
    category: category || 'その他',
    quantity: quantity ?? null,
    unit: '',
    note: note || '',
    created_at: Date.now(),
    isCategorizing: !category,
  }
  items.value.push(tmp)
  getWebApp()?.HapticFeedback?.impactOccurred('light')
  try {
    const created = await api.addItem(listId, { name, category, quantity, unit: '', note })
    const idx = items.value.findIndex(i => i.id === tmp.id)
    if (idx !== -1) items.value[idx] = created
  } catch (e) {
    items.value = items.value.filter(i => i.id !== tmp.id)
    showToast(e.message)
    newItem.value = name
  }
}

// ── Upload ───────────────────────────────────────────────────
function triggerUpload() {
  if (isUploading.value) return
  fileInput.value?.click()
}

async function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  
  isUploading.value = true
  getWebApp()?.HapticFeedback?.impactOccurred('light')
  
  try {
    const res = await api.uploadFile(listId, file)
    await loadItems()
    if (res.items && res.items.length > 0) {
      showToast(`${res.items.length}件のアイテムを追加しました`)
      getWebApp()?.HapticFeedback?.notificationOccurred('success')
    } else {
      showToast('リストが見つかりませんでした')
    }
  } catch (err) {
    showToast('アップロードに失敗しました: ' + err.message)
  } finally {
    isUploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

// ── Item Attachments ────────────────────────────────────────
function triggerUploadAttachment() {
  if (isUploadingAttachment.value) return
  uploadAttachmentInput.value?.click()
}

async function onAttachmentSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (!editItem.value) return
  
  isUploadingAttachment.value = true
  getWebApp()?.HapticFeedback?.impactOccurred('light')
  
  try {
    const res = await api.uploadItemAttachment(editItem.value.id, file)
    attachments.value.push(res)
    editItem.value.attachment_count = (editItem.value.attachment_count || 0) + 1
    getWebApp()?.HapticFeedback?.notificationOccurred('success')
  } catch (err) {
    showToast('ファイルの追加に失敗しました')
  } finally {
    isUploadingAttachment.value = false
    if (uploadAttachmentInput.value) uploadAttachmentInput.value.value = ''
  }
}

async function deleteAttachment(id) {
  if (!confirm('本当に削除しますか？')) return
  try {
    await api.deleteAttachment(id)
    attachments.value = attachments.value.filter(a => a.id !== id)
    if (editItem.value) {
        editItem.value.attachment_count = Math.max(0, (editItem.value.attachment_count || 1) - 1)
    }
  } catch (err) {
    showToast('削除に失敗しました')
  }
}

// ── Quantity controls ────────────────────────────────────────
function isNumericQty(item) {
  return item.quantity !== null && item.quantity !== '' && !isNaN(Number(item.quantity))
}

async function incrementQty(item) {
  const newQty = String(Number(item.quantity) + 1)
  const prev = item.quantity
  item.quantity = newQty
  getWebApp()?.HapticFeedback?.impactOccurred('light')
  try {
    await api.updateItem(item.id, { quantity: newQty })
  } catch (e) {
    item.quantity = prev
    showToast(e.message)
  }
}

async function decrementQty(item) {
  const current = Number(item.quantity)
  if (current <= 1) return
  const newQty = String(current - 1)
  const prev = item.quantity
  item.quantity = newQty
  getWebApp()?.HapticFeedback?.impactOccurred('light')
  try {
    await api.updateItem(item.id, { quantity: newQty })
  } catch (e) {
    item.quantity = prev
    showToast(e.message)
  }
}

// ── Toggle / Delete ──────────────────────────────────────────
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

async function deleteItem(item) {
  items.value = items.value.filter(i => i.id !== item.id)
  getWebApp()?.HapticFeedback?.impactOccurred('medium')
  try {
    await api.deleteItem(item.id)
  } catch {
    items.value.push(item)
    showToast('削除できませんでした')
  }
}

// ── Load / Share ─────────────────────────────────────────────
async function loadList() {
  try { list.value = await api.getList(listId) } catch (e) { error.value = e.message }
}

async function loadItems() {
  try {
    const fetched = await api.getItems(listId)
    const tmps = items.value.filter(i => String(i.id).startsWith('_tmp_'))
    items.value = [...fetched, ...tmps]
    error.value = null
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function loadFavorites() {
  try { favorites.value = await api.getFavorites() } catch { /* ignore */ }
}

function share() {
  if (!list.value?.share_code) return
  showShare.value = true
  getWebApp()?.HapticFeedback?.impactOccurred('light')
}

async function copyShareLink() {
  const code = list.value?.share_code
  if (!code) return
  const botUsername = import.meta.env.VITE_BOT_USERNAME
  const url = botUsername ? `https://t.me/${botUsername}?startapp=${code}` : `シェアコード: ${code}`
  try {
    await navigator.clipboard.writeText(url)
    showToast('リンクをコピーしました')
  } catch {
    showToast('コピーできませんでした')
  }
  showShare.value = false
  getWebApp()?.HapticFeedback?.notificationOccurred('success')
}

async function copyShareCode() {
  const code = list.value?.share_code
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    showToast('コードをコピーしました')
  } catch {
    showToast('コピーできませんでした')
  }
  showShare.value = false
  getWebApp()?.HapticFeedback?.notificationOccurred('success')
}

function goBack() { router.push('/') }

function showToast(msg, ms = 2500) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, ms)
}

function startPolling() {
  if (!pollTimer) {
    pollTimer = setInterval(loadItems, 12000)
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    loadItems()
    startPolling()
  } else {
    stopPolling()
  }
}

onMounted(async () => {
  await Promise.all([loadList(), loadItems(), loadFavorites()])
  startPolling()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', onVisibilityChange)
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 4px;
}

.keep-checked-btn {
  padding: 8px;
  color: color-mix(in srgb, var(--tg-hint) 40%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s, color 0.2s;
}

.keep-checked-btn.is-active {
  color: var(--tg-button);
}

.keep-checked-btn:active {
  transform: scale(0.9);
  background: color-mix(in srgb, var(--tg-hint) 10%, transparent);
}

.fav-list-btn {
  padding: 8px;
  color: #ff9500;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.fav-list-btn:active {
  transform: scale(0.9);
  background: color-mix(in srgb, #ff9500 20%, transparent);
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

.empty-art { color: var(--tg-hint); opacity: 0.3; margin-bottom: 10px; }
.state-title { margin: 0; font-size: 15px; font-weight: 500; }
.state-sub { margin: 0; font-size: 13px; color: var(--tg-hint); line-height: 1.6; }
.state-msg { margin: 0; font-size: 14px; }
.error-msg { color: #e05050; }

.spinner {
  width: 26px;
  height: 26px;
  border: 2px solid color-mix(in srgb, var(--tg-hint) 28%, transparent);
  border-top-color: var(--tg-hint);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ── Category sections ── */
.cat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px 8px;
}

.cat-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--tg-hint);
  white-space: nowrap;
  flex-shrink: 0;
}

.cat-rule {
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--tg-hint) 14%, transparent);
}

.recat-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tg-hint) 8%, transparent);
  color: var(--tg-text);
  font-size: 11px;
  transition: opacity 0.1s;
}
.recat-btn:active { opacity: 0.6; }
.recat-btn:disabled { opacity: 0.4; }

.recat-icon { font-size: 10px; opacity: 0.7; }
.recat-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid color-mix(in srgb, var(--tg-text) 20%, transparent);
  border-top-color: var(--tg-text);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

/* ── Checked toggle ── */
.checked-toggle {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 16px;
  gap: 12px;
}

.ct-rule {
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--tg-hint) 10%, transparent);
}

.ct-label {
  font-size: 12px;
  color: var(--tg-hint);
  display: flex;
  align-items: center;
  gap: 6px;
}

.ct-chevron {
  transition: transform 0.2s;
  opacity: 0.6;
}
.ct-chevron--open { transform: rotate(180deg); }

/* ── Items ── */
.item-group { position: relative; }

.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px 11px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-hint) 8%, transparent);
  cursor: pointer;
  user-select: none;
  transition: background 0.1s, opacity 0.35s;
}

.item:active { background: color-mix(in srgb, var(--tg-hint) 7%, transparent); }
.item--done { opacity: 0.38; }

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

.item-body {
  flex: 1;
  min-width: 0;
}

.item-name { display: block; font-size: 16px; line-height: 1.4; }
.item-name.is-done { text-decoration: line-through; }

.item-note {
  display: block;
  font-size: 13px;
  color: var(--tg-hint);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-categorizing {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: var(--tg-hint);
  margin-top: 4px;
  gap: 4px;
}
.item-categorizing .recat-spinner {
  width: 10px;
  height: 10px;
  border-width: 1.5px;
  margin-right: 0;
}

.item-qty {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--tg-hint);
  white-space: nowrap;
}

/* ── Quantity controls ── */
.qty-ctrl {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.qty-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--tg-secondary-bg);
  color: var(--tg-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
  transition: background 0.1s, transform 0.1s;
}

.qty-btn:active {
  background: color-mix(in srgb, var(--tg-hint) 22%, var(--tg-secondary-bg));
  transform: scale(0.9);
}

.qty-val {
  font-size: 13px;
  color: var(--tg-hint);
  min-width: 24px;
  text-align: center;
  white-space: nowrap;
}

/* ── Favorites ── */
.fav-btn {
  padding: 8px;
  color: color-mix(in srgb, var(--tg-hint) 40%, transparent);
  transition: color 0.2s, transform 0.2s;
  flex-shrink: 0;
}

.fav-btn.is-fav {
  color: #ff9500;
}

.fav-btn:active { transform: scale(0.85); }

/* ── Item transitions ── */
.item-move { transition: transform 0.38s cubic-bezier(0.22, 0.61, 0.36, 1); }
.item-enter-active { transition: opacity 0.2s, transform 0.2s; }
.item-leave-active { transition: opacity 0.15s; position: absolute; width: 100%; }
.item-enter-from { opacity: 0; transform: translateX(-6px); }
.item-leave-to { opacity: 0; }

/* ── Checked toggle ── */
.checked-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 16px 16px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--tg-hint);
  margin-top: 4px;
}

.checked-toggle:active { opacity: 0.6; }

.ct-rule {
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--tg-hint) 14%, transparent);
}

.ct-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  white-space: nowrap;
  flex-shrink: 0;
}

.ct-chevron {
  transition: transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.ct-chevron--open {
  transform: rotate(180deg);
}

/* ── Footer ── */
.suggest-backdrop {
  position: fixed;
  inset: 0;
  z-index: 5;
}

.footer {
  position: relative;
  flex-shrink: 0;
  background: var(--tg-bg);
  border-top: 1px solid color-mix(in srgb, var(--tg-hint) 11%, transparent);
  padding: 10px 12px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 44px);
  z-index: 10;
}

/* ── Suggest / Favorites panel ── */
.suggest-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--tg-bg);
  border-top: 1px solid color-mix(in srgb, var(--tg-hint) 11%, transparent);
  max-height: 35dvh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 14px 14px 0 0;
  box-shadow: 0 -4px 20px color-mix(in srgb, var(--tg-text) 6%, transparent);
}

.suggest-section-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--tg-hint);
  padding: 11px 16px 6px;
}

.suggest-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-hint) 8%, transparent);
  cursor: pointer;
  user-select: none;
}

.suggest-item:last-child { border-bottom: none; }
.suggest-item:active { background: color-mix(in srgb, var(--tg-hint) 7%, transparent); }
.suggest-name { font-size: 15px; flex: 1; }

.suggest-cat {
  font-size: 11px;
  color: var(--tg-hint);
  padding: 3px 8px;
  background: color-mix(in srgb, var(--tg-hint) 10%, transparent);
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.suggest-enter-active, .suggest-leave-active { transition: opacity 0.15s, transform 0.15s; }
.suggest-enter-from, .suggest-leave-to { opacity: 0; transform: translateY(4px); }

/* ── Input row ── */
.input-row { display: flex; gap: 8px; align-items: center; }

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

.add-input:focus { background: color-mix(in srgb, var(--tg-secondary-bg) 80%, var(--tg-hint)); }
.add-input::placeholder { color: var(--tg-hint); }

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

.add-btn--disabled { opacity: 0.38; }
.add-btn:not(.add-btn--disabled):active { opacity: 0.8; transform: scale(0.91); }

/* ── Sheets / Overlays ── */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}

.upload-overlay {
  align-items: center;
  justify-content: center;
  z-index: 150;
}

.upload-loading-box {
  background: var(--tg-bg);
  padding: 32px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.15);
}

.spinner-large {
  width: 40px;
  height: 40px;
  border: 3px solid color-mix(in srgb, var(--tg-button) 20%, transparent);
  border-top-color: var(--tg-button);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.upload-loading-text {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  text-align: center;
  line-height: 1.5;
}

.upload-loading-text span {
  font-size: 12px;
  font-weight: normal;
  color: var(--tg-hint);
}

.sheet { z-index: 100;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.sheet {
  background: var(--tg-bg);
  width: 100%;
  max-height: 90vh;
  border-radius: 20px 20px 0 0;
  padding: 16px 20px 32px;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.12);
  display: flex;
  flex-direction: column;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
  animation: sheetUp 0.32s cubic-bezier(0.32, 0.72, 0, 1) both;
}

/* ── Favorites Sheet ── */
.fav-list-container {
  max-height: 50dvh;
  overflow-y: auto;
  margin: 16px 0;
  padding: 0 4px;
}

.fav-empty {
  text-align: center;
  color: var(--tg-hint);
  font-size: 14px;
  padding: 24px 0;
  line-height: 1.6;
}

.fav-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fav-grid-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--tg-secondary-bg);
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--tg-hint) 10%, transparent);
  transition: transform 0.1s;
}

.fav-grid-item:active {
  transform: scale(0.97);
}

.fav-grid-name {
  font-weight: 500;
  font-size: 15px;
  color: var(--tg-text);
}

.fav-grid-del {
  padding: 8px;
  margin: -8px;
  color: var(--tg-hint);
  transition: color 0.2s;
}

.fav-grid-del:active {
  color: #ff3b30;
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

.field-group { margin-bottom: 18px; }

.field-label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--tg-hint);
  margin-bottom: 8px;
}

.sheet-input {
  display: block;
  width: 100%;
  background: var(--tg-secondary-bg);
  border: none;
  border-radius: 12px;
  padding: 13px 16px;
  font-size: 16px;
  color: var(--tg-text);
  outline: none;
}

.sheet-textarea {
  display: block;
  width: 100%;
  background: var(--tg-secondary-bg);
  border: none;
  border-radius: 12px;
  padding: 13px 16px;
  font-size: 15px;
  color: var(--tg-text);
  outline: none;
  resize: none;
  min-height: 64px;
}

.sheet-textarea::placeholder { color: var(--tg-hint); }
.sheet-input::placeholder { color: var(--tg-hint); }

.pills {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.pills::-webkit-scrollbar { display: none; }

.pill {
  padding: 7px 13px;
  border-radius: 20px;
  font-size: 13px;
  background: var(--tg-secondary-bg);
  color: var(--tg-text);
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}

.pill--active { background: var(--tg-button); color: var(--tg-button-text); }

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
  margin-bottom: 10px;
}

.sheet-btn:active { opacity: 0.78; }
.sheet-btn--danger { background: color-mix(in srgb, #e05050 12%, transparent); color: #e05050; }

.overlay-enter-active, .overlay-leave-active { transition: opacity 0.25s ease; }
.overlay-enter-from, .overlay-leave-to { opacity: 0; }

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

.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* 再分類ボタン */
.recat-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 0 4px;
  min-height: 44px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--tg-theme-hint-color, #aaa);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  white-space: nowrap;
  transition: opacity 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.recat-btn:active:not(:disabled) { opacity: 0.5; }
.recat-btn:disabled { cursor: default; }
.recat-icon { font-size: 10px; line-height: 1; }
.recat-label { font-size: 11px; font-weight: 500; }
.recat-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--tg-theme-hint-color, #aaa);
  border-top-color: transparent;
  border-radius: 50%;
  animation: recat-spin 0.6s linear infinite;
}
@keyframes recat-spin { to { transform: rotate(360deg); } }

/* ── Share Sheet ── */
.share-info {
  margin-bottom: 24px;
}
.share-desc {
  font-size: 14px;
  color: var(--tg-hint);
  margin-bottom: 12px;
  line-height: 1.5;
}
.share-code-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--tg-secondary-bg);
  padding: 16px 20px;
  border-radius: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.share-code-box:active {
  opacity: 0.7;
}
.share-code-text {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.1em;
  font-family: monospace;
}
.item-attachment-icon {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--tg-hint);
  margin-left: 6px;
  vertical-align: middle;
}
.attachments-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.attachment-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  background: color-mix(in srgb, var(--tg-bg) 95%, var(--tg-text));
  border-radius: 6px;
}
.attachment-link {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--tg-link);
  text-decoration: none;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attachment-del-btn {
  color: var(--tg-hint);
  padding: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
}
.add-attachment-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 1px dashed color-mix(in srgb, var(--tg-hint) 50%, transparent);
  border-radius: 6px;
  color: var(--tg-text);
  font-size: 14px;
  background: transparent;
  cursor: pointer;
}
.add-attachment-btn:disabled {
  opacity: 0.5;
}
</style>
