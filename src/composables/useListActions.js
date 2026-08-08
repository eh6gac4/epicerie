import { api } from './useApi.js'
import { getWebApp, confirmAsync } from './useTelegram.js'

// アーカイブ／削除／退出の実行ラッパー。確認ダイアログ → API 呼び出し → 成功ハプティクスまでを共通化する。
// エラーは呼び出し元で catch して表示する（トースト文言は画面ごとに違うため）。
async function run(apiCall, confirmMsg) {
  if (confirmMsg && !(await confirmAsync(confirmMsg))) return false
  await apiCall()
  getWebApp()?.HapticFeedback?.notificationOccurred('success')
  return true
}

export function useListActions() {
  return {
    archive: (id) => run(() => api.archiveList(id)),
    unarchive: (id) => run(() => api.unarchiveList(id)),
    delete: (id) => run(() => api.deleteList(id), 'このリストを完全に削除しますか？元に戻せません。'),
    leave: (id) => run(() => api.leaveList(id), 'このリストから抜けますか？'),
  }
}
