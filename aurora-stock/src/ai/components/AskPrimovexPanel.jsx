import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, ExternalLink, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import usePrimovexAI from '../hooks/usePrimovexAI';
import { AI_STATES } from '../types/responseContract';

const SUGGESTIONS = [
  'What needs attention today?',
  'Why has Pulse changed?',
  'Which stock is low?',
  'Show overdue SARs.',
  "Explain today's alerts.",
  'Search inventory.',
  'What changed since yesterday?',
];

const STATUS_LABELS = {
  [AI_STATES.IDLE]: 'Ready',
  [AI_STATES.LISTENING]: 'Listening',
  [AI_STATES.SEARCHING]: 'Searching',
  [AI_STATES.REASONING]: 'Reasoning',
  [AI_STATES.RESPONDING]: 'Responding',
  [AI_STATES.ERROR]: 'Needs attention',
};

export default function AskPrimovexPanel({ variant = 'desktop' }) {
  const navigate = useNavigate();
  const { isOpen, close, status, messages, ask, clearConversation } = usePrimovexAI();
  const [prompt, setPrompt] = useState('');
  const endRef = useRef(null);
  const busy = status === AI_STATES.SEARCHING || status === AI_STATES.REASONING;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event) => event.key === 'Escape' && close();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [close, isOpen]);

  if (!isOpen) return null;

  const submit = async (event) => {
    event?.preventDefault();
    const next = prompt.trim();
    if (!next || busy) return;
    setPrompt('');
    await ask(next);
  };

  const panelClass = variant === 'mobile'
    ? 'fixed inset-x-0 bottom-0 top-0 z-[140]'
    : 'fixed bottom-6 right-6 top-6 z-[140] w-[min(470px,calc(100vw-3rem))]';

  return (
    <aside className={`${panelClass} primovex-ai-panel flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl ${variant === 'mobile' ? '' : 'rounded-3xl'}`} aria-label="Ask Primovex">
      <header className="primovex-ai-divider flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className={`primovex-ai-orb grid h-10 w-10 place-items-center rounded-2xl ${status === AI_STATES.SEARCHING ? 'primovex-ai-breathe' : ''}`}>
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold">Primovex AI</h2>
            <p className="primovex-ai-muted text-xs">{STATUS_LABELS[status]} · Approved tools</p>
          </div>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={clearConversation} className="primovex-ai-icon-button rounded-full p-2" title="Clear conversation"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" onClick={close} className="primovex-ai-icon-button rounded-full p-2" title="Close Primovex AI"><X className="h-5 w-5" /></button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div>
            <div className="primovex-ai-accent-card rounded-2xl p-4">
              <div className="primovex-ai-accent-text flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Permission-aware tools</div>
              <p className="primovex-ai-body mt-2 text-sm leading-6">Primovex AI now uses approved, read-only operational tools. Every request is permission checked, source attributed and blocked from unrestricted Firestore access.</p>
            </div>
            <p className="primovex-ai-faint mb-2 mt-5 text-xs font-semibold uppercase tracking-[0.18em]">Suggested questions</p>
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
                  {message.role === 'assistant' && <div className="primovex-ai-accent-text mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Bot className="h-4 w-4" /> Primovex AI</div>}
                  <p className="primovex-ai-body">{message.content}</p>
                  {Number.isFinite(message.confidence) && (
                    <div className="primovex-ai-message-divider primovex-ai-muted mt-3 flex items-center justify-between pt-2 text-xs"><span>Confidence</span><span>{Math.round(message.confidence * 100)}%</span></div>
                  )}
                </div>
                {message.sources?.length > 0 && (
                  <div className="mt-2 grid gap-2">
                    {message.sources.map((source, index) => (
                      <div key={`${message.id}-source-${index}`} className="primovex-ai-source rounded-xl px-3 py-2">
                        <p className="text-xs font-semibold">{source.title}</p>
                        <p className="primovex-ai-faint mt-1 text-xs">{source.detail}</p>
                      </div>
                    ))}
                  </div>
                )}
                {message.actions?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <button key={action.label} type="button" onClick={() => { close(); navigate(action.route); }} className="primovex-ai-action inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">
                        {action.label}<ExternalLink className="h-3.5 w-3.5" />
                      </button>
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

      <form onSubmit={submit} className="primovex-ai-divider p-4">
        <div className="primovex-ai-composer flex items-end gap-2 rounded-2xl p-2">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) submit(event); }} rows={1} placeholder="Ask Primovex…" className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" />
          <button type="submit" disabled={!prompt.trim() || busy} className="primovex-ai-submit grid h-10 w-10 place-items-center rounded-xl disabled:cursor-not-allowed disabled:opacity-30"><ArrowRight className="h-4 w-4" /></button>
        </div>
        <p className="primovex-ai-faint mt-2 text-center text-[11px]">Mock language provider · approved read-only tools · session conversation</p>
      </form>

      <style>{`
        .primovex-ai-panel {
          color: var(--medtrak-text);
          background: color-mix(in srgb, var(--medtrak-panel) 96%, transparent);
          border: 1px solid var(--medtrak-border);
        }
        .primovex-ai-divider { border-bottom: 1px solid var(--medtrak-border); }
        form.primovex-ai-divider { border-top: 1px solid var(--medtrak-border); border-bottom: 0; }
        .primovex-ai-muted { color: var(--medtrak-muted); }
        .primovex-ai-faint { color: color-mix(in srgb, var(--medtrak-muted) 72%, transparent); }
        .primovex-ai-body { color: var(--medtrak-text); }
        .primovex-ai-accent-text { color: var(--medtrak-accent); }
        .primovex-ai-orb {
          color: var(--medtrak-accent);
          border: 1px solid color-mix(in srgb, var(--medtrak-accent) 32%, transparent);
          background: color-mix(in srgb, var(--medtrak-accent) 14%, var(--medtrak-panel));
        }
        .primovex-ai-icon-button { color: var(--medtrak-muted); }
        .primovex-ai-icon-button:hover { color: var(--medtrak-text); background: color-mix(in srgb, var(--medtrak-accent) 10%, transparent); }
        .primovex-ai-accent-card,
        .primovex-ai-user-message,
        .primovex-ai-action {
          border: 1px solid color-mix(in srgb, var(--medtrak-accent) 28%, var(--medtrak-border));
          background: color-mix(in srgb, var(--medtrak-accent) 10%, var(--medtrak-panel));
        }
        .primovex-ai-suggestion,
        .primovex-ai-assistant-message,
        .primovex-ai-source,
        .primovex-ai-composer {
          color: var(--medtrak-text);
          border: 1px solid var(--medtrak-border);
          background: color-mix(in srgb, var(--medtrak-panel) 88%, var(--medtrak-bg));
        }
        .primovex-ai-suggestion svg { color: var(--medtrak-muted); }
        .primovex-ai-suggestion:hover {
          border-color: color-mix(in srgb, var(--medtrak-accent) 42%, var(--medtrak-border));
          background: color-mix(in srgb, var(--medtrak-accent) 8%, var(--medtrak-panel));
        }
        .primovex-ai-error-message {
          border: 1px solid rgba(244, 63, 94, .35);
          background: rgba(244, 63, 94, .10);
        }
        .primovex-ai-message-divider { border-top: 1px solid var(--medtrak-border); }
        .primovex-ai-action { color: var(--medtrak-accent); }
        .primovex-ai-action:hover { background: color-mix(in srgb, var(--medtrak-accent) 17%, var(--medtrak-panel)); }
        .primovex-ai-composer:focus-within { border-color: color-mix(in srgb, var(--medtrak-accent) 58%, var(--medtrak-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--medtrak-accent) 12%, transparent); }
        .primovex-ai-composer textarea { color: var(--medtrak-text) !important; background: transparent !important; border: 0 !important; }
        .primovex-ai-composer textarea::placeholder { color: var(--medtrak-muted); }
        .primovex-ai-submit { color: var(--medtrak-bg); background: var(--medtrak-accent); }
        .primovex-ai-submit:hover:not(:disabled) { background: var(--medtrak-accent-2); }
        @keyframes primovexAIBreathe { 0%,100% { transform: scale(0.96); opacity:.72 } 50% { transform: scale(1.06); opacity:1 } }
        .primovex-ai-breathe { animation: primovexAIBreathe 2.8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .primovex-ai-breathe { animation: none; } }
      `}</style>
    </aside>
  );
}
