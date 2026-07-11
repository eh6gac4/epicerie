import { GoogleGenAI } from '@google/genai'

export async function extractItemsFromMedia(mimeType, base64Data, env) {
  if (!env?.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured.')
  }
  
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  const prompt = `あなたは買い物リスト抽出AIです。画像やPDFの内容（レシート、チラシ、メモなど）から買い物リスト（商品名、数量、単位、メモ）を抽出してください。必ずJSON配列の形式で返してください。
形式の例:
[
  {"name": "にんじん", "quantity": "3", "unit": "本", "note": "オーガニック"},
  {"name": "牛乳", "quantity": "1", "unit": "L", "note": ""}
]
もし買い物リストが見つからない場合は空の配列 [] を返してください。不要な説明やマークダウンタグ(\`\`\`jsonなど)は省いて、純粋なJSON文字列だけを出力してください。`

  const msg = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      prompt,
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      }
    ],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.0
    }
  })

  const raw = msg.text?.trim() ?? '[]'
  try {
    return JSON.parse(raw)
  } catch {
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : []
  }
}
