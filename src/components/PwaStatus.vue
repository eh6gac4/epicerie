<template>
  <p v-if="offline" class="pwa-status" role="status">接続がありません。買い物リストの変更には接続が必要です。</p>
  <aside v-if="!standalone && !inTelegram" class="pwa-install">
    <button v-if="installEvent" @click="install">ホーム画面に追加</button>
    <details v-else><summary>ホーム画面に追加</summary><p>iPhone・iPadはSafariの共有メニューから「ホーム画面に追加」を選んでください。Androidはブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。</p></details>
  </aside>
</template>
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
const offline = ref(!navigator.onLine)
const standalone = ref(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true)
const inTelegram = !!window.Telegram?.WebApp?.initData
const installEvent = ref(null)
const displayMode = window.matchMedia?.('(display-mode: standalone)')
function connectionChanged() { offline.value = !navigator.onLine }
function beforeInstall(event) { event.preventDefault(); installEvent.value = event }
function installed() { standalone.value = true; installEvent.value = null }
function displayChanged(event) { standalone.value = event.matches || navigator.standalone === true }
async function install() {
  const event = installEvent.value
  if (!event) return
  installEvent.value = null
  await event.prompt()
  await event.userChoice
}
onMounted(() => {
  window.addEventListener('online', connectionChanged)
  window.addEventListener('offline', connectionChanged)
  window.addEventListener('beforeinstallprompt', beforeInstall)
  window.addEventListener('appinstalled', installed)
  displayMode?.addEventListener('change', displayChanged)
})
onUnmounted(() => {
  window.removeEventListener('online', connectionChanged)
  window.removeEventListener('offline', connectionChanged)
  window.removeEventListener('beforeinstallprompt', beforeInstall)
  window.removeEventListener('appinstalled', installed)
  displayMode?.removeEventListener('change', displayChanged)
})
</script>
<style scoped>
.pwa-status { margin: 0; padding: 12px 20px; background: #fff0ca; color: #614600; font-size: 13px; line-height: 1.6; }
.pwa-install { padding: 10px 20px; font-size: 12px; color: var(--tg-hint); }
.pwa-install button, summary { cursor: pointer; text-decoration: underline; }
.pwa-install p { max-width: 36em; line-height: 1.8; }
</style>
