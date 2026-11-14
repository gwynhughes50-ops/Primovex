import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getOrbEngine } from '@/orb';
import { AI_STATES, assertProviderResponse, createMessage } from '../types/responseContract';
import { useAuth } from '@/contexts/AuthContext';
import { orbIntentLearningStore } from '@/orb/IntentLearningStore';
import { orbKnowledgeStore } from '@/orb/OrbKnowledgeStore';
import { proposalProblem } from '@/orb/actionProposals';
import { applyOrbScope } from '@/lib/orbScope';
import { mergeUseSentence } from '@/ai/stock/stockUse';
import { executeProposal } from '@/orb/actionExecutors';
import { checkAskInput } from '@/ai/guard/askGuard';
import { redactText } from '@/ai/guard/patientGuard';
import { loadStaffNames } from '@/ai/guard/staffNames';

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
  const { pathname } = useLocation(); // the page the person is on, so "explain this page" knows which

  // Going to another page starts Ask Primovex afresh: the conversation was about the page they were on. An answer still on its way when they leave
  // is dropped (the generation moves on), so it does not turn up on the new page.
  const generation = useRef(0);
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    generation.current += 1;
    setMessages([]);
    setStatus(AI_STATES.IDLE);
  }, [pathname]);

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
    const startedOn = generation.current;

    // A card is waiting for a yes and they name more stock ("and two more gloves"): it all goes on one card.
    let engineInput = cleanPrompt;
    const lastAssistant = [...messages].reverse().find((item) => item.role === 'assistant');
    if (lastAssistant?.proposal?.status === 'proposed') {
      const merged = mergeUseSentence(lastAssistant.proposal, cleanPrompt);
      if (merged) {
        engineInput = merged;
        setMessages((current) => current.map((item) => (item.id === lastAssistant.id ? { ...item, proposal: { ...item.proposal, status: 'cancelled', result: 'Added to the next card.' } } : item)));
      }
    }

    // A patient is named by EMIS number, date of birth and initials, never a name: anything that looks like a name (or an NHS number, phone number,
    // email, postcode or address) is refused here, before it is classified or sent anywhere, and the person is told why. What stays in the
    // conversation has what was found blanked out. Nothing is logged.
    if (!options.forcedIntent) {
      const staff = await loadStaffNames(profile?.displayName);
      if (generation.current !== startedOn) return;
      const guard = checkAskInput(engineInput, { allow: staff, conversation: messages });
      if (!guard.ok) {
        setMessages((current) => [
          ...current,
          createMessage({ role: 'user', content: redactText(options.displayText || cleanPrompt, guard.problems) }),
          createMessage({ role: 'assistant', content: guard.message, confidence: 1, intent: 'privacy.blocked' }),
        ]);
        setStatus(AI_STATES.IDLE);
        return;
      }
    }

    setMessages((current) => [...current, createMessage({ role: 'user', content: options.displayText || cleanPrompt })]);
    setStatus(AI_STATES.SEARCHING);

    try {
      const providerRequest = orb.ask({
        input: engineInput,
        inputType: 'text',
        context: { capabilities, role, userId: user?.uid || null, profile, page: pathname, forcedIntent: options.forcedIntent || null },
        conversation: messages,
      });
      const timeout = new Promise((_, reject) => window.setTimeout(() => reject(new Error('Ask Primovex request timed out')), 14000));
      const raw = await Promise.race([providerRequest, timeout]);
      if (generation.current !== startedOn) return;
      setStatus(AI_STATES.REASONING);
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      if (generation.current !== startedOn) return;
      const response = assertProviderResponse(raw);
      // A card still waiting that this answer rebuilds (a count with more items added) is replaced, not left beside it.
      const replaces = lastAssistant?.pending && lastAssistant.proposal?.status === 'proposed' && response.proposal?.kind === lastAssistant.proposal.kind ? lastAssistant.id : null;
      setMessages((current) => [
        ...(replaces ? current.map((item) => (item.id === replaces ? { ...item, proposal: { ...item.proposal, status: 'cancelled', result: 'Updated below.' } } : item)) : current),
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
          pending: response.data?.pending || null,
        }),
      ]);
      setStatus(AI_STATES.RESPONDING);
      window.setTimeout(() => setStatus(AI_STATES.IDLE), 320);
    } catch (error) {
      console.error('Primovex AI request failed:', error);
      if (generation.current !== startedOn) return;
      setMessages((current) => [
        ...current,
        createMessage({ role: 'assistant', content: 'Ask Primovex could not complete that request. Try again in a moment.', error: true }),
      ]);
      setStatus(AI_STATES.ERROR);
    }
  }, [capabilities, messages, orb, pathname, profile, role, status, user?.uid]);

  // Something they said that isn't a question (yes, cancel, a choice), kept in the conversation.
  const addUserMessage = useCallback((text) => {
    const clean = String(text || '').trim();
    if (clean) setMessages((current) => [...current, createMessage({ role: 'user', content: clean })]);
  }, []);

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
    addUserMessage,
    resolveClarification,
    recordFeedback,
    confirmProposal,
    cancelProposal,
    clearConversation,
  }), [ask, addUserMessage, cancelProposal, clearConversation, confirmProposal, isOpen, messages, recordFeedback, resolveClarification, status]);

  return <PrimovexAIContext.Provider value={value}>{children}</PrimovexAIContext.Provider>;
}
