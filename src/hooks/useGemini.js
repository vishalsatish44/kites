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
      // Inject system context only on the very first message
      const messageToSend = systemContext && prevHistory.length === 0
        ? `${systemContext}\n\nUser: ${text}`
        : text;
      const reply = await geminiMultiTurn(prevHistory, messageToSend);
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
