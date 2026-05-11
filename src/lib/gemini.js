import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
export const GEMINI_MODEL = 'gemini-2.5-flash';

let _client = null;
function getClient() {
  if (!_client) {
    if (!apiKey) throw new Error('VITE_GEMINI_API_KEY is not set in .env');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export async function geminiGenerate(prompt) {
  const res = await getClient().models.generateContent({ model: GEMINI_MODEL, contents: prompt });
  return res.text;
}

// Multi-turn: history = [{role:'user'|'ai', text}], newMessage = string
export async function geminiMultiTurn(history, newMessage) {
  const contents = [
    ...history.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: newMessage }] },
  ];
  const res = await getClient().models.generateContent({ model: GEMINI_MODEL, contents });
  return res.text;
}
