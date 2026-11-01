let currentUserId = null

export function setMyUserId(id) { currentUserId = id }

export function getWebApp() {
  return window.Telegram?.WebApp ?? null
}

export function getMyUserId() {
  return currentUserId
}

export function confirmAsync(msg) {
  return new Promise((resolve) => {
    const tg = getWebApp()
    if (tg?.showConfirm) {
      tg.showConfirm(msg, (ok) => resolve(!!ok))
    } else {
      resolve(window.confirm(msg))
    }
  })
}

export function applyTheme() {
  const tg = getWebApp()
  if (!tg) return
  const t = tg.themeParams
  const root = document.documentElement
  const set = (name, value) => { if (value) root.style.setProperty(name, value) }
  set('--tg-bg', t.bg_color)
  set('--tg-text', t.text_color)
  set('--tg-hint', t.hint_color)
  set('--tg-link', t.link_color)
  set('--tg-button', t.button_color)
  set('--tg-button-text', t.button_text_color)
  set('--tg-secondary-bg', t.secondary_bg_color)
}
