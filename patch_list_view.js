const fs = require('fs');
let content = fs.readFileSync('src/views/ListView.vue', 'utf8');

// 1. Add attachment icon to item
content = content.replace(
  `<span v-if="item.isCategorizing" class="item-categorizing">
                  <span class="recat-spinner" />
                  分類中...
                </span>`,
  `<span v-if="item.isCategorizing" class="item-categorizing">
                  <span class="recat-spinner" />
                  分類中...
                </span>
                <span v-if="item.attachment_count > 0" class="item-attachment-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                  {{ item.attachment_count }}
                </span>`
);

// 2. Add UI to Edit Sheet
content = content.replace(
  `              <textarea
                v-model="editForm.note"
                class="sheet-textarea"
                placeholder="補足・メモ…"
                maxlength="200"
                rows="2"
              />
            </div>`,
  `              <textarea
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
            </div>`
);

// 3. Add refs
content = content.replace(
  `const fileInput = ref(null)
const addInput = ref(null)

const keepCheckedMode = ref(localStorage.getItem('keepCheckedMode') === 'true')`,
  `const fileInput = ref(null)
const addInput = ref(null)

const attachments = ref([])
const loadingAttachments = ref(false)
const isUploadingAttachment = ref(false)
const uploadAttachmentInput = ref(null)

const keepCheckedMode = ref(localStorage.getItem('keepCheckedMode') === 'true')`
);

// 4. Update openEdit
content = content.replace(
  `function openEdit(item) {
  editItem.value = item
  editForm.name = item.name
  editForm.category = item.category || 'その他'
  editForm.quantity = item.quantity ?? ''
  editForm.note = item.note || ''
}`,
  `async function openEdit(item) {
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
}`
);

// 5. Add methods
content = content.replace(
  `// ── Quantity controls ────────────────────────────────────────`,
  `// ── Item Attachments ────────────────────────────────────────
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

// ── Quantity controls ────────────────────────────────────────`
);

// 6. Add CSS
content = content.replace(
  `</style>`,
  `.item-attachment-icon {
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
</style>`
);

fs.writeFileSync('src/views/ListView.vue', content);
