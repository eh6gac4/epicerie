<template>
  <main class="agents">
    <a href="/" class="back">← 買い物リスト</a>
    <h1>アカウント管理</h1>
    <p class="intro">家族用とエージェント用のログイン情報をTelegramから発行できます。</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="loading">読み込み中…</p>
    <button v-if="loadFailed" @click="load">再読み込み</button>
    <form v-if="!loading && !loadFailed" @submit.prevent="create" class="panel">
      <h2>アカウントを発行</h2>
      <label>用途<select v-model="accountType" name="accountType"><option value="family">家族用</option><option value="agent">エージェント用（Museなど）</option></select></label>
      <label>表示名<input v-model="name" required maxlength="80" :placeholder="accountType === 'family' ? '例：家族の名前' : '例：買い物アシスタント'" /></label>
      <label>ログインID<input v-model="loginId" required minlength="3" maxlength="64" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}" :placeholder="accountType === 'family' ? '例：fumiko' : '例：muse-shopping'" autocomplete="off" /></label>
      <p class="hint">パスワードは発行時に自動生成されます。</p>
      <label v-if="accountType === 'agent'">権限<select v-model="permission"><option value="read">閲覧のみ</option><option value="items:write">閲覧・商品の追加と更新</option></select></label>
      <p v-if="accountType === 'agent'" class="hint">リストや商品の削除、メンバー変更、設定の操作は許可されません。</p>
      <p v-else class="hint">共通の全リストとお気に入りを通常操作できます。追加されるリストも利用でき、有効期限はありません。発行・失効はTelegramから行います。</p>
      <fieldset v-if="accountType === 'agent'">
        <legend>対象リスト</legend>
        <p v-if="!lists.length">先に買い物リストを作成するか、共有コードで参加してください。</p>
        <label v-for="list in lists" :key="list.id" class="check"><input v-model="listIds" type="checkbox" :value="list.id" />{{ list.name }}</label>
      </fieldset>
      <label v-if="accountType === 'agent'">有効期限<select v-model.number="expiresInDays"><option :value="7">7日</option><option :value="30">30日</option><option :value="90">90日</option></select></label>
      <button type="submit" class="primary" :disabled="busy || !!created || !name.trim() || !loginId.trim() || (accountType === 'agent' && !listIds.length)">{{ busy ? '処理中…' : 'アカウントを発行' }}</button>
    </form>
    <section v-if="created" class="panel secret" aria-label="発行したアカウント">
      <h2>ログイン情報を保存してください</h2>
      <p>パスワードを表示できるのは今回だけです。画面を閉じる前に保存してください。</p>
      <p>ログインID：<strong>{{ created.loginId }}</strong></p>
      <textarea :value="created.password" readonly rows="3" aria-label="パスワード" spellcheck="false" />
      <button @click="copy" class="primary">{{ copied ? 'コピーしました' : 'コピー' }}</button>
      <button @click="created = null; copied = false" class="dismiss">保存したので閉じる</button>
    </section>
    <section v-if="!loading && !loadFailed" class="panel" aria-label="発行済みアカウント">
      <h2>発行済みアカウント</h2>
      <p v-if="!accounts.length">まだ発行していません。</p>
      <article v-for="account in accounts" :key="account.id" class="agent-account">
        <div class="account-heading"><strong>{{ account.name }}</strong><span>{{ status(account) }}</span></div>
        <p>{{ account.accountType === 'family' ? '家族用・共通データを通常操作' : account.permission === 'read' ? 'エージェント用・閲覧のみ' : 'エージェント用・閲覧と商品の追加・更新' }}</p>
        <p v-if="account.accountType === 'family'">対象：共通の全リスト（今後の追加分を含む）</p>
        <p v-else>対象：{{ account.listIds.map(id => lists.find(list => list.id === id)?.name || id).join('、') }}</p>
        <p class="hint">ID：{{ account.loginId }}<br />有効期限：{{ account.expiresAt == null ? '期限なし' : date(account.expiresAt) }}<br />最終利用：{{ account.lastUsedAt ? date(account.lastUsedAt) : '未使用' }}</p>
        <button v-if="!account.revokedAt && (account.expiresAt == null || account.expiresAt > now)" @click="revoke(account)" :disabled="busy" class="revoke">失効させる</button>
      </article>
    </section>
    <section class="panel usage">
      <h2>ブラウザからの利用</h2>
      <p>家族は通常のブラウザで、Museはブラウザ操作でこのアプリを開き、発行したIDとパスワードを入力してください。</p>
      <p class="hint">発行したアカウントの権限で画面を操作できます。失効させると、ログイン済みのセッションも利用できなくなります。</p>
    </section>
  </main>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../composables/useApi.js'
