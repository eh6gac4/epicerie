<template>
  <main class="passkeys">
    <a href="/">買い物リストに戻る</a>
    <h1>パスキー管理</h1>
    <p v-if="currentUser?.provider !== 'family'">家族用アカウントでログインしてください。</p>
    <template v-else>
      <p>登録すると、次回から指紋・顔認証や端末のPINでログインできます。</p>
      <p>ID・パスワードは、別の端末でのログインやパスキーを使えない場合に引き続き使えます。</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <form v-if="supported" @submit.prevent="register">
        <label for="passkey-name">パスキーの名前</label>
        <input id="passkey-name" v-model="name" required maxlength="80" placeholder="例：自分のiPhone" />
        <button :disabled="busy || loading || loadFailed || keys.length >= 10">{{ busy ? '処理中…' : 'パスキーを登録' }}</button>
      </form>
      <p v-else>このブラウザではパスキーを登録できません。対応するブラウザで開いてください。</p>
      <p v-if="loading">読み込み中…</p>
      <button v-else-if="loadFailed" @click="load">再読み込み</button>
      <template v-else>
        <p v-if="!keys.length">登録済みのパスキーはありません。</p>
        <ul v-else>
          <li v-for="key in keys" :key="key.id">
            <span>{{ key.name }}<small>登録日：{{ date(key.createdAt) }} ／ 最終利用：{{ key.lastUsedAt ? date(key.lastUsedAt) : '未使用' }}</small></span>
            <button :disabled="busy" :aria-label="`${key.name}を削除`" @click="remove(key)">削除</button>
          </li>
        </ul>
      </template>
      <p>最大10件。ここで削除しても、端末側のパスワード管理アプリには残る場合があります。</p>
    </template>
  </main>
</template>

<script setup>
import { inject, ref, onMounted } from 'vue'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { api } from '../composables/useApi.js'
import { passkeyError } from '../composables/passkeyError.js'

const currentUser = inject('currentUser')
const supported = browserSupportsWebAuthn()
const keys = ref([])
const name = ref('')
const loading = ref(true)
const busy = ref(false)
const loadFailed = ref(false)
const error = ref('')
const message = ref('')
const date = value => new Date(value).toLocaleDateString('ja-JP')
async function load() {
  loading.value = true
  loadFailed.value = false
  error.value = ''
  try { keys.value = await api.getPasskeys() }
  catch { loadFailed.value = true; error.value = 'パスキー一覧を取得できませんでした。再読み込みしてください。' }
  finally { loading.value = false }
}
async function register() {
  if (busy.value || !name.value.trim() || loadFailed.value) return
  busy.value = true
  error.value = message.value = ''
  try {
    const optionsJSON = await api.getPasskeyRegistrationOptions()
    const credential = await startRegistration({ optionsJSON })
    await api.verifyPasskeyRegistration(credential, name.value.trim())
    name.value = ''
    message.value = 'パスキーを登録しました。'
    await load()
  } catch (e) { error.value = passkeyError(e) }
  finally { busy.value = false }
}
async function remove(key) {
  if (busy.value || !window.confirm(`「${key.name}」を削除しますか？このパスキーではログインできなくなります。`)) return
  busy.value = true
  error.value = message.value = ''
  try { await api.deletePasskey(key.id); message.value = 'パスキーを削除しました。'; await load() }
  catch (e) { error.value = e.message }
  finally { busy.value = false }
}
onMounted(() => { if (currentUser.value?.provider === 'family') load() })
</script>

<style scoped>
.passkeys { max-width: 640px; margin: 0 auto; padding: 24px; line-height: 1.7; }
.passkeys a { color: var(--tg-link); }
form { display: grid; gap: 12px; margin: 24px 0; }
input { padding: 12px; color: var(--tg-text); background: var(--tg-bg); border: 1px solid var(--tg-hint); border-radius: 8px; }
button { padding: 10px 16px; border-radius: 8px; background: var(--tg-button); color: var(--tg-button-text); }
button:disabled { opacity: .5; }
ul { padding: 0; list-style: none; }
li { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--tg-hint); }
li span { min-width: 0; overflow-wrap: anywhere; }
small { display: block; color: var(--tg-hint); }
</style>
