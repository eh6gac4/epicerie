import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme } from './useTelegram.js'

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#181a1b" media="(prefers-color-scheme: dark)">'
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
  document.head.innerHTML = ''
})

describe('theme source', () => {
  it.each([undefined, { WebApp: { initData: '', themeParams: { bg_color: '#ffffff', text_color: '#000000' }, colorScheme: 'light' } }])('leaves system CSS and theme metadata in control outside Telegram (%j)', telegram => {
    vi.stubGlobal('Telegram', telegram)
    applyTheme()
    expect(document.documentElement.style.length).toBe(0)
    expect([...document.querySelectorAll('meta[name="theme-color"]')].map(meta => meta.content)).toEqual(['#ffffff', '#181a1b'])
  })

  it('applies Telegram colors and updates them when the host theme changes', () => {
    const webApp = { initData: 'signed-init-data', themeParams: { bg_color: '#202020', text_color: '#eeeeee' }, colorScheme: 'dark' }
    vi.stubGlobal('Telegram', { WebApp: webApp })
    applyTheme()
    expect(document.documentElement.style.getPropertyValue('--tg-bg')).toBe('#202020')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect([...document.querySelectorAll('meta[name="theme-color"]')].map(meta => meta.content)).toEqual(['#202020', '#202020'])
    webApp.themeParams = { bg_color: '#fafafa', text_color: '#111111' }
    webApp.colorScheme = 'light'
    applyTheme()
    expect(document.documentElement.style.getPropertyValue('--tg-bg')).toBe('#fafafa')
    expect(document.documentElement.style.getPropertyValue('--tg-text')).toBe('#111111')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })
})
