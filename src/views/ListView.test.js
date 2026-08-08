import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ListView from './ListView.vue'

// Mock vue-router
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'test-list' }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}))

// Mock API
vi.mock('../composables/useApi.js', () => ({
  api: {
    getItems: vi.fn().mockResolvedValue([]),
    addItem: vi.fn().mockResolvedValue({ id: '1', name: 'にんじん', category: '野菜' }),
    updateItem: vi.fn().mockResolvedValue({ ok: true }),
    deleteItem: vi.fn().mockResolvedValue({ ok: true }),
    getItemAttachments: vi.fn().mockResolvedValue([]),
    getFavorites: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
    getLogs: vi.fn().mockResolvedValue([]),
    listInfo: vi.fn().mockResolvedValue({ name: 'Test List', unlisted: false })
  }
}))

// Mock Telegram
vi.mock('../composables/useTelegram.js', () => ({
  getWebApp: () => ({
    HapticFeedback: {
      impactOccurred: vi.fn(),
      selectionChanged: vi.fn(),
      notificationOccurred: vi.fn()
    },
    MainButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn(), showProgress: vi.fn(), hideProgress: vi.fn() }
  })
}))

describe('ListView.vue - Suggest Panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds item when tapping a suggest item via touch events without moving', async () => {
    const wrapper = mount(ListView)
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const input = wrapper.find('.add-input')
    await input.trigger('focus')
    await input.setValue('にん')
    await wrapper.vm.$nextTick()
    
    const panel = wrapper.find('.suggest-panel')
    expect(panel.exists()).toBe(true)
    
    const suggestItems = wrapper.findAll('.suggest-item')
    expect(suggestItems.length).toBeGreaterThan(0)
    
    const firstItem = suggestItems[0]
    
    await firstItem.trigger('touchstart', {
      touches: [{ clientY: 100 }]
    })
    
    const { api } = await import('../composables/useApi.js')
    
    await firstItem.trigger('touchend')
    await new Promise(resolve => setTimeout(resolve, 10))
    
    expect(api.addItem).toHaveBeenCalled()
    expect(api.addItem.mock.calls[0][1].name).toBeDefined()
  })

  it('does NOT add item when swiping/scrolling (touch moved)', async () => {
    const wrapper = mount(ListView)
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const input = wrapper.find('.add-input')
    await input.trigger('focus')
    await input.setValue('にん')
    await wrapper.vm.$nextTick()
    
    const suggestItems = wrapper.findAll('.suggest-item')
    expect(suggestItems.length).toBeGreaterThan(0)
    const firstItem = suggestItems[0]
    
    await firstItem.trigger('touchstart', {
      touches: [{ clientY: 100 }]
    })
    
    await firstItem.trigger('touchmove', {
      touches: [{ clientY: 120 }]
    })
    
    const { api } = await import('../composables/useApi.js')
    api.addItem.mockClear()
    
    await firstItem.trigger('touchend')
    await new Promise(resolve => setTimeout(resolve, 10))
    
    expect(api.addItem).not.toHaveBeenCalled()
  })
})

describe('ListView.vue - Item row tap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('toggles checked state when tapping the checkbox only', async () => {
    const { api } = await import('../composables/useApi.js')
    api.getItems.mockResolvedValue([
      { id: 1, name: 'にんじん', checked: 0, category: '野菜・果物' }
    ])

    const wrapper = mount(ListView)
    await new Promise(resolve => setTimeout(resolve, 10))
    await wrapper.vm.$nextTick()

    const checkboxTap = wrapper.find('.checkbox-tap')
    expect(checkboxTap.exists()).toBe(true)

    await checkboxTap.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(api.updateItem).toHaveBeenCalledWith(1, { checked: true })
    expect(document.querySelector('.sheet')).toBeNull()
  })

  it('opens the edit sheet when tapping outside the checkbox', async () => {
    const { api } = await import('../composables/useApi.js')
    api.getItems.mockResolvedValue([
      { id: 1, name: 'にんじん', checked: 0, category: '野菜・果物' }
    ])

    const wrapper = mount(ListView)
    await new Promise(resolve => setTimeout(resolve, 10))
    await wrapper.vm.$nextTick()

    const itemBody = wrapper.find('.item-body')
    expect(itemBody.exists()).toBe(true)

    await itemBody.trigger('click')
    await new Promise(resolve => setTimeout(resolve, 10))
    await wrapper.vm.$nextTick()

    expect(document.querySelector('.sheet')).not.toBeNull()
    expect(api.updateItem).not.toHaveBeenCalled()
  })
})
