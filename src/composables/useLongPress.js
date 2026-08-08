// タップ（クリック）と長押しを区別するための小さなヘルパー。
// 長押しが発火した直後の click イベントは無視することで、タップ遷移との競合を防ぐ。
export function useLongPress(onLongPress, { ms = 500, onTap } = {}) {
  let timer = null
  let fired = false

  function start(target) {
    fired = false
    clearTimeout(timer)
    timer = setTimeout(() => {
      fired = true
      onLongPress(target)
    }, ms)
  }

  function end() {
    clearTimeout(timer)
  }

  function cancel() {
    clearTimeout(timer)
    fired = false
  }

  function click(target) {
    if (fired) {
      fired = false
      return
    }
    onTap?.(target)
  }

  return { start, end, cancel, click }
}
