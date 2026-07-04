import { GoogleGenAI } from '@google/genai'
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
 * Gemini による分類（未知語のみ呼び出し）
 */
async function categorizeByGemini(name, apiKey) {
  const ai = new GoogleGenAI({ apiKey })
  const categoryList = CATEGORIES.filter(c => c !== 'その他').join('、')
  const msg = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: name,
    config: {
      systemInstruction: `あなたはスーパーマーケットの商品分類AIです。商品名を受け取り、以下のカテゴリのうち最も適切な1つを、そのままの文字列で返してください。カテゴリ以外の文字は一切含めないでください。\nカテゴリ: ${categoryList}`,
      maxOutputTokens: 20,
      temperature: 0.0,
    }
  })
  const result = msg.text?.trim() ?? ''
  return CATEGORIES.includes(result) ? result : null
}

/**
 * ハイブリッド分類: 辞書 → Gemini → 'その他'
 * env.GEMINI_API_KEY が未設定なら辞書のみ。エラーは握りつぶし 'その他' にフォールバック。
 */
export async function categorize(name, env) {
  try {
    const byDict = categorizeByDictionary(name)
    if (byDict) return byDict

    if (env?.GEMINI_API_KEY) {
      const byGemini = await categorizeByGemini(name, env.GEMINI_API_KEY)
      if (byGemini) return byGemini
    }
  } catch {
    // API障害・ネットワーク不達などは無視して 'その他' へ
  }
  return 'その他'
}

/**
 * バッチ分類: 辞書ミスの商品だけ Gemini に1回でまとめて問い合わせる。
 * @param {string[]} names
 * @param {object} env  — GEMINI_API_KEY を持つ Cloudflare env
 * @returns {Promise<string[]>} names と同じ長さ・同順のカテゴリ配列
 */
export async function categorizeBatch(names, env) {
  if (names.length === 0) return []

  // 1. まず辞書で全件を試みる
  const results = names.map(n => categorizeByDictionary(n))

  // 2. 辞書ミスのインデックスだけ収集
  const missIndices = results.map((r, i) => r === null ? i : -1).filter(i => i !== -1)

  if (missIndices.length === 0 || !env?.GEMINI_API_KEY) {
    // 辞書ミスなし、またはAPIキー未設定 → ミス分はその他で確定
    return results.map(r => r ?? 'その他')
  }

  try {
    const missNames = missIndices.map(i => names[i])
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
    const categoryList = CATEGORIES.filter(c => c !== 'その他').join('、')
    const numbered = missNames.map((n, i) => `${i + 1}. ${n}`).join('\n')

    const msg = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: numbered,
      config: {
        systemInstruction: `あなたはスーパーマーケットの商品分類AIです。番号付きの商品名リストを受け取り、各商品に対応するカテゴリ名のみをJSON配列で返してください。配列の順番・長さは入力と同じにしてください。カテゴリ以外の文字・説明は不要です。\nカテゴリ: ${categoryList}`,
        responseMimeType: 'application/json',
        temperature: 0.0,
      }
    })

    const raw = msg.text?.trim() ?? '[]'
    let parsed = []
    try {
      parsed = JSON.parse(raw)
    } catch {
      // JSON配列を抽出（前後の余分な文字を除去）
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : []
    }

    missIndices.forEach((origIdx, j) => {
      const cat = parsed[j]
      results[origIdx] = (typeof cat === 'string' && CATEGORIES.includes(cat)) ? cat : 'その他'
    })
  } catch {
    // Gemini 失敗時はミス分をその他に
    missIndices.forEach(i => { results[i] = 'その他' })
  }

  return results.map(r => r ?? 'その他')
}
