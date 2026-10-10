import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, CheckCircle2, ExternalLink, Meh, Mic, MicOff, RotateCcw, ShieldCheck, TriangleAlert, X, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import usePrimovexAI from '../hooks/usePrimovexAI';
import PulseOrbFace from '@/components/pulse/PulseOrbFace';
import { AI_STATES } from '../types/responseContract';
import { interpretSpoken, spokenReply } from '../voice/spokenCommands';
import { cancelNativeListening, nativeVoiceAvailable, requestNativeMicrophonePermission, startNativeListening, stopNativeListening, subscribeNativeOrbVoice } from '../voice/nativeOrbVoice';

const SUGGESTIONS = [
  'Are all fridges OK today?',
  'Tell me about Fridge 2.',
  'What needs attention today?',
  'Which stock is low?',
  'What changed since yesterday?',
  'How do I add a new product to stock?',
  'How many significant events are open?',
];

const STATUS_LABELS = {
  [AI_STATES.IDLE]: 'Ready',
  [AI_STATES.LISTENING]: 'Listening',
  [AI_STATES.SEARCHING]: 'Searching',
  [AI_STATES.REASONING]: 'Thinking',
  [AI_STATES.RESPONDING]: 'Speaking',
  [AI_STATES.ERROR]: 'Needs attention',
};

const VOICE_STATES = {
  SLEEPING: 'sleeping',
  WAKING: 'waking',
  LISTENING: 'listening',
  THINKING: 'thinking',
  FOLLOW_UP: 'follow-up',
};

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

const FEEDBACK_OPTIONS = [
  { id: 'exact', label: 'Perfect', icon: CheckCircle2 },
  { id: 'nearly', label: 'Almost', icon: Meh },
  { id: 'corrected', label: 'Needed correction', icon: TriangleAlert },
  { id: 'wrong', label: 'Wrong', icon: XCircle },
];

const CORRECTION_REASONS = ['Wrong intent', 'Wrong item', 'Wrong space', 'Missed information', 'Too much detail', 'Not enough detail'];

function MessageFeedback({ message, onRecord }) {
  const [pendingOutcome, setPendingOutcome] = useState(null);
  if (message.feedback) return <p className="primovex-ai-faint mt-2 text-xs">Feedback recorded: {message.feedback.outcome.replace('-', ' ')}</p>;
  const choose = (outcome) => {
    if (outcome === 'corrected' || outcome === 'wrong') setPendingOutcome(outcome);
    else onRecord(message.id, outcome);
  };
  return <div className="mt-2 rounded-xl border border-[var(--medtrak-border)] p-2">
    <p className="primovex-ai-faint mb-2 text-xs font-semibold">Did Orb understand and help?</p>
    <div className="flex flex-wrap gap-1.5">{FEEDBACK_OPTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => choose(id)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--medtrak-border)] px-2 py-1 text-[11px]"><Icon className="h-3 w-3" />{label}</button>)}</div>
    {pendingOutcome && <div className="mt-2"><p className="primovex-ai-faint mb-1 text-[11px]">What needed changing?</p><div className="flex flex-wrap gap-1">{CORRECTION_REASONS.map((reason) => <button key={reason} type="button" onClick={() => onRecord(message.id, pendingOutcome, reason)} className="rounded-lg bg-[var(--medtrak-accent)]/10 px-2 py-1 text-[11px] text-[var(--medtrak-accent)]">{reason}</button>)}</div></div>}
  </div>;
}

// How long the Orb keeps listening when nobody speaks, and how it waits between listens.
const SESSION_SILENCE_MS = 15000;
const RESTART_DELAY_MS = 250;
// Android's speech recogniser codes that mean "nothing was said / try again" rather than "this can't work".
const FATAL_VOICE_CODES = new Set(['not-allowed', 'service-not-allowed', '9']);

function speakText(text) {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !text) { resolve(); return; }
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-GB';
      utterance.rate = 1.05;
      utterance.onend = resolve;
      utterance.onerror = resolve;
      synth.speak(utterance);
      window.setTimeout(resolve, 12000);
    } catch { resolve(); }
  });
}

