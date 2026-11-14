import { ArrowRight, Compass, FileQuestion, MessageSquareText, Search, Wand2 } from 'lucide-react';
import { ASSISTANT_PROMISE, sendsAtOnce, startersFor } from '../starters';
import { pageStarters } from '../pageGuide';

// What Ask Primovex is for, in one sentence, and three kinds of thing to try (Ask, Do, Go), each with examples this person's role can use.
// Shown whenever the conversation is empty, and again from the "What can I do?" button.
const ICON = { ask: Search, do: Wand2, go: Compass };

export default function AssistantWelcome({ can, onRota = false, pathname = '', onAsk, onFill, compact = false }) {
  const groups = startersFor({ can, onRota, max: compact ? 2 : 3 });
  const page = pageStarters(pathname, { can, max: compact ? 1 : 2 });
  return (
    <section aria-label="What Ask Primovex can do">
      <div className="primovex-ai-accent-card rounded-2xl p-4">
        <div className="primovex-ai-accent-text flex items-center gap-2 font-semibold"><MessageSquareText className="h-4 w-4" aria-hidden="true" /> What can I do?</div>
        <p className="primovex-ai-body mt-2 text-sm leading-6">{ASSISTANT_PROMISE}</p>
      </div>
      {page && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline gap-2">
            <FileQuestion className="primovex-ai-accent-text h-4 w-4 shrink-0 self-center" aria-hidden="true" />
            <h3 className="text-sm font-bold">On this page</h3>
            <p className="primovex-ai-muted text-xs">{page.title}</p>
          </div>
          <div className="grid gap-1.5">
            <button type="button" onClick={() => onAsk('Explain this page')} className="primovex-ai-suggestion flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold">
              <span>Explain this page</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
            {page.asks.map((item) => (
              <button key={item.text} type="button" onClick={() => onAsk(item.text)} className="primovex-ai-suggestion flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm">
                <span>{item.text}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            ))}
            {page.tries.map((item) => (
              <button key={item.text} type="button" onClick={() => onFill(item.text)} className="primovex-ai-suggestion flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm">
                <span>{item.text}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 space-y-4">
        {groups.map((group) => {
          const Icon = ICON[group.key] || Search;
          return (
            <div key={group.key}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <Icon className="primovex-ai-accent-text h-4 w-4 shrink-0 self-center" aria-hidden="true" />
                <h3 className="text-sm font-bold">{group.title}</h3>
                <p className="primovex-ai-muted text-xs">{group.blurb}</p>
              </div>
              <div className="grid gap-1.5">
                {group.items.map((starter) => (
                  <button
                    key={starter.text}
                    type="button"
                    onClick={() => (sendsAtOnce(starter) ? onAsk(starter.text) : onFill(starter.text))}
                    className="primovex-ai-suggestion flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm"
                    aria-label={`${starter.text}: ${group.how}`}
                  >
                    <span>{starter.text}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="primovex-ai-muted mt-4 text-xs leading-5">You can type below{' '}or, on the phone, tap the glowing button and talk. Ask in your own words: you don't need the exact wording.</p>
    </section>
  );
}
