import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import AgentAccountsView from './AgentAccountsView.vue'
import { api } from '../composables/useApi.js'
import { confirmAsync } from '../composables/useTelegram.js'

vi.mock('../composables/useApi.js', () => ({ api: { getLists: vi.fn(), getAgentAccounts: vi.fn(), createAgentAccount: vi.fn(), revokeAgentAccount: vi.fn(), deleteAgentAccount: vi.fn() } }))
vi.mock('../composables/useTelegram.js', () => ({ confirmAsync: vi.fn().mockResolvedValue(true) }))
let wrapper
const account = { id: 'agent', name: 'Muse', loginId: 'muse-shopping', listIds: ['list-a'], permission: 'read', expiresAt: Date.now() + 86_400_000, lastUsedAt: null, revokedAt: null }
beforeEach(() => {
  vi.clearAllMocks()
  confirmAsync.mockResolvedValue(true)
  api.getLists.mockResolvedValue([{ id: 'list-a', name: 'Groceries' }])
  api.getAgentAccounts.mockResolvedValue([])
})
afterEach(() => wrapper?.unmount())
async function render() { wrapper = mount(AgentAccountsView); await flushPromises(); return wrapper }
describe('Agent account management', () => {
  it('defaults to a family account with no list selection or expiry', async () => {
    api.getLists.mockResolvedValue([])
    api.createAgentAccount.mockResolvedValue({ ...account, accountType: 'family', loginId: 'family-browser', listIds: [], expiresAt: null, password: 'family-once-secret' })
    await render()
    expect(wrapper.find('select[name="accountType"]').element.value).toBe('family')
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    await wrapper.find('input[maxlength="80"]').setValue('Family')
    await wrapper.find('input[maxlength="64"]').setValue('family-browser')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createAgentAccount).toHaveBeenCalledWith({ name: 'Family', loginId: 'family-browser', accountType: 'family' })
    expect(wrapper.text()).toContain('期限なし')
    expect(wrapper.text()).toContain('共通の全リスト')
    expect(wrapper.find('.revoke').exists()).toBe(true)
    expect(wrapper.find('[aria-label="発行済みアカウント"]').html()).not.toContain('family-once-secret')
  })

  it('issues a list-scoped account and displays the generated password only until dismissed', async () => {
    api.createAgentAccount.mockResolvedValue({ ...account, password: 'only-once-secret' })
    await render()
    await wrapper.find('input[maxlength="80"]').setValue('Muse')
    await wrapper.find('input[maxlength="64"]').setValue('muse-shopping')
    await wrapper.find('select[name="accountType"]').setValue('agent')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createAgentAccount).toHaveBeenCalledWith({ name: 'Muse', loginId: 'muse-shopping', accountType: 'agent', listIds: ['list-a'], permission: 'read', expiresInDays: 30 })
    expect(wrapper.find('textarea').element.value).toBe('only-once-secret')
    expect(wrapper.find('[aria-label="発行済みアカウント"]').html()).not.toContain('only-once-secret')
    await wrapper.find('.dismiss').trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('only-once-secret')
  })
  it('revokes an existing account and shows its new status', async () => {
    api.getAgentAccounts.mockResolvedValue([{ ...account }])
    api.revokeAgentAccount.mockResolvedValue({ ok: true })
    await render()
    await wrapper.find('.revoke').trigger('click')
    await flushPromises()
    expect(api.revokeAgentAccount).toHaveBeenCalledWith('agent')
    expect(wrapper.text()).toContain('失効済み')
    expect(wrapper.find('.revoke').exists()).toBe(false)
  })
  it.each([
    { ...account },
    { ...account, revokedAt: 1 },
    { ...account, expiresAt: 1 },
    { ...account, accountType: 'family', expiresAt: null },
  ])('deletes an account from the list after confirmation, including inactive accounts', async row => {
    api.getAgentAccounts.mockResolvedValue([row])
    api.deleteAgentAccount.mockResolvedValue({ ok: true })
    await render()
    if (row.accountType === 'family') expect(wrapper.find('.account-heading').text()).toContain('有効')
    await wrapper.find('.delete-account').trigger('click')
    await flushPromises()
    expect(confirmAsync).toHaveBeenCalledWith(expect.stringContaining(row.loginId))
    expect(api.deleteAgentAccount).toHaveBeenCalledWith(row.id)
    expect(wrapper.find('.agent-account').exists()).toBe(false)
  })
  it('keeps the account when deletion is cancelled or the server fails', async () => {
    api.getAgentAccounts.mockResolvedValue([{ ...account }])
    await render()
    confirmAsync.mockResolvedValueOnce(false)
    await wrapper.find('.delete-account').trigger('click')
    await flushPromises()
    expect(api.deleteAgentAccount).not.toHaveBeenCalled()
    expect(wrapper.find('.agent-account').exists()).toBe(true)
    api.deleteAgentAccount.mockRejectedValueOnce(new Error('削除できませんでした'))
    await wrapper.find('.delete-account').trigger('click')
    await flushPromises()
    expect(wrapper.find('.agent-account').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').text()).toBe('削除できませんでした')
  })
  it('clears newly issued credentials when their account is deleted', async () => {
    api.createAgentAccount.mockResolvedValue({ ...account, accountType: 'family', expiresAt: null, password: 'one-time-secret' })
    api.deleteAgentAccount.mockResolvedValue({ ok: true })
    await render()
    await wrapper.find('input[maxlength="80"]').setValue('Family')
    await wrapper.find('input[maxlength="64"]').setValue('family-browser')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('textarea').exists()).toBe(true)
    await wrapper.find('.delete-account').trigger('click')
    await flushPromises()
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('one-time-secret')
  })
  it('does not expose the issuance form after a failed management request', async () => {
    api.getAgentAccounts.mockRejectedValue(new Error('Forbidden'))
    await render()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').text()).toBe('Forbidden')
  })
})