import { confirmAsync } from '../composables/useTelegram.js'

const lists = ref([])
const accounts = ref([])
const name = ref('')
const loginId = ref('')
const accountType = ref('family')
const permission = ref('read')
const listIds = ref([])
const expiresInDays = ref(30)
const created = ref(null)
const copied = ref(false)
const error = ref('')
const loading = ref(true)
const loadFailed = ref(false)
const busy = ref(false)
const now = ref(Date.now())
let timer
const date = value => new Date(value).toLocaleString('ja-JP')
const status = account => account.revokedAt ? '失効済み' : account.expiresAt <= now.value ? '期限切れ' : '有効'
async function load() {
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try { [lists.value, accounts.value] = await Promise.all([api.getLists(), api.getAgentAccounts()]) }
  catch (e) { error.value = e.message; loadFailed.value = true }
  finally { loading.value = false }
}
async function create() {
  if (busy.value || created.value) return
  busy.value = true
  error.value = ''
  try {
    const data = { name: name.value.trim(), loginId: loginId.value.trim(), accountType: accountType.value }
    if (accountType.value === 'agent') Object.assign(data, { permission: permission.value, listIds: listIds.value, expiresInDays: expiresInDays.value })
    const result = await api.createAgentAccount(data)
    created.value = result
    copied.value = false
    const { password, ...metadata } = result
    accounts.value.unshift(metadata)
    name.value = ''
    loginId.value = ''
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function revoke(account) {
  if (busy.value || !await confirmAsync(`${account.name} のアカウントを失効させますか？`)) return
  busy.value = true
  error.value = ''
  try {
    await api.revokeAgentAccount(account.id)
    account.revokedAt = Date.now()
    if (created.value?.id === account.id) created.value = null
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function copy() {
  try { await navigator.clipboard.writeText(created.value.password); copied.value = true }
  catch { error.value = 'コピーできませんでした。パスワードを選択して保存してください。' }
}
onMounted(() => { load(); timer = setInterval(() => { now.value = Date.now() }, 30_000) })
onUnmounted(() => { clearInterval(timer); created.value = null })
</script>

<style scoped>
.agents { max-width: 640px; margin: 0 auto; padding: 24px 20px 64px; }
h1 { font-family: var(--font-serif); font-weight: 600; font-size: 30px; margin: 24px 0 12px; }
h2 { font-size: 18px; margin: 0 0 20px; }
p { line-height: 1.7; overflow-wrap: anywhere; }
.intro, .hint { color: var(--tg-hint); font-size: 13px; }
.back { color: var(--tg-link); font-size: 14px; }
.panel { margin-top: 24px; padding: 24px; border: 1px solid var(--tg-hint); border-radius: var(--radius); }
label { display: grid; gap: 8px; margin: 16px 0; font-size: 14px; }
input, select, textarea { width: 100%; font: inherit; color: var(--tg-text); background: var(--tg-bg); border: 1px solid var(--tg-hint); border-radius: 8px; padding: 12px; }
fieldset { margin: 20px 0; border: 1px solid var(--tg-hint); border-radius: 8px; padding: 8px 16px; max-height: 260px; overflow: auto; }
.check { display: flex; align-items: center; gap: 10px; }
.check input { width: auto; }
button { padding: 12px 16px; border: 1px solid var(--tg-hint); border-radius: 8px; }
button:disabled { opacity: .45; cursor: default; }
.primary { background: var(--tg-button); color: var(--tg-button-text); border-color: var(--tg-button); }
.secret { background: var(--tg-secondary-bg); }
textarea { font-family: monospace; overflow-wrap: anywhere; resize: vertical; margin-bottom: 16px; }
.dismiss { margin: 12px 0 0 8px; }
.agent-account { border-top: 1px solid var(--tg-hint); padding: 20px 0; }
.account-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; overflow-wrap: anywhere; }
.account-heading span { font-size: 12px; flex-shrink: 0; }
.agent-account p { font-size: 13px; margin: 8px 0; }
.revoke, .error { color: #bd3030; }
pre { font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 400px) { .panel { padding: 18px; } .dismiss { margin-left: 0; } }
</style>
