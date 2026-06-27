import Anthropic from '@anthropic-ai/sdk'
import { SUGGESTIONS, CATEGORIES } from '../../src/data/suggestions.js'

/**
 * 辞書マッチによるカテゴリ判定（無料・即時）
 * 1. 完全一致
 * 2. 入力が辞書名を含む（例: 「有機にんじん」→ にんじん）
 * 3. 辞書名が入力を含む（例: 「ほうれん草」→ 入力「ほうれんそう」は対象外だが将来の拡張余地）
 */
function categorizeByDictionary(name) {
  const normalized = name.trim().replace(/\s+/g, '')
  for (const s of SUGGESTIONS) {
    const sName = s.name.replace(/\s+/g, '')
    if (normalized === sName || normalized.includes(sName) || sName.includes(normalized)) {
      return s.category
    }
  }
  return null
}

/**
 * Haiku による分類（未知語のみ呼び出し）
 */
async function categorizeByHaiku(name, apiKey) {
  const client = new Anthropic({ apiKey })
  const categoryList = CATEGORIES.filter(c => c !== 'その他').join('、')
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 20,
    system: `あなたはスーパーマーケットの商品分類AIです。商品名を受け取り、以下のカテゴリのうち最も適切な1つを、そのままの文字列で返してください。カテゴリ以外の文字は一切含めないでください。\nカテゴリ: ${categoryList}`,
    messages: [{ role: 'user', content: name }],
  })
  const result = msg.content[0]?.text?.trim() ?? ''
  return CATEGORIES.includes(result) ? result : null
}

/**
 * ハイブリッド分類: 辞書 → Haiku → 'その他'
 * env.ANTHROPIC_API_KEY が未設定なら辞書のみ。エラーは握りつぶし 'その他' にフォールバック。
 */
export async function categorize(name, env) {
  try {
    const byDict = categorizeByDictionary(name)
    if (byDict) return byDict

    if (env?.ANTHROPIC_API_KEY) {
      const byHaiku = await categorizeByHaiku(name, env.ANTHROPIC_API_KEY)
      if (byHaiku) return byHaiku
    }
  } catch {
    // API障害・ネットワーク不達などは無視して 'その他' へ
  }
  return 'その他'
}

/**
 * バッチ分類: 辞書ミスの商品だけ Haiku に1回でまとめて問い合わせる。
 * @param {string[]} names
 * @param {object} env  — ANTHROPIC_API_KEY を持つ Cloudflare env
 * @returns {Promise<string[]>} names と同じ長さ・同順のカテゴリ配列
 */
export async function categorizeBatch(names, env) {
  if (names.length === 0) return []

  // 1. まず辞書で全件を試みる
  const results = names.map(n => categorizeByDictionary(n))

  // 2. 辞書ミスのインデックスだけ収集
  const missIndices = results.map((r, i) => r === null ? i : -1).filter(i => i !== -1)

  if (missIndices.length === 0 || !env?.ANTHROPIC_API_KEY) {
    // 辞書ミスなし、またはAPIキー未設定 → ミス分はその他で確定
    return results.map(r => r ?? 'その他')
  }

  try {
    const missNames = missIndices.map(i => names[i])
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const categoryList = CATEGORIES.filter(c => c !== 'その他').join('、')
    const numbered = missNames.map((n, i) => `${i + 1}. ${n}`).join('\n')

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: missNames.length * 15 + 20,
      system: `あなたはスーパーマーケットの商品分類AIです。番号付きの商品名リストを受け取り、各商品に対応するカテゴリ名のみをJSON配列で返してください。配列の順番・長さは入力と同じにしてください。カテゴリ以外の文字・説明は不要です。\nカテゴリ: ${categoryList}`,
      messages: [{ role: 'user', content: numbered }],
    })

    const raw = msg.content[0]?.text?.trim() ?? '[]'
    // JSON配列を抽出（前後の余分な文字を除去）
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    missIndices.forEach((origIdx, j) => {
      const cat = parsed[j]
      results[origIdx] = (typeof cat === 'string' && CATEGORIES.includes(cat)) ? cat : 'その他'
    })
  } catch {
    // Haiku 失敗時はミス分をその他に
    missIndices.forEach(i => { results[i] = 'その他' })
  }

  return results.map(r => r ?? 'その他')
}