export default function AskPrimovexPanel({ variant = 'desktop' }) {
  const navigate = useNavigate();
  const { isOpen, close, status, messages, ask, addUserMessage, clearConversation, resolveClarification, recordFeedback, confirmProposal, cancelProposal } = usePrimovexAI();
  const [prompt, setPrompt] = useState('');
  const [voiceState, setVoiceState] = useState(VOICE_STATES.SLEEPING);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [voiceError, setVoiceError] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [speakAnswers, setSpeakAnswers] = useState(() => { try { return window.localStorage.getItem('primovex.orb.speak') === '1'; } catch { return false; } });
  const recognitionRef = useRef(null);
  const voiceStateRef = useRef(VOICE_STATES.SLEEPING);
  // One conversation: the microphone is opened again after every reply until they finish, or go quiet.
  const sessionRef = useRef({ active: false, lastActivity: 0, errors: 0, lastCode: '' });
  const timerRef = useRef(null);
  const messagesRef = useRef(messages);
  const speakRef = useRef(speakAnswers);
  const listenOnceRef = useRef(() => {});
  const listenFailedRef = useRef(() => {});
  const utteranceRef = useRef(() => {});
  const startSessionRef = useRef(() => {});
  const processTextRef = useRef(async () => 'done');
  const endRef = useRef(null);
  const busy = status === AI_STATES.SEARCHING || status === AI_STATES.REASONING;
  const isMobile = variant === 'mobile';
  messagesRef.current = messages;
  speakRef.current = speakAnswers;

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  const stopRecognition = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* recognition may already be stopped */ }
    recognitionRef.current = null;
    try { stopNativeListening(); } catch { /* native listener may already be stopped */ }
  }, []);

  // Beeps from the phone's recogniser every time it re-opens would be maddening in a clinic.
  const muteBeeps = useCallback((muted) => {
    try { window.PrimovexOrbVoice?.muteBeeps?.(muted); } catch { /* optional */ }
  }, []);

  const endSession = useCallback((message = '') => {
    window.clearTimeout(timerRef.current);
    sessionRef.current.active = false;
    stopRecognition();
    muteBeeps(false);
    try { window.speechSynthesis?.cancel(); } catch { /* optional */ }
    if (message) setVoiceError(message);
    setPartialTranscript('');
    setVoiceState(VOICE_STATES.SLEEPING);
  }, [muteBeeps, stopRecognition]);
  const sleepOrb = endSession;

  // A listen has finished (with words, or without): open the microphone again, or finish if it has been quiet.
  const afterTurn = useCallback(() => {
    const session = sessionRef.current;
    if (!session.active) return;
    if (Date.now() - session.lastActivity >= SESSION_SILENCE_MS) { endSession(); return; }
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => listenOnceRef.current(), RESTART_DELAY_MS + Math.min(session.errors, 6) * 250);
  }, [endSession]);

  const listenFailed = useCallback((code) => {
    const session = sessionRef.current;
    if (!session.active) return;
    if (FATAL_VOICE_CODES.has(String(code))) {
      setVoiceSupported(false);
      endSession('Microphone permission was denied. Enable it in Android Settings to use Orb voice.');
      return;
    }
    session.errors += 1;
    if (session.errors >= 12) { endSession('Voice is not working right now. Tap the Orb to try again.'); return; }
    setVoiceState(VOICE_STATES.FOLLOW_UP);
    afterTurn();
  }, [afterTurn, endSession]);

  const beginListening = useCallback((wakeOnly = false) => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setVoiceSupported(false);
      return;
    }

    stopRecognition();
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';
    let finalText = '';
    let errored = false;

    recognition.onstart = () => setVoiceState(wakeOnly ? VOICE_STATES.SLEEPING : VOICE_STATES.LISTENING);
    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) finalText += transcript;
        else interim += transcript;
      }
      const heard = `${finalText} ${interim}`.trim();
      if (!wakeOnly) setPartialTranscript(heard);
      if (wakeOnly && /\borb\b/i.test(heard)) {
        setVoiceState(VOICE_STATES.WAKING);
        recognition.stop();
      }
    };
    recognition.onerror = (event) => {
      errored = true;
      if (!['no-speech', 'aborted'].includes(event.error)) console.warn('Orb voice recognition:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setVoiceSupported(false);
      if (sessionRef.current.active && !wakeOnly) { listenFailedRef.current(event.error); return; }
      setVoiceState(VOICE_STATES.SLEEPING);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (wakeOnly) {
        if (voiceStateRef.current === VOICE_STATES.WAKING || /\borb\b/i.test(finalText)) {
          window.setTimeout(() => startSessionRef.current(), 220);
        }
        return;
      }
      const clean = finalText.trim().replace(/^orb[,.]?\s*/i, '');
      setPartialTranscript('');
      if (!sessionRef.current.active) return;
      if (clean) utteranceRef.current(clean);
      else if (!errored) listenFailedRef.current('no-speech');
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [stopRecognition]);

  // Every spoken or typed line is understood against what is on screen: a card waiting for a yes, or
  // the choices just offered. Anything else is a normal request. Returns 'end' if they said they're done.
  const processText = useCallback(async (text) => {
    const list = messagesRef.current;
    const last = [...list].reverse().find((item) => item.role === 'assistant');
    const waiting = last?.proposal?.status === 'proposed' ? last : null;
    const options = Array.isArray(last?.followUps) ? last.followUps : [];
    const heard = interpretSpoken(text, { options, hasProposal: Boolean(waiting) });
    if (heard.type === 'end') return 'end';
    if (heard.type === 'empty') return 'done';
    if (heard.type === 'confirm') { addUserMessage(text); await confirmProposal(waiting.id); return 'done'; }
    if (heard.type === 'cancel') { addUserMessage(text); cancelProposal(waiting.id); return 'done'; }
    if (heard.type === 'choice') {
      const option = options[heard.index];
      await ask(typeof option === 'string' ? option : option.ask, { displayText: text });
      return 'done';
    }
    await ask(text);
    return 'done';
  }, [addUserMessage, ask, cancelProposal, confirmProposal]);
  processTextRef.current = processText;

  // Something was said during a conversation.
  const handleUtterance = useCallback(async (text) => {
    const session = sessionRef.current;
    session.lastActivity = Date.now();
    session.errors = 0;
    setVoiceState(VOICE_STATES.THINKING);
    let outcome = 'done';
    try { outcome = await processTextRef.current(text); } catch (error) { console.error('Orb voice request failed:', error); }
    if (!session.active) return;
    if (outcome === 'end') { endSession(); return; }
    setVoiceState(VOICE_STATES.FOLLOW_UP);
    if (speakRef.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 400)); // let the reply appear first
      const latest = [...messagesRef.current].reverse().find((item) => item.role === 'assistant');
      await speakText(spokenReply(latest));
    }
    session.lastActivity = Date.now();
    afterTurn();
  }, [afterTurn, endSession]);

  const startSession = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setVoiceError('');
    setPartialTranscript('');
    sessionRef.current = { active: true, lastActivity: Date.now(), errors: 0, lastCode: '' };
    muteBeeps(true);
    setVoiceState(VOICE_STATES.WAKING);
    if (nativeVoiceAvailable()) requestNativeMicrophonePermission();
    timerRef.current = window.setTimeout(() => listenOnceRef.current(), 240);
  }, [muteBeeps]);
  const wakeOrb = startSession;

  useEffect(() => {
    utteranceRef.current = handleUtterance;
    listenFailedRef.current = listenFailed;
    startSessionRef.current = startSession;
    listenOnceRef.current = () => {
      if (!sessionRef.current.active) return;
      if (nativeVoiceAvailable()) startNativeListening();
      else beginListening(false);
    };
  }, [beginListening, handleUtterance, listenFailed, startSession]);

  useEffect(() => subscribeNativeOrbVoice(({ type, value }) => {
    const active = sessionRef.current.active;
    if (type === 'permission') {
      if (value === 'denied') {
        setVoiceSupported(false);
        endSession('Microphone permission was denied. Enable it in Android Settings to use Orb voice.');
      }
      return;
    }
    if (!active) return;
    if (type === 'started' || type === 'speech-begin') {
      setVoiceError('');
      setPartialTranscript('');
      setVoiceState(VOICE_STATES.LISTENING);
      return;
    }
    if (type === 'partial') {
      setPartialTranscript(value || '');
      return;
    }
    if (type === 'error-code') {
      sessionRef.current.lastCode = String(value || '');
      return;
    }
    if (type === 'error') {
      const code = sessionRef.current.lastCode || value;
      sessionRef.current.lastCode = '';
      listenFailedRef.current(code);
      return;
    }
    if (type === 'final') {
      const clean = String(value || '').trim().replace(/^orb[,.]?\s*/i, '');
      setPartialTranscript('');
      if (!clean) listenFailedRef.current('empty');
      else utteranceRef.current(clean);
    }
  }), [endSession]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event) => event.key === 'Escape' && close();
    window.addEventListener('keydown', closeOnEscape);
    if (isMobile && !nativeVoiceAvailable() && getSpeechRecognition()) beginListening(true);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      endSession();
      try { cancelNativeListening(); } catch { /* no-op */ }
    };
  }, [beginListening, close, endSession, isMobile, isOpen]);

  useEffect(() => {
    if (!isMobile || voiceState === VOICE_STATES.SLEEPING) return;
    if (busy) setVoiceState(VOICE_STATES.THINKING);
  }, [busy, isMobile, voiceState]);

  const toggleSpeak = () => {
    const next = !speakAnswers;
    setSpeakAnswers(next);
    try { window.localStorage.setItem('primovex.orb.speak', next ? '1' : '0'); } catch { /* optional */ }
    if (!next) { try { window.speechSynthesis?.cancel(); } catch { /* optional */ } }
  };

  if (!isOpen) return null;

  const submit = async (event) => {
    event?.preventDefault();
    const next = prompt.trim();
    if (!next || busy) return;
    setPrompt('');
    await processText(next);
  };

  const panelClass = isMobile
    ? 'fixed inset-x-0 z-[140] rounded-t-[2rem]'
    : 'fixed bottom-6 right-6 top-6 z-[140] w-[min(470px,calc(100vw-3rem))]';

  const orbAwake = voiceState !== VOICE_STATES.SLEEPING;
  const orbLabel = voiceState === VOICE_STATES.LISTENING ? 'Listening' : voiceState === VOICE_STATES.THINKING ? 'Thinking' : voiceState === VOICE_STATES.FOLLOW_UP ? 'Anything else?' : voiceState === VOICE_STATES.WAKING ? 'Starting…' : 'Tap to talk';

  return (
    <aside
      className={`${panelClass} primovex-ai-panel flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl ${isMobile ? 'primovex-ai-mobile rounded-t-[2rem]' : 'rounded-3xl'}`}
      aria-label="Orb"
    >
      <header className="primovex-ai-divider flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className={`relative h-10 w-10 shrink-0 ${busy ? 'primovex-ai-breathe' : ''}`} aria-hidden="true"><PulseOrbFace size={40} active={busy} /></div>
          <div>
            <h2 className="font-bold">Orb</h2>
            <p className="primovex-ai-muted text-xs">{STATUS_LABELS[status]} · Operational intelligence</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={clearConversation} className="primovex-ai-icon-button rounded-full p-2" title="Clear conversation"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" onClick={() => { sleepOrb(); close(); }} className="primovex-ai-icon-button rounded-full p-2" title="Close Orb"><X className="h-5 w-5" /></button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isMobile && (
          <section className={`primovex-voice-stage ${orbAwake ? 'is-awake' : 'is-sleeping'}`} aria-live="polite">
            <button type="button" onClick={orbAwake ? sleepOrb : wakeOrb} className={`primovex-pulse-voice-orb state-${voiceState}`} aria-label={orbAwake ? 'Put Orb to sleep' : 'Wake Orb'}>
              <PulseOrbFace size={150} active={voiceState === VOICE_STATES.LISTENING || voiceState === VOICE_STATES.THINKING || voiceState === VOICE_STATES.WAKING} still={voiceState === VOICE_STATES.SLEEPING} />
            </button>
            <strong>{orbLabel}</strong>
            <span>{voiceError || partialTranscript || (voiceSupported ? (orbAwake ? 'Keep talking. Say “that’s all” when you are finished.' : 'Tap the Orb and talk. It keeps listening until you say “that’s all” or go quiet.') : 'Voice recognition is unavailable on this device. You can still type below.')}</span>
            {voiceSupported && (
              <button type="button" onClick={toggleSpeak} className="primovex-ai-muted mt-2 text-xs underline" aria-pressed={speakAnswers}>
                {speakAnswers ? 'Spoken answers: on' : 'Spoken answers: off'}
              </button>
            )}
          </section>
        )}

        {messages.length === 0 ? (
          <div>
            {!isMobile && (
              <div className="primovex-ai-accent-card rounded-2xl p-4">
                <div className="primovex-ai-accent-text flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Evidence-aware answers</div>
                <p className="primovex-ai-body mt-2 text-sm leading-6">Orb uses permission-checked operational tools and explains what Primovex currently knows.</p>
              </div>
            )}
            <p className="primovex-ai-faint mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.18em]">Try asking</p>
            <div className="grid gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="primovex-ai-suggestion flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm">
                  {suggestion}<ArrowRight className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'ml-8' : 'mr-4'}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'primovex-ai-user-message' : message.error ? 'primovex-ai-error-message' : 'primovex-ai-assistant-message'}`}>
                  {message.role === 'assistant' && <div className="primovex-ai-accent-text mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Bot className="h-4 w-4" /> Orb</div>}
                  <p className="primovex-ai-body" style={{ whiteSpace: 'pre-line' }}>{message.content}</p>
                  {message.intent !== 'general.unmatched' && Number.isFinite(message.confidence) && (
                    <div className="primovex-ai-message-divider primovex-ai-muted mt-3 flex items-center justify-between pt-2 text-xs"><span>Evidence confidence</span><span>{Math.round(message.confidence * 100)}%</span></div>
                  )}
                </div>
                {message.sources?.length > 0 && (
                  <div className="mt-2 grid gap-2">
                    {message.sources.map((source, index) => (
                      <div key={`${message.id}-source-${index}`} className="primovex-ai-source rounded-xl px-3 py-2"><p className="text-xs font-semibold">{source.title}</p><p className="primovex-ai-faint mt-1 text-xs">{source.detail}</p></div>
                    ))}
                  </div>
                )}
                {message.proposal && (
                  <div className="mt-2 rounded-xl border border-[var(--medtrak-accent)]/40 bg-[var(--medtrak-panel)] px-3 py-3 text-sm" aria-label="Action to confirm">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--medtrak-accent)]">{message.proposal.status === 'done' ? 'Done' : message.proposal.status === 'proposed' || message.proposal.status === 'working' ? 'Please confirm' : 'Not done'}</p>
                    <p className="mt-1 font-semibold">{message.proposal.title}</p>
                    <ul className="mt-1 space-y-0.5 text-xs primovex-ai-muted">{message.proposal.lines.map((line) => <li key={line}>{line}</li>)}</ul>
                    {message.proposal.result && <p className={`mt-2 text-xs ${message.proposal.status === 'done' ? 'text-emerald-500' : 'primovex-ai-muted'}`}>{message.proposal.result}</p>}
                    {(message.proposal.status === 'proposed' || message.proposal.status === 'working') && (
                      <div className="mt-3 flex gap-2">
                        <button type="button" disabled={message.proposal.status === 'working'} onClick={() => confirmProposal(message.id)} className="rounded-lg bg-[var(--medtrak-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{message.proposal.status === 'working' ? 'Working...' : message.proposal.confirmLabel}</button>
                        <button type="button" disabled={message.proposal.status === 'working'} onClick={() => cancelProposal(message.id)} className="rounded-lg border border-[var(--medtrak-border)] px-3 py-1.5 text-xs">Cancel</button>
                      </div>
                    )}
                  </div>
                )}
                {message.followUps?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2" aria-label="Suggested next questions">
                    {message.followUps.filter((q) => typeof q === 'object').length > 0 && (
                      <div className="grid w-full grid-cols-2 gap-2" role="group" aria-label="Choose one">
                        {message.followUps.filter((q) => typeof q === 'object').map((choice) => (
                          <button key={choice.label} type="button" onClick={() => ask(choice.ask)} disabled={busy} title={choice.hint}
                            className="rounded-xl border-2 px-3 py-2 text-left text-xs disabled:opacity-50"
                            style={{ borderColor: choice.color, background: `${choice.color}24`, color: 'var(--medtrak-text)' }}>
                            <span className="flex items-center gap-1.5 font-bold"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: choice.color }} aria-hidden="true" />{choice.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-4" style={{ color: 'var(--medtrak-muted)' }}>{choice.hint}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {message.followUps.filter((q) => typeof q === 'string').map((question) => (
                      <button key={question} type="button" onClick={() => ask(question)} disabled={busy} className="primovex-ai-suggestion inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-50">{(question.charAt(0).toUpperCase() + question.slice(1)).replace(/ i /g, ' I ')}<ArrowRight className="h-3 w-3" /></button>
                    ))}
                  </div>
                )}
                {message.actions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <button key={action.label} type="button" onClick={() => { close(); navigate(action.route); }} className="primovex-ai-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">{action.label}<ExternalLink className="h-3.5 w-3.5" /></button>
                    ))}
                  </div>
                )}
                {message.clarification?.choices?.length > 0 && !message.clarification.resolvedIntent && (
                  <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-xs font-semibold">Choose the safe action you expected. Orb will retry now and submit the phrase for manager review.</p>
                    <div className="mt-2 grid gap-2">{message.clarification.choices.map((choice) => <button key={choice.id} type="button" onClick={() => resolveClarification(message.id, choice.id)} className="rounded-lg border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] px-3 py-2 text-left text-xs"><strong className="block">{choice.label}</strong><span className="primovex-ai-muted">{choice.description}</span></button>)}</div>
                  </div>
                )}
                {message.clarification?.resolvedIntent && <p className="mt-2 text-xs text-emerald-500">Learning suggestion recorded for review. Orb retried the original request.</p>}
                {message.role === 'assistant' && !message.error && message.intent !== 'general.clarification-required' && <MessageFeedback message={message} onRecord={recordFeedback} />}
              </div>
            ))}
            {busy && <div className="primovex-ai-assistant-message primovex-ai-muted mr-12 rounded-2xl px-4 py-3 text-sm">{STATUS_LABELS[status]}…</div>}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form onSubmit={submit} className="primovex-ai-divider primovex-ai-form p-4">
        <div className="primovex-ai-composer flex items-end gap-2 rounded-2xl p-2">
          {isMobile && <button type="button" onClick={orbAwake ? sleepOrb : wakeOrb} className="primovex-ai-mic grid h-10 w-10 shrink-0 place-items-center rounded-xl" aria-label={orbAwake ? 'Stop listening' : 'Talk to Orb'}>{orbAwake ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) submit(event); }} rows={1} placeholder="Ask Orb…" className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" />
          <button type="submit" disabled={!prompt.trim() || busy} className="primovex-ai-submit grid h-10 w-10 place-items-center rounded-xl disabled:cursor-not-allowed disabled:opacity-30"><ArrowRight className="h-4 w-4" /></button>
        </div>
        <p className="primovex-ai-muted mt-2 flex items-start gap-1.5 text-[11px] leading-4"><ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" /><span><strong>Please do not add any patient names to the Orb.</strong> Use EMIS numbers only.</span></p>
      </form>

      <style>{`
        .primovex-ai-panel { color:var(--medtrak-text); background:color-mix(in srgb,var(--medtrak-panel) 97%,transparent); border:1px solid var(--medtrak-border); }
        .primovex-ai-mobile { top:max(7rem,18vh); bottom:calc(var(--pvx-mobile-nav-height) + var(--pvx-mobile-safe-bottom)); max-height:calc(100dvh - max(7rem,18vh) - var(--pvx-mobile-nav-height) - var(--pvx-mobile-safe-bottom)); }
        .primovex-ai-divider { border-bottom:1px solid var(--medtrak-border); }
        form.primovex-ai-divider { border-top:1px solid var(--medtrak-border); border-bottom:0; }
        .primovex-ai-form { flex:0 0 auto; padding-bottom:max(1rem,env(safe-area-inset-bottom)); background:var(--medtrak-panel); }
        .primovex-ai-muted { color:var(--medtrak-muted); }.primovex-ai-faint { color:color-mix(in srgb,var(--medtrak-muted) 72%,transparent); }.primovex-ai-body { color:var(--medtrak-text); }.primovex-ai-accent-text { color:var(--medtrak-accent); }
        .primovex-ai-orb { color:var(--medtrak-accent); border:1px solid color-mix(in srgb,var(--medtrak-accent) 32%,transparent); background:color-mix(in srgb,var(--medtrak-accent) 14%,var(--medtrak-panel)); }
        .primovex-ai-icon-button { color:var(--medtrak-muted); }.primovex-ai-icon-button:hover { color:var(--medtrak-text); background:color-mix(in srgb,var(--medtrak-accent) 10%,transparent); }
        .primovex-ai-accent-card,.primovex-ai-user-message,.primovex-ai-action { border:1px solid color-mix(in srgb,var(--medtrak-accent) 28%,var(--medtrak-border)); background:color-mix(in srgb,var(--medtrak-accent) 10%,var(--medtrak-panel)); }
        .primovex-ai-suggestion,.primovex-ai-assistant-message,.primovex-ai-source,.primovex-ai-composer { color:var(--medtrak-text); border:1px solid var(--medtrak-border); background:color-mix(in srgb,var(--medtrak-panel) 88%,var(--medtrak-bg)); }
        .primovex-ai-error-message { border:1px solid rgba(244,63,94,.35); background:rgba(244,63,94,.10); }.primovex-ai-message-divider { border-top:1px solid var(--medtrak-border); }.primovex-ai-action { color:var(--medtrak-accent); }
        .primovex-ai-composer:focus-within { border-color:color-mix(in srgb,var(--medtrak-accent) 58%,var(--medtrak-border)); box-shadow:0 0 0 3px color-mix(in srgb,var(--medtrak-accent) 12%,transparent); }.primovex-ai-composer textarea { color:var(--medtrak-text)!important; background:transparent!important; border:0!important; }.primovex-ai-composer textarea::placeholder { color:var(--medtrak-muted); }
        .primovex-ai-submit { color:white; background:var(--medtrak-accent); }.primovex-ai-mic { color:var(--medtrak-accent); background:color-mix(in srgb,var(--medtrak-accent) 10%,var(--medtrak-panel)); }
        .primovex-pulse-voice-orb { position:relative; width:9.5rem; height:9.5rem; padding:0; border:0; border-radius:999px; background:transparent; cursor:pointer; transition:opacity .4s ease, transform .4s ease; }
        .primovex-pulse-voice-orb.state-sleeping { opacity:.7; transform:scale(.86); }
        .primovex-pulse-voice-orb:focus-visible { outline:2px solid var(--medtrak-accent); outline-offset:4px; }
        .primovex-voice-stage { display:grid; justify-items:center; gap:.55rem; padding:.4rem 0 1.1rem; text-align:center; }.primovex-voice-stage strong { font-size:1rem; }.primovex-voice-stage>span { max-width:17rem; color:var(--medtrak-muted); font-size:.75rem; line-height:1.45; }
        .primovex-voice-orb { position:relative; display:grid; place-items:center; width:9.5rem; height:9.5rem; border-radius:999px; background:radial-gradient(circle at 36% 28%,color-mix(in srgb,var(--medtrak-accent) 42%,white),var(--medtrak-accent) 48%,color-mix(in srgb,var(--medtrak-accent) 72%,#082f5f)); color:white; box-shadow:0 0 0 10px color-mix(in srgb,var(--medtrak-accent) 8%,transparent),0 22px 46px color-mix(in srgb,var(--medtrak-accent) 30%,transparent); transition:transform .35s ease,opacity .35s ease,filter .35s ease; }
        .primovex-voice-orb::before,.primovex-voice-orb::after { content:''; position:absolute; inset:-.75rem; border:1px solid color-mix(in srgb,var(--medtrak-accent) 30%,transparent); border-radius:inherit; opacity:0; }.primovex-voice-orb::after { inset:-1.5rem; }
        .primovex-voice-orb.state-sleeping { transform:scale(.72); opacity:.62; filter:saturate(.72); }.primovex-voice-orb:not(.state-sleeping) { animation:orbBreathe 3.2s ease-in-out infinite; }.primovex-voice-orb.state-listening::before { animation:orbRipple 2.2s ease-out infinite; }.primovex-voice-orb.state-listening::after { animation:orbRipple 2.2s .8s ease-out infinite; }.primovex-voice-orb.state-thinking { animation-duration:1.25s; }.primovex-voice-core { display:grid; place-items:center; width:5rem; height:5rem; border-radius:999px; background:rgb(255 255 255 / .13); backdrop-filter:blur(8px); }
        @keyframes orbBreathe { 0%,100%{transform:scale(.96)}50%{transform:scale(1.04)} } @keyframes orbRipple { 0%{transform:scale(.88);opacity:.7}100%{transform:scale(1.35);opacity:0} } @keyframes primovexAIBreathe { 0%,100%{transform:scale(.96);opacity:.72}50%{transform:scale(1.06);opacity:1} }.primovex-ai-breathe { animation:primovexAIBreathe 2.8s ease-in-out infinite; }
        @media (prefers-reduced-motion:reduce){.primovex-ai-breathe,.primovex-voice-orb,.primovex-voice-orb::before,.primovex-voice-orb::after{animation:none!important}}
      `}</style>
    </aside>
  );
}
