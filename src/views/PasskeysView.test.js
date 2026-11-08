import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { api } from '../composables/useApi.js'
import PasskeysView from './PasskeysView.vue'
vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: vi.fn(), startRegistration: vi.fn() }))
vi.mock('../composables/useApi.js', () => ({ api: { getPasskeys: vi.fn(), getPasskeyRegistrationOptions: vi.fn(), verifyPasskeyRegistration: vi.fn(), deletePasskey: vi.fn() } }))
let wrapper
function render(provider = 'family') { wrapper = mount(PasskeysView, { global: { provide: { currentUser: ref({ provider }) } } }); return wrapper }
beforeEach(() => { vi.resetAllMocks(); browserSupportsWebAuthn.mockReturnValue(true); api.getPasskeys.mockResolvedValue([]) })
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })
describe('Family passkey management', () => {
  it('registers with a friendly name and refreshes the list', async () => {
    api.getPasskeyRegistrationOptions.mockResolvedValue({ challenge: 'challenge' })
    startRegistration.mockResolvedValue({ id: 'key' })
    api.verifyPasskeyRegistration.mockResolvedValue({ ok: true })
    render(); await flushPromises()
    api.getPasskeys.mockResolvedValue([{ id: 'key', name: 'My phone', createdAt: 1, lastUsedAt: null }])
    await wrapper.find('input').setValue(' My phone ')
    await wrapper.find('form').trigger('submit'); await flushPromises()
    expect(api.verifyPasskeyRegistration).toHaveBeenCalledWith({ id: 'key' }, 'My phone')
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'challenge' } })
    expect(wrapper.text()).toContain('登録しました')
    expect(wrapper.text()).toContain('My phone')
  })
  it('requires confirmation to delete a specific key', async () => {
    api.getPasskeys.mockResolvedValue([{ id: 'key', name: 'Phone', createdAt: 1 }])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(); await flushPromises()
    await wrapper.find('[aria-label="Phoneを削除"]').trigger('click')
    expect(api.deletePasskey).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    api.getPasskeys.mockResolvedValue([])
    await wrapper.find('[aria-label="Phoneを削除"]').trigger('click'); await flushPromises()
    expect(api.deletePasskey).toHaveBeenCalledWith('key')
    expect(wrapper.text()).toContain('削除しました')
  })
  it('handles cancelled registration without losing the name', async () => {
    startRegistration.mockRejectedValue({ name: 'NotAllowedError' })
    render(); await flushPromises()
    await wrapper.find('input').setValue('Phone')
    await wrapper.find('form').trigger('submit'); await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('キャンセル')
    expect(wrapper.find('input').element.value).toBe('Phone')
    expect(api.verifyPasskeyRegistration).not.toHaveBeenCalled()
  })
  it('supports retry after a list fetch error', async () => {
    api.getPasskeys.mockRejectedValueOnce(new Error('Offline'))
    render(); await flushPromises()
    expect(wrapper.find('form button').attributes('disabled')).toBeDefined()
    await wrapper.findAll('button').find(b => b.text() === '再読み込み').trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('form button').attributes('disabled')).toBeUndefined()
  })
  it('allows viewing keys but hides registration in unsupported browsers', async () => {
    browserSupportsWebAuthn.mockReturnValue(false)
    render(); await flushPromises()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.text()).toContain('このブラウザでは')
  })
  it.each(['agent', 'telegram'])('does not offer management for %s accounts', async provider => {
    render(provider); await flushPromises()
    expect(api.getPasskeys).not.toHaveBeenCalled()
    expect(wrapper.find('form').exists()).toBe(false)
  })
})
