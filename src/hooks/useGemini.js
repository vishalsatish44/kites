import { useState, useCallback, useRef } from 'react';
import { geminiGenerate, geminiMultiTurn } from '../lib/gemini';

// Single-shot generations (WBR writer, forecast, coaching, follow-up)
export function useGemini() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const ask = useCallback(async (prompt) => {
    setLoading(true);
    setError(null);
    try {
      return await geminiGenerate(prompt);
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { ask, loading, error };
}

// Multi-turn chat (global chat widget)
// systemContext is passed as a proper Gemini systemInstruction so it doesn't
// pollute the conversation history and is applied to every turn.
export function useGeminiChat() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const historyRef = useRef([]);

  const send = useCallback(async (text, systemContext = '') => {
    const userMsg = { role: 'user', text };
    const prevHistory = historyRef.current;
    historyRef.current = [...prevHistory, userMsg];
    setMessages([...historyRef.current]);
    setLoading(true);

    try {
      const reply = await geminiMultiTurn(prevHistory, text, systemContext);
      const aiMsg = { role: 'ai', text: reply };
      historyRef.current = [...historyRef.current, aiMsg];
      setMessages([...historyRef.current]);
      return reply;
    } catch (e) {
      const errMsg = { role: 'ai', text: `Sorry, something went wrong: ${e.message}`, error: true };
      historyRef.current = [...historyRef.current, errMsg];
      setMessages([...historyRef.current]);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    historyRef.current = [];
    setMessages([]);
  }, []);

  return { messages, send, reset, loading };
}
