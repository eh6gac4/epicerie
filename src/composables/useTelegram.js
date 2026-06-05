// Dev mock: window.Telegram が未設定のとき（ブラウザ直アクセス時）にセット
if (import.meta.env.DEV && !window.Telegram?.WebApp?.initData) {
  const sp = new URLSearchParams(location.search).get('startapp') ?? ''
  window.Telegram = {
    WebApp: {
      initData: '',
      initDataUnsafe: {
        user: { id: 999999, first_name: 'Dev', username: 'devuser' },
        start_param: sp,
      },
      colorScheme: 'light',
      themeParams: {},
      platform: 'unknown',
      version: '7.0',
      isExpanded: false,
      ready() {},
      expand() { this.isExpanded = true },
      close() {},
      HapticFeedback: {
        impactOccurred() {},
        notificationOccurred() {},
        selectionChanged() {},
      },
      BackButton: {
        isVisible: false,
        _cbs: [],
        show() { this.isVisible = true },
        hide() { this.isVisible = false },
        onClick(fn) { this._cbs.push(fn) },
        offClick(fn) { this._cbs = this._cbs.filter(cb => cb !== fn) },
      },
      MainButton: {
        text: '',
        isVisible: false,
        _cbs: [],
        setText(t) { this.text = t },
        show() { this.isVisible = true },
        hide() { this.isVisible = false },
        enable() {},
        disable() {},
        onClick(fn) { this._cbs.push(fn) },
        offClick(fn) { this._cbs = this._cbs.filter(cb => cb !== fn) },
      },
      showAlert(msg, cb) { alert(msg); cb?.() },
      showConfirm(msg, cb) { cb?.(confirm(msg)) },
      openTelegramLink(url) { window.open(url, '_blank') },
      openLink(url) { window.open(url, '_blank', 'noopener') },
    },
  }
}

export function getWebApp() {
  return window.Telegram?.WebApp ?? null
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
