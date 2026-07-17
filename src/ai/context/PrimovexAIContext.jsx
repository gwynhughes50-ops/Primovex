import { createContext, useCallback, useMemo, useState } from 'react';
import { getPrimovexAIProvider } from '../providers/providerFactory';
import { AI_STATES, assertProviderResponse, createMessage } from '../types/responseContract';
import { useAuth } from '@/contexts/AuthContext';

export const PrimovexAIContext = createContext(null);

export function PrimovexAIProvider({ children }) {
  const { capabilities, role, user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState(AI_STATES.IDLE);
  const [messages, setMessages] = useState([]);
  const provider = useMemo(() => getPrimovexAIProvider('mock'), []);

  const ask = useCallback(async (prompt) => {
    const cleanPrompt = String(prompt || '').trim();
    if (!cleanPrompt || status === AI_STATES.SEARCHING || status === AI_STATES.REASONING) return;

    setMessages((current) => [...current, createMessage({ role: 'user', content: cleanPrompt })]);
    setStatus(AI_STATES.SEARCHING);

    try {
      const providerRequest = provider.ask({
        prompt: cleanPrompt,
        toolContext: { capabilities, role, userId: user?.uid || null, profile, conversation: messages },
      });
      const timeout = new Promise((_, reject) => window.setTimeout(() => reject(new Error('Orb request timed out')), 8000));
      const raw = await Promise.race([providerRequest, timeout]);
      setStatus(AI_STATES.REASONING);
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      const response = assertProviderResponse(raw);
      setMessages((current) => [
        ...current,
        createMessage({
          role: 'assistant',
          content: response.answer,
          confidence: response.confidence,
          sources: response.sources,
          actions: response.actions,
          intent: response.intent,
        }),
      ]);
      setStatus(AI_STATES.RESPONDING);
      window.setTimeout(() => setStatus(AI_STATES.IDLE), 320);
    } catch (error) {
      console.error('Primovex AI request failed:', error);
      setMessages((current) => [
        ...current,
        createMessage({ role: 'assistant', content: 'Primovex AI could not complete that request.', error: true }),
      ]);
      setStatus(AI_STATES.ERROR);
    }
  }, [capabilities, messages, profile, provider, role, status, user?.uid]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setStatus(AI_STATES.IDLE);
  }, []);

  const value = useMemo(() => ({
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((current) => !current),
    status,
    messages,
    ask,
    clearConversation,
  }), [ask, clearConversation, isOpen, messages, status]);

  return <PrimovexAIContext.Provider value={value}>{children}</PrimovexAIContext.Provider>;
}
