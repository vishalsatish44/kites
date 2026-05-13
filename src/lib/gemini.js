const BASE_URL = 'https://aiplatform.googleapis.com/v1';
const MODEL    = 'publishers/google/models/gemini-2.5-flash';

function getKey() {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error('VITE_GEMINI_API_KEY is not set in .env');
  return key;
}

async function callGemini(body) {
  const url = `${BASE_URL}/${MODEL}:generateContent?key=${getKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function geminiGenerate(prompt) {
  return callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
}

// history = [{role:'user'|'ai', text}], systemInstruction = string
export async function geminiMultiTurn(history, newMessage, systemInstruction = '') {
  const contents = [
    ...history.map(m => ({
      role: m.role === 'ai' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    { role: 'user', parts: [{ text: newMessage }] },
  ];
  const body = { contents };
  if (systemInstruction) {
    body.systemInstruction = { role: 'system', parts: [{ text: systemInstruction }] };
  }
  return callGemini(body);
}
