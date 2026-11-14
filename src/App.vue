<template>
  <PwaStatus />
  <div v-if="loading" class="login">読み込み中…</div>
  <template v-else-if="user">
    <div class="account"><span>{{ user.name || user.email }}</span><a v-if="user.provider === 'telegram'" href="/settings/accounts">アカウント管理</a><a v-if="user.provider === 'family'" href="/settings/passkeys">パスキー管理</a><button @click="logout">ログアウト</button></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <RouterView />
  </template>
  <main v-else class="login">
    <h1>épicerie</h1>
    <p>買い物リストを使うにはログインしてください。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="passkeysSupported" class="passkey-login" :disabled="signingIn" @click="loginPasskey">{{ signingIn ? 'ログイン中…' : 'パスキーでログイン' }}</button>
    <form @submit.prevent="loginPassword" class="password-login">
      <label for="login-id">ログインID</label>
      <input id="login-id" v-model="loginId" name="username" autocomplete="username" required maxlength="64" />
      <label for="login-password">パスワード</label>
      <input id="login-password" v-model="password" name="password" type="password" autocomplete="current-password" required maxlength="128" />
      <button type="submit" :disabled="signingIn">{{ signingIn ? 'ログイン中…' : 'ID・パスワードでログイン' }}</button>
    </form>
    <p class="login-guide">登録済みのTelegramからアプリを開き、ログイン用アカウントを発行してください。</p>
    <button v-if="error" @click="loadUser">再読み込み</button>
  </main>
</template>

<script setup>
import { ref, provide, onMounted, onUnmounted } from 'vue'
import PwaStatus from './components/PwaStatus.vue'
import { applyTheme, getWebApp, setMyUserId } from './composables/useTelegram.js'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'
import { passkeyError } from './composables/passkeyError.js'
import { api } from './composables/useApi.js'

const passkeysSupported = browserSupportsWebAuthn()
const user = ref(null)
provide('currentUser', user)
const loginId = ref('')
const password = ref('')
const signingIn = ref(false)
const loading = ref(true)
const error = ref('')
const tapTargets = 'button, a, [role="button"], .card, .item, .suggest-item, .fav-grid-item, .share-code-box, .header-title'
const tapEffects = new Map()
let pointerStart = null

function onPointerDown(event) {
  pointerStart = null
  if (event.button !== 0 || !(event.target instanceof Element)) return
  if (event.target.closest('button:disabled, [aria-disabled="true"]')) return
  if (!event.target.closest(tapTargets)) return
  pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp }
}

function onPointerUp(event) {
  const start = pointerStart
  pointerStart = null
  if (!start || start.id !== event.pointerId) return
  if (event.timeStamp - start.time > 500 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const effect = document.createElement('span')
  effect.className = 'tap-ripple'
  effect.setAttribute('aria-hidden', 'true')
  effect.style.left = `${event.clientX}px`
  effect.style.top = `${event.clientY}px`
  document.body.append(effect)
  const timer = window.setTimeout(() => {
    effect.remove()
    tapEffects.delete(effect)
  }, 550)
  tapEffects.set(effect, timer)
}

function onPointerCancel() {
  pointerStart = null
}

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
async function loginPasskey() {
  if (signingIn.value) return
  signingIn.value = true
  error.value = ''
  try {
    const optionsJSON = await api.getPasskeyLoginOptions()
    const credential = await startAuthentication({ optionsJSON })
    await api.verifyPasskeyLogin(credential)
    await loadUser()
  } catch (e) { error.value = passkeyError(e) }
  finally { signingIn.value = false }
}
async function logout() {
  try { await api.logout(); clearUser() }
  catch { error.value = 'ログアウトできませんでした。もう一度お試しください。' }
}
onMounted(async () => {
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  getWebApp()?.ready()
  getWebApp()?.expand()
  applyTheme()
  if (getWebApp()?.initData) getWebApp().onEvent?.('themeChanged', applyTheme)
  window.addEventListener('auth-required', clearUser)
  try { await api.loginTelegram() } catch {}
  loadUser()
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
  for (const [effect, timer] of tapEffects) {
    window.clearTimeout(timer)
    effect.remove()
  }
  tapEffects.clear()
  window.removeEventListener('auth-required', clearUser)
  if (getWebApp()?.initData) getWebApp().offEvent?.('themeChanged', applyTheme)
})
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');

:root {
  --radius: 14px;
  --font-serif: 'Cormorant Garamond', 'Hiragino Mincho ProN', 'Yu Mincho', Georgia, serif;
  --font-sans: 'DM Sans', -apple-system, 'Hiragino Koshi Gothic ProN', 'Hiragino Sans', sans-serif;
}

.login { min-height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; padding: 24px; text-align: center; }
.password-login { display: grid; gap: 10px; width: min(100%, 320px); text-align: left; }
.password-login input { width: 100%; font: inherit; color: var(--tg-text); background: var(--tg-bg); border: 1px solid var(--tg-hint); border-radius: 8px; padding: 12px; }
.passkey-login { width: min(100%, 320px); padding: 14px; background: var(--tg-button); color: var(--tg-button-text); border-radius: var(--radius); }
.passkey-login:disabled { opacity: .5; }
.password-login button { padding: 14px; background: var(--tg-button); color: var(--tg-button-text); border-radius: var(--radius); }
.password-login button:disabled { opacity: .5; }
.login h1 { font-family: var(--font-serif); font-size: 48px; margin: 0; }
.login-guide { max-width: 320px; color: var(--tg-hint); font-size: 13px; line-height: 1.8; }
.account { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 16px; padding: 10px 20px; font-size: 12px; }
.account button { text-decoration: underline; }

*, *::before, *::after {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  margin: 0;
  padding-top: env(safe-area-inset-top, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
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

.tap-ripple {
  position: fixed;
  z-index: 9999;
  width: 0;
  height: 0;
  color: var(--tg-button);
  pointer-events: none;
}

.tap-ripple::before,
.tap-ripple::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.tap-ripple::before {
  width: 34px;
  height: 34px;
  border: 1.5px solid currentColor;
  animation: tap-ring 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.tap-ripple::after {
  width: 8px;
  height: 8px;
  background: currentColor;
  box-shadow: 0 0 10px currentColor;
  animation: tap-glow 0.42s ease-out forwards;
}

@keyframes tap-ring {
  from { opacity: 0.55; transform: translate(-50%, -50%) scale(0.35); }
  to { opacity: 0; transform: translate(-50%, -50%) scale(1.4); }
}

@keyframes tap-glow {
  from { opacity: 0.45; transform: translate(-50%, -50%) scale(0.7); }
  to { opacity: 0; transform: translate(-50%, -50%) scale(1.8); }
}

input {
  font-family: var(--font-sans);
  font-size: 16px;
}
</style>
