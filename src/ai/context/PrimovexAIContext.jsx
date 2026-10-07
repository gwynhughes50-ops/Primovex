import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { getOrbEngine } from '@/orb';
import { AI_STATES, assertProviderResponse, createMessage } from '../types/responseContract';
import { useAuth } from '@/contexts/AuthContext';
import { orbIntentLearningStore } from '@/orb/IntentLearningStore';
import { orbKnowledgeStore } from '@/orb/OrbKnowledgeStore';
import { proposalProblem } from '@/orb/actionProposals';
import { applyOrbScope } from '@/lib/orbScope';
import { executeProposal } from '@/orb/actionExecutors';

export const PrimovexAIContext = createContext(null);

export function PrimovexAIProvider({ children }) {
  const { capabilities: roleCapabilities, role, user, profile } = useAuth();
  // What the Orb may use for this person: their role's permissions, limited to the topics an
  // administrator has ticked for them (everything, if none were set).
  const capabilities = useMemo(() => applyOrbScope(roleCapabilities, profile?.orbScope), [roleCapabilities, profile?.orbScope]);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState(AI_STATES.IDLE);
  const [messages, setMessages] = useState([]);
  const orb = useMemo(() => getOrbEngine(), []);

  // The knowledge store subscribes to Firestore lazily on first use — without
  // this, the very first Orb question of a session would race an empty cache
  // (onSnapshot's own callback is always async, even for local writes), so a
  // freshly taught fact could look unknown until some other query happened
  // to warm it. Triggering the subscription at app mount instead means it's
  // almost always already warm by the time anyone actually asks Orb anything.
  useEffect(() => { orbKnowledgeStore.list(); }, []);

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
      const timeout = new Promise((_, reject) => window.setTimeout(() => reject(new Error('Orb request timed out')), 14000));
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
          followUps: response.followUps,
          proposal: response.proposal,
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
    const suggestion = await orbIntentLearningStore.create({ phrase: clarification.originalRequest, selectedIntent, userId: user?.uid || null, role, siteId: profile?.siteId || profile?.practiceId || 'primary', originalConfidence: clarification.originalConfidence, candidates: clarification.candidates });
    orb.audit.writeLearning({ suggestion, context: { userId: user?.uid || null, role, siteId: profile?.siteId || profile?.practiceId || 'primary' } });
    setMessages((current) => current.map((item) => item.id === messageId ? { ...item, clarification: { ...item.clarification, resolvedIntent: selectedIntent, suggestionId: suggestion.id } } : item));
    await ask(clarification.originalRequest, { forcedIntent: selectedIntent });
  }, [ask, messages, orb, profile?.practiceId, profile?.siteId, role, user?.uid]);

  const recordFeedback = useCallback((messageId, outcome, reason = null, note = null) => {
    const record = orb.feedback.record({ interactionId: messageId, outcome, reason, note, userId: user?.uid || null });
    setMessages((current) => current.map((item) => item.id === messageId ? { ...item, feedback: record } : item));
    return record;
  }, [orb, user?.uid]);

  // Orb proposals: nothing happens until the person presses Confirm on the card. The check is made
  // again here (permission, expiry, run once) and the real work is done by src/orb/actionExecutors.js.
  const patchProposal = useCallback((messageId, patch) => {
    setMessages((current) => current.map((item) => (item.id === messageId && item.proposal ? { ...item, proposal: { ...item.proposal, ...patch } } : item)));
  }, []);

  const confirmProposal = useCallback(async (messageId) => {
    const proposal = messages.find((item) => item.id === messageId)?.proposal;
    const problem = proposalProblem(proposal, { capabilities });
    if (problem) {
      if (proposal && proposal.status === 'proposed') patchProposal(messageId, { status: 'failed', result: problem });
      return;
    }
    patchProposal(messageId, { status: 'working' });
    try {
      const actor = {
        uid: user?.uid || null,
        displayName: profile?.displayName || user?.displayName || profile?.email || user?.email || 'Unknown',
        email: profile?.email || user?.email || null,
      };
      const result = await executeProposal(proposal, { actor });
      patchProposal(messageId, { status: 'done', result });
    } catch (error) {
      console.error('Orb proposal failed:', error);
      patchProposal(messageId, { status: 'failed', result: error?.message || 'That did not work. Nothing was changed.' });
    }
  }, [capabilities, messages, patchProposal, profile, user]);

  const cancelProposal = useCallback((messageId) => {
    const proposal = messages.find((item) => item.id === messageId)?.proposal;
    if (proposal?.status === 'proposed') patchProposal(messageId, { status: 'cancelled', result: 'Cancelled. Nothing was done.' });
  }, [messages, patchProposal]);

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
    confirmProposal,
    cancelProposal,
    clearConversation,
  }), [ask, cancelProposal, clearConversation, confirmProposal, isOpen, messages, recordFeedback, resolveClarification, status]);

  return <PrimovexAIContext.Provider value={value}>{children}</PrimovexAIContext.Provider>;
}
