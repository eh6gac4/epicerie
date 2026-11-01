import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import AgentAccountsView from './AgentAccountsView.vue'
import { api } from '../composables/useApi.js'

vi.mock('../composables/useApi.js', () => ({ api: { getLists: vi.fn(), getAgentAccounts: vi.fn(), createAgentAccount: vi.fn(), revokeAgentAccount: vi.fn() } }))
vi.mock('../composables/useTelegram.js', () => ({ confirmAsync: vi.fn().mockResolvedValue(true) }))
let wrapper
const account = { id: 'agent', name: 'Muse', loginId: 'muse-shopping', listIds: ['list-a'], permission: 'read', expiresAt: Date.now() + 86_400_000, lastUsedAt: null, revokedAt: null }
beforeEach(() => {
  vi.clearAllMocks()
  api.getLists.mockResolvedValue([{ id: 'list-a', name: 'Groceries' }])
  api.getAgentAccounts.mockResolvedValue([])
})
afterEach(() => wrapper?.unmount())
async function render() { wrapper = mount(AgentAccountsView); await flushPromises(); return wrapper }
describe('Agent account management', () => {
  it('issues a list-scoped account and displays the generated password only until dismissed', async () => {
    api.createAgentAccount.mockResolvedValue({ ...account, password: 'only-once-secret' })
    await render()
    await wrapper.find('input[maxlength="80"]').setValue('Muse')
    await wrapper.find('input[maxlength="64"]').setValue('muse-shopping')
    await wrapper.find('input[type="checkbox"]').setValue(true)
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api.createAgentAccount).toHaveBeenCalledWith({ name: 'Muse', loginId: 'muse-shopping', listIds: ['list-a'], permission: 'read', expiresInDays: 30 })
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
  it('does not expose the issuance form after a failed management request', async () => {
    api.getAgentAccounts.mockRejectedValue(new Error('Forbidden'))
    await render()
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').text()).toBe('Forbidden')
  })
})
