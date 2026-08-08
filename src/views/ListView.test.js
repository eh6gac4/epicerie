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
    getList: vi.fn().mockImplementation(() => Promise.resolve({ id: 'test-list', name: 'テストリスト', share_code: 'ABC' })),
    updateList: vi.fn().mockResolvedValue({ ok: true, name: 'テストリスト' }),
    deleteList: vi.fn().mockResolvedValue({ ok: true }),
    archiveList: vi.fn().mockResolvedValue({ ok: true }),
    unarchiveList: vi.fn().mockResolvedValue({ ok: true }),
    leaveList: vi.fn().mockResolvedValue({ ok: true }),
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
    initDataUnsafe: { user: { id: 999999 } },
    HapticFeedback: {
      impactOccurred: vi.fn(),
      selectionChanged: vi.fn(),
      notificationOccurred: vi.fn()
    },
    MainButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn(), showProgress: vi.fn(), hideProgress: vi.fn() }
  }),
  getMyUserId: () => 999999,
  confirmAsync: vi.fn().mockResolvedValue(true)
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

describe('ListView.vue - List rename', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Previous tests may leave teleported sheets mounted in document.body.
    document.body.querySelectorAll('.overlay').forEach(el => el.remove())
  })

  it('shows the fetched list name in the header', async () => {
    const wrapper = mount(ListView)
    await new Promise(resolve => setTimeout(resolve, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.header-title').text()).toBe('テストリスト')
  })

  it('opens the rename sheet with the current name when tapping the header title', async () => {
    const wrapper = mount(ListView)
    await new Promise(resolve => setTimeout(resolve, 10))
    await wrapper.vm.$nextTick()

    await wrapper.find('.header-title').trigger('click')
    await wrapper.vm.$nextTick()

    const sheetInput = document.querySelector('.sheet .sheet-input')
    expect(sheetInput).not.toBeNull()
    expect(sheetInput.value).toBe('テストリスト')

    wrapper.unmount()
  })

  it('saves the new name optimistically and calls api.updateList', async () => {
    const { api } = await import('../composables/useApi.js')

    const wrapper = mount(ListView)
    await new Promise(resolve => setTimeout(resolve, 10))
    await wrapper.vm.$nextTick()

    await wrapper.find('.header-title').trigger('click')
    await wrapper.vm.$nextTick()

    const sheetInput = document.querySelector('.sheet .sheet-input')
    sheetInput.value = '新しい名前'
    sheetInput.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()

    document.querySelector('.sheet .sheet-btn').click()
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.header-title').text()).toBe('新しい名前')
    expect(api.updateList).toHaveBeenCalledWith('test-list', '新しい名前')

    await new Promise(resolve => setTimeout(resolve, 10))
    wrapper.unmount()
  })

  it('rolls back the name if the save fails', async () => {
    const { api } = await import('../composables/useApi.js')
    api.updateList.mockRejectedValue(new Error('保存に失敗しました'))

    const wrapper = mount(ListView)
    await new Promise(resolve => setTimeout(resolve, 10))
    await wrapper.vm.$nextTick()

    await wrapper.find('.header-title').trigger('click')
    await wrapper.vm.$nextTick()

    const sheetInput = document.querySelector('.sheet .sheet-input')
    sheetInput.value = '新しい名前'
    sheetInput.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()

    document.querySelector('.sheet .sheet-btn').click()
    await wrapper.vm.$nextTick()
    await new Promise(resolve => setTimeout(resolve, 10))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.header-title').text()).toBe('テストリスト')

    wrapper.unmount()
  })
})

describe('ListView.vue - List menu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.querySelectorAll('.overlay').forEach(el => el.remove())
  })

  it('archives the list from the ⋯ menu', async () => {
    const { api } = await import('../composables/useApi.js')

    const wrapper = mount(ListView)
    await new Promise(resolve => setTimeout(resolve, 10))
    await wrapper.vm.$nextTick()

    await wrapper.find('.menu-btn').trigger('click')
    await wrapper.vm.$nextTick()

    const archiveBtn = Array.from(document.querySelectorAll('.sheet .sheet-btn'))
      .find(btn => btn.textContent === 'アーカイブする')
    expect(archiveBtn).toBeTruthy()

    archiveBtn.click()
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(api.archiveList).toHaveBeenCalledWith('test-list')

    wrapper.unmount()
  })
})
