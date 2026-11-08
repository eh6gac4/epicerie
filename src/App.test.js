import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'
import { api } from './composables/useApi.js'
import { getMyUserId } from './composables/useTelegram.js'

vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: vi.fn(() => false), startAuthentication: vi.fn() }))
vi.mock('./composables/useApi.js', () => ({ api: { getMe: vi.fn(), logout: vi.fn(), loginTelegram: vi.fn(), loginAgent: vi.fn(), getPasskeyLoginOptions: vi.fn(), verifyPasskeyLogin: vi.fn() } }))
let wrapper
beforeEach(() => { vi.clearAllMocks(); browserSupportsWebAuthn.mockReturnValue(false) })
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); document.documentElement.removeAttribute('style') })
function render() {
  wrapper = mount(App, { global: { stubs: { RouterView: { template: '<div data-test="lists">Lists</div>' } } } })
  return wrapper
}
describe('Login screen without Telegram', () => {
  it('logs family into the normal app without exposing Telegram account management', async () => {
    api.getMe.mockRejectedValueOnce({ status: 401 }).mockResolvedValueOnce({ id: 0, accountId: 'family-id', name: 'Family', provider: 'family', shared: true })
    api.loginAgent.mockResolvedValue({ id: 0 })
    render()
    await flushPromises()
    await wrapper.find('[name="username"]').setValue('family-browser')
    await wrapper.find('[name="password"]').setValue('family-password')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-test="lists"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/settings/accounts"]').exists()).toBe(false)
    expect(getMyUserId()).toBe(0)
    expect(wrapper.text()).toContain('Family')
  })

  it('accepts ID/password login, clears the password and hides human settings for the agent', async () => {
    api.getMe.mockRejectedValueOnce({ status: 401 }).mockResolvedValueOnce({ id: 123, name: 'Muse', provider: 'agent', permission: 'read' })
    api.loginAgent.mockResolvedValue({ id: 123 })
    render()
    await flushPromises()
    await wrapper.find('[name="username"]').setValue('muse-shopping')
    await wrapper.find('[name="password"]').setValue('generated-password')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.loginAgent).toHaveBeenCalledWith('muse-shopping', 'generated-password')
    expect(wrapper.find('[data-test="lists"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/settings/accounts"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('generated-password')
  })
  it('shows failed password login without exposing the password', async () => {
    api.getMe.mockRejectedValue({ status: 401 })
    api.loginAgent.mockRejectedValue(new Error('IDまたはパスワードが正しくありません'))
    render()
    await flushPromises()
    await wrapper.find('[name="username"]').setValue('muse-shopping')
    await wrapper.find('[name="password"]').setValue('wrong-password')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('正しくありません')
    expect(wrapper.find('[name="password"]').element.value).toBe('')
  })
  it('shows password login and Telegram issuance guidance for a visitor', async () => {
    api.getMe.mockRejectedValue({ status: 401 })
    render()
    await flushPromises()
    expect(wrapper.text()).toContain('登録済みのTelegram')
    expect(wrapper.find('[data-test="lists"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Googleでログイン')
  })
  it('sets the server user ID before mounting lists and logs out', async () => {
    api.getMe.mockResolvedValue({ id: 123, name: 'Owner', email: 'owner@example.com' })
    api.logout.mockResolvedValue({ ok: true })
    render()
    await flushPromises()
    expect(getMyUserId()).toBe(123)
    expect(wrapper.find('[data-test="lists"]').exists()).toBe(true)
    await wrapper.find('.account button').trigger('click')
    await flushPromises()
    expect(getMyUserId()).toBe(null)
    expect(wrapper.text()).toContain('登録済みのTelegram')
  })
  it('returns to login when the API reports an expired session', async () => {
    api.getMe.mockResolvedValue({ id: 123, name: 'Owner' })
    render()
    await flushPromises()
    window.dispatchEvent(new Event('auth-required'))
    await flushPromises()
    expect(wrapper.find('[data-test="lists"]').exists()).toBe(false)
    expect(getMyUserId()).toBe(null)
  })
  it('shows a recoverable connection error', async () => {
    api.getMe.mockRejectedValue(new Error('Network error'))
    render()
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('接続できませんでした')
    expect(wrapper.findAll('button').map(button => button.text())).toContain('再読み込み')
  })
})

it('subscribes to Telegram theme changes and removes the listener on unmount', async () => {
  const tg = { initData: 'signed-init-data', themeParams: {}, ready: vi.fn(), expand: vi.fn(), onEvent: vi.fn(), offEvent: vi.fn() }
  vi.stubGlobal('Telegram', { WebApp: tg })
  api.getMe.mockResolvedValue({ id: 123, name: 'Owner' })
  render()
  await flushPromises()
  const [event, handler] = tg.onEvent.mock.calls[0]
  expect(event).toBe('themeChanged')
  tg.themeParams = { bg_color: '#222222' }
  handler()
  expect(document.documentElement.style.getPropertyValue('--tg-bg')).toBe('#222222')
  wrapper.unmount()
  expect(tg.offEvent).toHaveBeenCalledWith('themeChanged', handler)
})

describe('Passkey login', () => {
  it('logs in without username/password and exposes family passkey management', async () => {
    browserSupportsWebAuthn.mockReturnValue(true)
    api.getMe.mockRejectedValueOnce({ status: 401 }).mockResolvedValueOnce({ id: 0, accountId: 'family-a', name: 'Family', provider: 'family' })
    api.getPasskeyLoginOptions.mockResolvedValue({ challenge: 'challenge' })
    startAuthentication.mockResolvedValue({ id: 'key' })
    api.verifyPasskeyLogin.mockResolvedValue({ provider: 'family' })
    render(); await flushPromises()
    await wrapper.find('.passkey-login').trigger('click'); await flushPromises()
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'challenge' } })
    expect(api.verifyPasskeyLogin).toHaveBeenCalledWith({ id: 'key' })
    expect(wrapper.find('a[href="/settings/passkeys"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="lists"]').exists()).toBe(true)
  })
  it('handles cancelled authentication and keeps password login available', async () => {
    browserSupportsWebAuthn.mockReturnValue(true)
    api.getMe.mockRejectedValue({ status: 401 })
    startAuthentication.mockRejectedValue({ name: 'NotAllowedError' })
    render(); await flushPromises()
    await wrapper.find('.passkey-login').trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('キャンセル')
    expect(wrapper.find('[name="password"]').exists()).toBe(true)
    expect(api.verifyPasskeyLogin).not.toHaveBeenCalled()
    expect(wrapper.find('.passkey-login').attributes('disabled')).toBeUndefined()
  })
  it('hides the passkey button on an unsupported browser', async () => {
    api.getMe.mockRejectedValue({ status: 401 })
    render(); await flushPromises()
    expect(wrapper.find('.passkey-login').exists()).toBe(false)
  })
})
