<template>
  <div v-if="loading" class="login">読み込み中…</div>
  <template v-else-if="user">
    <div class="account"><span>{{ user.name || user.email }}</span><a v-if="user.provider !== 'agent'" href="/settings/agents">エージェント設定</a><button @click="logout">ログアウト</button></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <RouterView />
  </template>
  <main v-else class="login">
    <h1>épicerie</h1>
    <p>買い物リストを使うにはログインしてください。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <form @submit.prevent="loginPassword" class="password-login">
      <label for="login-id">ログインID</label>
      <input id="login-id" v-model="loginId" name="username" autocomplete="username" required maxlength="64" />
      <label for="login-password">パスワード</label>
      <input id="login-password" v-model="password" name="password" type="password" autocomplete="current-password" required maxlength="128" />
      <button type="submit" :disabled="signingIn">{{ signingIn ? 'ログイン中…' : 'ID・パスワードでログイン' }}</button>
    </form>
    <a :href="loginUrl">Googleでログイン</a>
    <button v-if="error" @click="loadUser">再読み込み</button>
  </main>
</template>

<script setup>
import { ref, provide, onMounted, onUnmounted } from 'vue'
import { applyTheme, getWebApp, setMyUserId } from './composables/useTelegram.js'
import { api } from './composables/useApi.js'

const user = ref(null)
provide('currentUser', user)
const loginId = ref('')
const password = ref('')
const signingIn = ref(false)
const loading = ref(true)
const authError = new URLSearchParams(location.search).get('auth_error')
const error = ref(authError === 'not_allowed' ? 'このGoogleアカウントには利用権限がありません。' : authError ? 'ログインできませんでした。もう一度お試しください。' : '')
const returnUrl = new URL(location.href)
returnUrl.searchParams.delete('auth_error')
const loginUrl = '/api/auth/google?returnTo=' + encodeURIComponent(returnUrl.pathname + returnUrl.search)
function clearUser() { user.value = null; setMyUserId(null) }
async function loadUser() {
  loading.value = true
  try { user.value = await api.getMe(); setMyUserId(user.value.id); error.value = '' }
  catch (e) { if (e.status !== 401) error.value = '接続できませんでした。再読み込みしてください。' }
  finally { loading.value = false }
}
async function loginPassword() {
  if (signingIn.value) return
  signingIn.value = true
  error.value = ''
  try { await api.loginAgent(loginId.value, password.value); password.value = ''; await loadUser() }
  catch (e) { error.value = e.message; password.value = '' }
  finally { signingIn.value = false }
}
async function logout() {
  try { await api.logout(); clearUser() }
  catch { error.value = 'ログアウトできませんでした。もう一度お試しください。' }
}
onMounted(async () => {
  getWebApp()?.ready()
  getWebApp()?.expand()
  applyTheme()
  window.addEventListener('auth-required', clearUser)
  try { await api.loginTelegram() } catch {}
  loadUser()
})
onUnmounted(() => window.removeEventListener('auth-required', clearUser))
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');

:root {
  --tg-bg: #ffffff;
  --tg-text: #000000;
  --tg-hint: #707579;
  --tg-link: #007aff;
  --tg-button: #007aff;
  --tg-button-text: #ffffff;
  --tg-secondary-bg: #f1f1f4;
  --radius: 14px;
  --font-serif: 'Cormorant Garamond', 'Hiragino Mincho ProN', 'Yu Mincho', Georgia, serif;
  --font-sans: 'DM Sans', -apple-system, 'Hiragino Koshi Gothic ProN', 'Hiragino Sans', sans-serif;
}

.login { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; padding: 24px; text-align: center; }
.password-login { display: grid; gap: 10px; width: min(100%, 320px); text-align: left; }
.password-login input { width: 100%; font: inherit; color: var(--tg-text); background: var(--tg-bg); border: 1px solid var(--tg-hint); border-radius: 8px; padding: 12px; }
.password-login button { padding: 14px; background: var(--tg-button); color: var(--tg-button-text); border-radius: var(--radius); }
.password-login button:disabled { opacity: .5; }
.login h1 { font-family: var(--font-serif); font-size: 48px; margin: 0; }
.login a { padding: 14px 24px; background: var(--tg-button); color: var(--tg-button-text); border-radius: var(--radius); text-decoration: none; }
.account { display: flex; justify-content: flex-end; align-items: center; gap: 16px; padding: 10px 20px; font-size: 12px; }
.account button { text-decoration: underline; }

*, *::before, *::after {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--tg-bg);
  color: var(--tg-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overscroll-behavior: none;
}

button {
  font-family: var(--font-sans);
  color: inherit;
  cursor: pointer;
  border: none;
  background: none;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
}

input {
  font-family: var(--font-sans);
}
</style>
