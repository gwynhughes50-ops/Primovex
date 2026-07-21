import { createContext, useCallback, useMemo, useState } from 'react';
import { getOrbEngine } from '@/orb';
import { AI_STATES, assertProviderResponse, createMessage } from '../types/responseContract';
import { useAuth } from '@/contexts/AuthContext';
import { orbIntentLearningStore } from '@/orb/IntentLearningStore';

export const PrimovexAIContext = createContext(null);

export function PrimovexAIProvider({ children }) {
  const { capabilities, role, user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState(AI_STATES.IDLE);
  const [messages, setMessages] = useState([]);
  const orb = useMemo(() => getOrbEngine(), []);

  const ask = useCallback(async (prompt, options = {}) => {
    const cleanPrompt = String(prompt || '').trim();
    if (!cleanPrompt || status === AI_STATES.SEARCHING || status === AI_STATES.REASONING) return;

    setMessages((current) => [...current, createMessage({ role: 'user', content: cleanPrompt })]);
    setStatus(AI_STATES.SEARCHING);

    try {
      const providerRequest = orb.ask({
        input: cleanPrompt,
        inputType: 'text',
        context: { capabilities, role, userId: user?.uid || null, profile, forcedIntent: options.forcedIntent || null },
        conversation: messages,
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
          warnings: response.warnings,
          modulesUsed: response.modulesUsed,
          auditId: response.auditId,
          confidenceBand: response.confidenceBand,
          clarification: response.clarification,
          request: cleanPrompt,
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
  }, [capabilities, messages, orb, profile, role, status, user?.uid]);

  const resolveClarification = useCallback(async (messageId, selectedIntent) => {
    const message = messages.find((item) => item.id === messageId);
    const clarification = message?.clarification;
    if (!clarification?.originalRequest || !selectedIntent || !clarification.choices?.some((choice) => choice.id === selectedIntent)) return;
    const suggestion = orbIntentLearningStore.create({ phrase: clarification.originalRequest, selectedIntent, userId: user?.uid || null, role, siteId: profile?.siteId || profile?.practiceId || 'primary', originalConfidence: clarification.originalConfidence, candidates: clarification.candidates });
    orb.audit.writeLearning({ suggestion, context: { userId: user?.uid || null, role, siteId: profile?.siteId || profile?.practiceId || 'primary' } });
    setMessages((current) => current.map((item) => item.id === messageId ? { ...item, clarification: { ...item.clarification, resolvedIntent: selectedIntent, suggestionId: suggestion.id } } : item));
    await ask(clarification.originalRequest, { forcedIntent: selectedIntent });
  }, [ask, messages, orb, profile?.practiceId, profile?.siteId, role, user?.uid]);

  const recordFeedback = useCallback((messageId, outcome, reason = null, note = null) => {
    const record = orb.feedback.record({ interactionId: messageId, outcome, reason, note, userId: user?.uid || null });
    setMessages((current) => current.map((item) => item.id === messageId ? { ...item, feedback: record } : item));
    return record;
  }, [orb, user?.uid]);

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
    resolveClarification,
    recordFeedback,
    clearConversation,
  }), [ask, clearConversation, isOpen, messages, recordFeedback, resolveClarification, status]);

  return <PrimovexAIContext.Provider value={value}>{children}</PrimovexAIContext.Provider>;
}
