<template>
  <div v-if="notInTelegram" class="tg-only" />
  <RouterView v-else />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getWebApp, applyTheme } from './composables/useTelegram.js'
import { api, hasValidStoredSession } from './composables/useApi.js'

const notInTelegram = ref(false)

onMounted(async () => {
  const tg = getWebApp()
  if (!tg || tg.initData === undefined) {
    notInTelegram.value = true
    return
  }

  tg.ready()
  tg.expand()
  applyTheme()

  if (tg.initData || import.meta.env.DEV) {
    // Normal launch or DEV: issue / refresh session token
    try { await api.createSession() } catch {}
  } else if (!hasValidStoredSession()) {
    // No initData and no valid stored token → not accessible outside Telegram
    notInTelegram.value = true
  }
  // else: initData gone but stored session is still valid → allow through
})
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

.tg-only {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100dvh;
  gap: 16px;
  color: #888;
  font-size: 15px;
  text-align: center;
  padding: 24px;
}

.tg-only p { margin: 0; }

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
