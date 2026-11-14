<template>
  <div class="list-view">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="戻る">
        <svg width="9" height="16" viewBox="0 0 9 16" fill="none">
          <path d="M8 1L1 8L8 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <span class="header-title" @click="openRename">{{ list?.name ?? '…' }}</span>
      <div class="header-actions">
        <button class="keep-checked-btn" :class="{ 'is-active': keepCheckedMode }" @click="keepCheckedMode = !keepCheckedMode" aria-label="チェックしたものを消さない">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 11 12 14 22 4"></polyline>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
        </button>
        <button v-if="!isAgent" class="fav-list-btn" @click="showFavSheet = true" aria-label="よく使うもの">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        </button>
        <button v-if="!isAgent" class="share-btn" @click="share" :disabled="!list" aria-label="シェア">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
        <button v-if="!isAgent" class="menu-btn" @click="showMenu = true" :disabled="!list" aria-label="メニュー">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="5" r="1.5"/>
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="12" cy="19" r="1.5"/>
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
        <p class="state-sub">{{ canWrite ? '下の入力欄からアイテムを追加できます' : 'このリストは空です' }}</p>
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
              v-if="!isAgent && group.category === 'その他'"
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
              :class="{ 'item--done': item.checked, 'item--celebrating': celebratingItems.has(item.id) }"
              @click="openEdit(item)"
            >
              <button class="checkbox-tap" type="button" :disabled="!canWrite"
                :aria-pressed="Boolean(item.checked)"
                :aria-label="item.checked ? `${item.name}を未購入に戻す` : `${item.name}を購入済みにする`"
                @click.stop="toggleItem(item)">
                <div class="checkbox" :class="{ 'is-checked': item.checked, 'is-celebrating': celebratingItems.has(item.id) }">
                  <svg v-if="item.checked" width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4.5L4 7.5L10 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
              </button>
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
              <div v-if="canWrite && isNumericQty(item)" class="qty-ctrl" @click.stop>
                <button class="qty-btn" @click="decrementQty(item)">−</button>
                <span class="qty-val">{{ item.quantity }}</span>
                <button class="qty-btn" @click="incrementQty(item)">＋</button>
              </div>
              <span v-else-if="item.quantity" class="item-qty">{{ item.quantity }}</span>

              <!-- favorite button -->
              <button v-if="!isAgent" class="fav-btn" :class="{ 'is-fav': isFavorite(item) }"
                @click.stop="toggleFavorite(item)">
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

    <footer v-if="canWrite" class="footer">
      <div v-if="showSuggestions" class="suggest-backdrop" @click="blurInput" @touchstart.passive="blurInput"></div>
      <Transition name="suggest">
        <div v-if="showSuggestions" class="suggest-panel">
          <div v-for="s in filteredSuggestions" :key="s.name" class="suggest-item"
            @mousedown.prevent
            @click="addFromSuggestion(s)"
            @touchstart="onSuggestTouchStart"
            @touchmove="onSuggestTouchMove"
            @touchend="onSuggestTouchEnd(s, $event)"
          >
            <span class="suggest-name">{{ s.name }}</span>
            <span class="suggest-cat">{{ s.category }}</span>
          </div>
        </div>
      </Transition>
      <button class="bulk-open-btn" @click="openBulkAdd()">テキストからまとめて追加</button>
      <div class="input-row">
        <input type="file" ref="fileInput" @change="onFileSelected" accept="image/*,application/pdf" style="display: none;" />
        <button v-if="!isAgent" class="upload-btn" @click="triggerUpload" :disabled="isUploading" aria-label="画像/PDFから追加">
          <span v-if="isUploading" class="upload-spinner" />
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </button>
        <input
          ref="addInput"
          :value="newItem"
          @input="newItem = $event.target.value"
          @paste="onAddPaste"
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

    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="showBulkAdd" class="overlay" @click.self="closeBulkAdd">
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="bulk-title">
            <div class="sheet-handle" />
            <label id="bulk-title" class="field-label" for="bulk-text">テキストからまとめて追加</label>
            <p class="bulk-help">1行につき1件追加します。見出しや不要な行は削除してください。</p>
            <textarea id="bulk-text" ref="bulkInput" v-model="bulkText" class="sheet-input bulk-text"
              rows="7" placeholder="ステーキ肉&#10;ポテト&#10;蒟蒻ゼリー" :disabled="bulkAdding" />
            <p v-if="bulkHasLongName" class="error-msg" role="alert">1件につき100文字以内にしてください。</p>
            <p v-if="bulkError" class="error-msg" role="alert">{{ bulkError }}</p>
            <button class="sheet-btn" :disabled="bulkAdding || !bulkNames.length || bulkHasLongName" @click="submitBulkAdd">
              {{ bulkAdding ? '追加中…' : `${bulkNames.length}件を追加する` }}
            </button>
            <button class="bulk-open-btn" :disabled="bulkAdding" @click="closeBulkAdd">閉じる</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Rename sheet -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="showRename" class="overlay" @click.self="closeRename">
          <div class="sheet">
            <div class="sheet-handle" />

            <div class="field-group">
              <label class="field-label">リスト名</label>
              <input
                ref="renameInput"
                v-model="renameName"
                class="sheet-input"
                maxlength="50"
                @keydown.enter="saveRename"
              />
            </div>

            <button class="sheet-btn" @click="saveRename">保存する</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- List menu sheet -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="showMenu" class="overlay" @click.self="showMenu = false">
          <div class="sheet">
            <div class="sheet-handle" />

            <button class="sheet-btn" @click="showMenu = false; openRename()">名前を変更</button>
            <button class="sheet-btn" @click="archiveCurrentList">アーカイブする</button>
            <button
              v-if="isOwner"
              class="sheet-btn sheet-btn--danger"
              @click="deleteCurrentList"
            >削除する</button>
            <button
              v-else
              class="sheet-btn sheet-btn--danger"
              @click="leaveCurrentList"
            >リストから抜ける</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Edit sheet -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="editItem" class="overlay" @click.self="closeEdit">
          <div class="sheet">
            <div class="sheet-handle" />

            <div class="field-group">
              <label class="field-label">名前</label>
              <input :disabled="!canWrite" v-model="editForm.name" class="sheet-input" maxlength="100" />
            </div>

            <div class="field-group">
              <label class="field-label">カテゴリ</label>
              <div class="pills">
                <button
                  :disabled="!canWrite"
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
              <div class="qty-ctrl-sheet">
                <button class="qty-btn" :disabled="!canWrite" @click="decrementEditQty">−</button>
                <input
                  :disabled="!canWrite" v-model="editForm.quantity"
                  class="sheet-input qty-input"
                  placeholder="なし"
                  maxlength="10"
                />
                <button class="qty-btn" :disabled="!canWrite" @click="incrementEditQty">＋</button>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">メモ</label>
              <textarea
                :disabled="!canWrite" v-model="editForm.note"
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
                  <a href="#" @click.prevent="openPreview(att)" class="attachment-link">
                    <svg v-if="att.file_type.startsWith('image/')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    <span>{{ att.file_name }}</span>
                  </a>
                  <button v-if="!isAgent" class="attachment-del-btn" @click="deleteAttachment(att.id)" aria-label="削除">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <button v-if="!isAgent" class="add-attachment-btn" @click="triggerUploadAttachment" :disabled="isUploadingAttachment">
                  <span v-if="isUploadingAttachment" class="upload-spinner" style="width: 14px; height: 14px;" />
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  ファイルを追加
                </button>
                <input type="file" ref="uploadAttachmentInput" @change="onAttachmentSelected" accept="image/*,application/pdf" style="display: none;" />
              </div>
            </div>

            <button v-if="canWrite" class="sheet-btn" @click="saveEdit">保存する</button>
            <button v-if="!isAgent" class="sheet-btn sheet-btn--danger" @click="confirmDeleteFromEdit">削除する</button>
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

    <!-- Attachment Preview Overlay -->
    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="previewAttachment" class="overlay preview-overlay" @click.self="closePreview">
          <div class="preview-modal">
            <div class="preview-header">
              <h3 class="preview-title">{{ previewAttachment.file_name }}</h3>
              <div class="preview-actions">
                <a :href="api.getAttachmentUrl(previewAttachment.id)" target="_blank" class="preview-action-btn" title="別タブで開く">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                <button class="preview-action-btn" @click="closePreview" aria-label="閉じる">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div class="preview-content">
              <img 
                v-if="previewAttachment.file_type.startsWith('image/')" 
                :src="api.getAttachmentUrl(previewAttachment.id)" 
                class="preview-image" 
                alt="プレビュー画像"
              />
              <iframe 
                v-else-if="previewAttachment.file_type === 'application/pdf'" 
                :src="api.getAttachmentUrl(previewAttachment.id)" 
                class="preview-iframe"
                title="PDFプレビュー"
              ></iframe>
              <div v-else class="preview-unsupported">
                このファイル形式はプレビューできません。<br>右上のボタンから開いてください。
              </div>
            </div>
          </div>
        </div>
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
import { inject, ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../composables/useApi.js'
import { getWebApp, getMyUserId } from '../composables/useTelegram.js'
import { useListActions } from '../composables/useListActions.js'
import { CATEGORIES, SUGGESTIONS } from '../data/suggestions.js'

const currentUser = inject('currentUser', ref(null))
const isAgent = computed(() => currentUser.value?.provider === 'agent')
const canWrite = computed(() => !isAgent.value || currentUser.value.permission === 'items:write')
const route = useRoute()
const router = useRouter()
const listId = route.params.id
const listActions = useListActions()
const myUserId = getMyUserId()

const list = ref(null)
const items = ref([])
const favorites = ref([])
const loading = ref(true)
const error = ref(null)
const newItem = ref('')
const showBulkAdd = ref(false)
const bulkText = ref('')
const bulkInput = ref(null)
const bulkAdding = ref(false)
const bulkError = ref('')
const bulkNames = computed(() => parseBulkText(bulkText.value))
const bulkHasLongName = computed(() => bulkNames.value.some(name => name.length > 100))
const toast = ref('')
const inputFocused = ref(false)
const editItem = ref(null)
const editForm = reactive({ name: '', category: 'その他', quantity: '', note: '' })
const showRename = ref(false)
const renameName = ref('')
const renameInput = ref(null)
const showMenu = ref(false)
const isOwner = computed(() => list.value && myUserId != null && (list.value.created_by === myUserId || currentUser.value?.shared === true))
const showChecked = ref(false)
const celebratingItems = reactive(new Set())
const celebrationTimers = new Map()
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
const previewAttachment = ref(null)

function openPreview(att) {
  previewAttachment.value = att
}

function closePreview() {
  previewAttachment.value = null
}

const keepCheckedMode = ref(localStorage.getItem('keepCheckedMode') === 'true')
watch(keepCheckedMode, (newVal) => {
  localStorage.setItem('keepCheckedMode', newVal)
  if (newVal) {
    showToast('チェック維持モードON')
  }
})

let pollTimer = null

const CATEGORY_ORDER = ['野菜・果物', '肉・魚', '乳製品・卵', '冷凍食品', 'パン・穀物', '飲み物', '調味料', '日用品', 'その他']

const checkedCount = computed(() => items.value.filter(i => i.checked).length)

const groupedItems = computed(() => {
  const byCategory = {}
  for (const item of items.value) {
    if (!keepCheckedMode.value && !showChecked.value && item.checked && !celebratingItems.has(item.id)) continue
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

function toHiragana(str) {
  return str.replace(/[\u30a1-\u30f6]/g, match =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  )
}

const filteredSuggestions = computed(() => {
  const q = toHiragana(newItem.value.trim().toLowerCase())
  if (!q) return []
  return SUGGESTIONS.filter(s => toHiragana(s.name.toLowerCase()).includes(q)).slice(0, 6)
})

const showSuggestions = computed(() => inputFocused.value && !!newItem.value.trim() && filteredSuggestions.value.length > 0)

// ── Rename sheet ─────────────────────────────────────────────
function openRename() {
  if (isAgent.value) return
  if (!list.value) return
  renameName.value = list.value.name
  showRename.value = true
}

function closeRename() { showRename.value = false }

watch(showRename, async (open) => {
  if (open) {
    await nextTick()
    renameInput.value?.focus()
  }
})

async function saveRename() {
  const next = renameName.value.trim()
  if (!next || next === list.value.name) {
    closeRename()
    return
  }
  const prev = list.value.name
  list.value.name = next
  closeRename()
  try {
    await api.updateList(listId, next)
    getWebApp()?.HapticFeedback?.notificationOccurred('success')
  } catch (e) {
    list.value.name = prev
    showToast(e.message)
  }
}

// ── List menu ────────────────────────────────────────────────
async function archiveCurrentList() {
  showMenu.value = false
  try {
    if (await listActions.archive(listId)) router.push('/')
  } catch (e) {
    showToast(e.message)
  }
}

async function deleteCurrentList() {
  showMenu.value = false
  try {
    if (await listActions.delete(listId)) router.push('/')
  } catch (e) {
    showToast(e.message)
  }
}

async function leaveCurrentList() {
  showMenu.value = false
  try {
    if (await listActions.leave(listId)) router.push('/')
  } catch (e) {
    showToast(e.message)
  }
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

// --- Tap detection for suggest panel ---
let suggestTouchStartY = 0
let suggestTouchMoved = false

function onSuggestTouchStart(e) {
  suggestTouchStartY = e.touches[0].clientY
  suggestTouchMoved = false
}

function onSuggestTouchMove(e) {
  if (Math.abs(e.touches[0].clientY - suggestTouchStartY) > 10) {
    suggestTouchMoved = true
  }
}

function onSuggestTouchEnd(s, e) {
  if (!suggestTouchMoved) {
    e.preventDefault()
    addFromSuggestion(s)
  }
}

async function addFromSuggestion(s) {
  newItem.value = ''
  await addItemFull(s.name, s.category, null, '')
}

async function addFromFavorite(fav) {
  newItem.value = ''
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

function openBulkAdd(text = bulkText.value) {
  bulkText.value = text
  bulkError.value = ''
  showBulkAdd.value = true
  blurInput()
  nextTick(() => bulkInput.value?.focus())
}

function closeBulkAdd() {
  if (bulkAdding.value) return
  showBulkAdd.value = false
  nextTick(() => addInput.value?.focus())
}

function onAddPaste(event) {
  const text = event.clipboardData?.getData('text/plain')
  if (!text || !/[\r\n]/.test(text)) return
  event.preventDefault()
  openBulkAdd(parseBulkText(text).join('\n'))
}

function parseBulkText(text) {
  // Strip common list markers and the request heading, preserving item wording.
  const lines = text.split(/\r\n|[\n\r]/)
    .map(line => line.trim().replace(/^(?:[-*・•]\s*|\d+[.)、]\s*)/, ''))
    .filter(Boolean)
  if (/^買ってきて[ほ欲]しいもの[：:]?$/.test(lines[0] || '')) lines.shift()
  return lines
}

async function submitBulkAdd() {
  if (!canWrite.value || bulkAdding.value || !bulkNames.value.length || bulkHasLongName.value) return
  bulkAdding.value = true
  bulkError.value = ''
  const names = [...bulkNames.value]
  let added = 0
  for (const name of names) {
    if (!await addItemFull(name, null, null, '', false)) break
    added++
  }
  // Retain only unsaved lines so retrying cannot duplicate successful additions.
  bulkText.value = names.slice(added).join('\n')
  bulkAdding.value = false
  if (added < names.length) {
    bulkError.value = `${added}件を追加しました。残りの項目を再度追加してください。`
  } else {
    closeBulkAdd()
    showToast(`${added}件のアイテムを追加しました`)
  }
}

async function quickAdd(e) {
  if (e && e.isComposing) return
  const name = newItem.value.trim()
  if (!name) return
  newItem.value = ''
  await addItemFull(name, null, null, '')
}

async function addItemFull(name, category, quantity, note, restoreInput = true) {
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
    return true
  } catch (e) {
    items.value = items.value.filter(i => i.id !== tmp.id)
    showToast(e.message)
    if (restoreInput) newItem.value = name
    return false
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

// Returns the bumped quantity string, or null if delta would take it below 1.
function bumpQty(quantity, delta) {
  const current = Number(quantity)
  const base = isNaN(current) ? 0 : current
  if (delta < 0 && base <= 1) return null
  return String(base + delta)
}

async function incrementQty(item) {
  const newQty = bumpQty(item.quantity, 1)
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
  const newQty = bumpQty(item.quantity, -1)
  if (newQty === null) return
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

function incrementEditQty() {
  editForm.quantity = bumpQty(editForm.quantity, 1)
  getWebApp()?.HapticFeedback?.impactOccurred('light')
}

function decrementEditQty() {
  const newQty = bumpQty(editForm.quantity, -1)
  if (newQty === null) return
  editForm.quantity = newQty
  getWebApp()?.HapticFeedback?.impactOccurred('light')
}

// ── Toggle / Delete ──────────────────────────────────────────
async function toggleItem(item) {
  const prev = item.checked
  item.checked = !prev
  if (!prev && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    celebratingItems.add(item.id)
    window.clearTimeout(celebrationTimers.get(item.id))
    celebrationTimers.set(item.id, window.setTimeout(() => {
      celebratingItems.delete(item.id)
      celebrationTimers.delete(item.id)
    }, 520))
  }
  getWebApp()?.HapticFeedback?.selectionChanged()
  try {
    await api.updateItem(item.id, { checked: item.checked })
  } catch {
    item.checked = prev
    celebratingItems.delete(item.id)
    window.clearTimeout(celebrationTimers.get(item.id))
    celebrationTimers.delete(item.id)
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
  if (isAgent.value) return
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
  const url = new URL('/', window.location.origin)
  url.searchParams.set('startapp', code)
  try {
    await navigator.clipboard.writeText(url.href)
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
  for (const timer of celebrationTimers.values()) window.clearTimeout(timer)
  celebrationTimers.clear()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style scoped>
.list-view {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  max-width: 600px;
  margin: 0 auto;
}

/* ── Header ── */
.header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 12px 12px 8px;
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
  padding: 8px 12px;
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
  cursor: pointer;
}

.header-title:active {
  opacity: 0.6;
}

.share-btn {
  padding: 8px;
  color: var(--tg-link);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: 8px;
  transition: opacity 0.14s;
}

.share-btn:active { opacity: 0.55; }
.share-btn:disabled { opacity: 0.28; }

.menu-btn {
  padding: 8px;
  color: var(--tg-hint);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-radius: 8px;
  transition: opacity 0.14s;
}

.menu-btn:active { opacity: 0.55; }
.menu-btn:disabled { opacity: 0.28; }

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

.empty-art { color: var(--tg-hint); opacity: 0.3; margin-bottom: 12px; }
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
  gap: 12px;
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
  gap: 8px;
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
  gap: 12px;
  padding: 12px 12px 12px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--tg-hint) 8%, transparent);
  cursor: pointer;
  user-select: none;
  transition: background 0.1s, opacity 0.35s;
}

.item:active { background: color-mix(in srgb, var(--tg-hint) 7%, transparent); }
.item--done { opacity: 0.38; }
.item--done.item--celebrating { opacity: 1; }

.checkbox-tap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 12px;
  margin: -12px;
}

.checkbox-tap:focus-visible {
  outline: 2px solid var(--tg-button);
  outline-offset: 2px;
  border-radius: 10px;
}

.checkbox-tap:active .checkbox { transform: scale(0.82); }
.checkbox-tap:active .checkbox.is-checked { animation: none; }

.checkbox {
  position: relative;
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

.checkbox.is-checked.is-celebrating {
  animation: checkbox-pop 0.38s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.checkbox.is-checked.is-celebrating::after {
  content: '';
  position: absolute;
  inset: -8px;
  border: 2px solid var(--tg-button);
  border-radius: 11px;
  pointer-events: none;
  animation: checkbox-halo 0.5s ease-out both;
}

.checkbox.is-checked.is-celebrating svg path {
  stroke-dasharray: 16;
  stroke-dashoffset: 16;
  animation: checkbox-draw 0.24s ease-out 0.06s forwards;
}

@keyframes checkbox-pop {
  0% { transform: scale(0.82); }
  55% { transform: scale(1.18); }
  100% { transform: scale(1.06); }
}

@keyframes checkbox-halo {
  from { opacity: 0.65; transform: scale(0.65); }
  to { opacity: 0; transform: scale(1.5); }
}

@keyframes checkbox-draw {
  to { stroke-dashoffset: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .checkbox, .item { transition: none; }
  .checkbox.is-celebrating, .checkbox.is-celebrating::after, .checkbox.is-celebrating svg path { animation: none; }
  .checkbox.is-celebrating::after { content: none; }
  .checkbox.is-celebrating svg path { stroke-dashoffset: 0; }
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
  margin-top: 4px;
  white-space: pre-wrap;
  word-break: break-word;
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
  gap: 4px;
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
  gap: 12px;
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
  gap: 4px;
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
  padding: 12px;
  z-index: 10;
}

/* ── Suggest / Favorites panel ── */
.suggest-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  z-index: 10;
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
  padding: 12px 16px 8px;
}

.suggest-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
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
  padding: 4px 8px;
  background: color-mix(in srgb, var(--tg-hint) 10%, transparent);
  border-radius: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.suggest-enter-active, .suggest-leave-active { transition: opacity 0.15s, transform 0.15s; }
.suggest-enter-from, .suggest-leave-to { opacity: 0; transform: translateY(4px); }

.bulk-open-btn { display: block; margin: 0 auto 8px; padding: 8px; border: 0; background: transparent; color: var(--tg-hint); font-size: 13px; cursor: pointer; }
.bulk-help { color: var(--tg-hint); font-size: 13px; margin-bottom: 12px; }
.bulk-text { resize: vertical; line-height: 1.6; margin-bottom: 16px; }
.sheet-btn:disabled, .bulk-open-btn:disabled { opacity: 0.5; cursor: default; }

/* ── Input row ── */
.input-row { display: flex; gap: 8px; align-items: center; }

.add-input {
  min-width: 0;
  flex: 1;
  background: var(--tg-secondary-bg);
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
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
  padding: 16px 16px;
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
  margin: 0 auto 24px;
}

.field-group { margin-bottom: 20px; }

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
  padding: 12px 16px;
  font-size: 16px;
  color: var(--tg-text);
  outline: none;
}

.qty-ctrl-sheet {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qty-ctrl-sheet .qty-input {
  flex: 1;
  text-align: center;
}

.qty-ctrl-sheet .qty-btn {
  width: 40px;
  height: 40px;
  font-size: 18px;
}

.sheet-textarea {
  display: block;
  width: 100%;
  background: var(--tg-secondary-bg);
  border: none;
  border-radius: 12px;
  padding: 12px 16px;
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
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.pills::-webkit-scrollbar { display: none; }

.pill {
  padding: 8px 12px;
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
  padding: 16px;
  font-size: 16px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
  transition: opacity 0.15s;
  margin-bottom: 12px;
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
  padding: 12px 20px;
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
  gap: 4px;
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
  gap: 4px;
  font-size: 11px;
  color: var(--tg-hint);
  margin-left: 8px;
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
  gap: 8px;
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

/* Attachment Preview Modal */
.preview-overlay {
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.preview-modal {
  background: var(--surface);
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.preview-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 70%;
}
.preview-actions {
  display: flex;
  gap: 8px;
}
.preview-action-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-action-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.preview-content {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--background);
  min-height: 300px;
}
.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.preview-iframe {
  width: 100%;
  height: 80vh;
  border: none;
}
.preview-unsupported {
  color: var(--text-muted);
  text-align: center;
  padding: 32px;
}
</style>
