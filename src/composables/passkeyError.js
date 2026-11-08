export function passkeyError(error) {
  if (error.name === 'NotAllowedError' || error.code === 'ERROR_CEREMONY_ABORTED') return '認証をキャンセルしたか、時間切れになりました。もう一度お試しください。'
  if (error.name === 'InvalidStateError') return 'このパスキーは登録済みです。'
  if (error.name === 'SecurityError') return 'このURLではパスキーを利用できません。本番URLまたはlocalhostで開いてください。'
  return error.status ? error.message : 'パスキーを利用できませんでした。別の端末やブラウザ、またはID・パスワードでお試しください。'
}
