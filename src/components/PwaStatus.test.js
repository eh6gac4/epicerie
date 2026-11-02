import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PwaStatus from './PwaStatus.vue'
let wrapper
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); delete window.Telegram })
describe('PWA status', () => {
  it('uses the browser install prompt and hides after installation', async () => {
    wrapper = mount(PwaStatus)
    const event = new Event('beforeinstallprompt', { cancelable: true })
    event.prompt = vi.fn().mockResolvedValue()
    event.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(event)
    await wrapper.vm.$nextTick()
    expect(event.defaultPrevented).toBe(true)
    await wrapper.find('button').trigger('click')
    expect(event.prompt).toHaveBeenCalledOnce()
    window.dispatchEvent(new Event('appinstalled'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('aside').exists()).toBe(false)
  })
  it('shows connectivity changes without promising offline writes', async () => {
    wrapper = mount(PwaStatus)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="status"]').text()).toContain('変更には接続が必要')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })
  it('keeps the installation guidance out of Telegram', () => {
    window.Telegram = { WebApp: { initData: 'signed-data' } }
    wrapper = mount(PwaStatus)
    expect(wrapper.find('aside').exists()).toBe(false)
  })
})
