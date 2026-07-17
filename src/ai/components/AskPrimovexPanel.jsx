import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, ExternalLink, Mic, MicOff, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import usePrimovexAI from '../hooks/usePrimovexAI';
import { AI_STATES } from '../types/responseContract';
import { cancelNativeListening, nativeVoiceAvailable, requestNativeMicrophonePermission, startNativeListening, stopNativeListening, subscribeNativeOrbVoice } from '../voice/nativeOrbVoice';

const SUGGESTIONS = [
  'Are all fridges OK today?',
  'Tell me about Fridge 2.',
  'What needs attention today?',
  'Which stock is low?',
  'What changed since yesterday?',
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

export default function AskPrimovexPanel({ variant = 'desktop' }) {
  const navigate = useNavigate();
  const { isOpen, close, status, messages, ask, clearConversation } = usePrimovexAI();
  const [prompt, setPrompt] = useState('');
  const [voiceState, setVoiceState] = useState(VOICE_STATES.SLEEPING);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [voiceError, setVoiceError] = useState('');
  const [partialTranscript, setPartialTranscript] = useState('');
  const recognitionRef = useRef(null);
  const voiceStateRef = useRef(VOICE_STATES.SLEEPING);
  const followUpTimerRef = useRef(null);
  const endRef = useRef(null);
  const busy = status === AI_STATES.SEARCHING || status === AI_STATES.REASONING;
  const isMobile = variant === 'mobile';

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  const stopRecognition = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* recognition may already be stopped */ }
    recognitionRef.current = null;
    try { stopNativeListening(); } catch { /* native listener may already be stopped */ }
  }, []);

  const sleepOrb = useCallback(() => {
    window.clearTimeout(followUpTimerRef.current);
    stopRecognition();
    setVoiceState(VOICE_STATES.SLEEPING);
  }, [stopRecognition]);

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

    recognition.onstart = () => setVoiceState(wakeOnly ? VOICE_STATES.SLEEPING : VOICE_STATES.LISTENING);
    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) finalText += transcript;
        else interim += transcript;
      }
      const heard = `${finalText} ${interim}`.trim();
      if (wakeOnly && /\borb\b/i.test(heard)) {
        setVoiceState(VOICE_STATES.WAKING);
        recognition.stop();
      }
    };
    recognition.onerror = (event) => {
      if (!['no-speech', 'aborted'].includes(event.error)) console.warn('Orb voice recognition:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setVoiceSupported(false);
      setVoiceState(VOICE_STATES.SLEEPING);
    };
    recognition.onend = async () => {
      recognitionRef.current = null;
      if (wakeOnly) {
        if (voiceStateRef.current === VOICE_STATES.WAKING || /\borb\b/i.test(finalText)) {
          window.setTimeout(() => beginListening(false), 220);
        }
        return;
      }

      const clean = finalText.trim().replace(/^orb[,.]?\s*/i, '');
      if (clean) {
        setVoiceState(VOICE_STATES.THINKING);
        await ask(clean);
        setVoiceState(VOICE_STATES.FOLLOW_UP);
        followUpTimerRef.current = window.setTimeout(sleepOrb, 12000);
      } else {
        sleepOrb();
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [ask, sleepOrb, stopRecognition]);

  const wakeOrb = useCallback(() => {
    window.clearTimeout(followUpTimerRef.current);
    setVoiceError('');
    setPartialTranscript('');
    setVoiceState(VOICE_STATES.WAKING);
    if (nativeVoiceAvailable()) {
      requestNativeMicrophonePermission();
      window.setTimeout(() => startNativeListening(), 240);
      return;
    }
    window.setTimeout(() => beginListening(false), 240);
  }, [beginListening]);

  useEffect(() => subscribeNativeOrbVoice(async ({ type, value }) => {
    if (type === 'permission') {
      if (value === 'denied') {
        setVoiceSupported(false);
        setVoiceError('Microphone permission was denied. Enable it in Android Settings to use Orb voice.');
        setVoiceState(VOICE_STATES.SLEEPING);
      }
      return;
    }
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
    if (type === 'error') {
      setVoiceError(value || 'Voice recognition could not start.');
      setVoiceState(VOICE_STATES.SLEEPING);
      return;
    }
    if (type === 'final') {
      const clean = String(value || '').trim().replace(/^orb[,.]?\s*/i, '');
      setPartialTranscript('');
      if (!clean) {
        setVoiceError('I did not catch that. Tap the Orb and try again.');
        setVoiceState(VOICE_STATES.SLEEPING);
        return;
      }
      setVoiceState(VOICE_STATES.THINKING);
      await ask(clean);
      setVoiceState(VOICE_STATES.FOLLOW_UP);
      followUpTimerRef.current = window.setTimeout(sleepOrb, 12000);
    }
  }), [ask, sleepOrb]);

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
      window.clearTimeout(followUpTimerRef.current);
      stopRecognition();
      try { cancelNativeListening(); } catch { /* no-op */ }
    };
  }, [beginListening, close, isMobile, isOpen, stopRecognition]);

  useEffect(() => {
    if (!isMobile || voiceState === VOICE_STATES.SLEEPING) return;
    if (busy) setVoiceState(VOICE_STATES.THINKING);
  }, [busy, isMobile, voiceState]);

  if (!isOpen) return null;

  const submit = async (event) => {
    event?.preventDefault();
    const next = prompt.trim();
    if (!next || busy) return;
    setPrompt('');
    await ask(next);
  };

  const panelClass = isMobile
    ? 'fixed inset-x-0 z-[140] rounded-t-[2rem]'
    : 'fixed bottom-6 right-6 top-6 z-[140] w-[min(470px,calc(100vw-3rem))]';

  const orbAwake = voiceState !== VOICE_STATES.SLEEPING;
  const orbLabel = voiceState === VOICE_STATES.LISTENING ? 'Listening' : voiceState === VOICE_STATES.THINKING ? 'Thinking' : voiceState === VOICE_STATES.FOLLOW_UP ? 'Anything else?' : 'Say “Orb”';

  return (
    <aside
      className={`${panelClass} primovex-ai-panel flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl ${isMobile ? 'primovex-ai-mobile rounded-t-[2rem]' : 'rounded-3xl'}`}
      aria-label="Orb"
    >
      <header className="primovex-ai-divider flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className={`primovex-ai-orb grid h-10 w-10 place-items-center rounded-2xl ${busy ? 'primovex-ai-breathe' : ''}`}><Sparkles className="h-5 w-5" /></div>
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
            <button type="button" onClick={orbAwake ? sleepOrb : wakeOrb} className={`primovex-voice-orb state-${voiceState}`} aria-label={orbAwake ? 'Put Orb to sleep' : 'Wake Orb'}>
              <span className="primovex-voice-core"><Sparkles className="h-10 w-10" /></span>
            </button>
            <strong>{orbLabel}</strong>
            <span>{voiceError || partialTranscript || (voiceSupported ? (orbAwake ? 'Speak naturally. Orb waits for a pause before responding.' : 'Tap the Orb to begin. Wake-word listening follows once native capture is proven.') : 'Voice recognition is unavailable on this device. You can still type below.')}</span>
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
                  <p className="primovex-ai-body">{message.content}</p>
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
                {message.actions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <button key={action.label} type="button" onClick={() => { close(); navigate(action.route); }} className="primovex-ai-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">{action.label}<ExternalLink className="h-3.5 w-3.5" /></button>
                    ))}
                  </div>
                )}
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
