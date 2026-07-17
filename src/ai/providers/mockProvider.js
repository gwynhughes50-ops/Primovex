import { runApprovedToolForPrompt } from '@/ai/tools';

const UNCONNECTED_RESPONSES = [
  {
    match: /\b(sar|subject access request|data request)\b/i,
    answer: 'The Governance SAR tool is not connected yet, so I cannot safely confirm which SARs are due or overdue.',
    confidence: 1,
    intent: 'governance.sars',
    sources: [{ title: 'Governance SARs', detail: 'Approved read-only connection pending', type: 'module' }],
    actions: [{ label: 'Open SARs', route: '/governance/sars' }],
  },
  {
    match: /\b(pulse|practice pulse)\b/i,
    answer: 'Practice Pulse remains protected by its existing calculation service. Its approved explanation tool is not connected yet, so I will not guess why it changed.',
    confidence: 1,
    intent: 'pulse.explain',
    sources: [{ title: 'Practice Pulse', detail: 'Protected calculation · explanation tool pending', type: 'module' }],
    actions: [{ label: 'View Practice Pulse', route: '/dashboard' }],
  },
  {
    match: /\b(alert|alerts|operations centre)\b/i,
    answer: 'The approved Alerts explanation tool is not connected yet. I cannot safely summarise live alerts until that read-only connection is available.',
    confidence: 1,
    intent: 'alerts.explain',
    sources: [{ title: 'Operations Centre', detail: 'Approved read-only connection pending', type: 'module' }],
    actions: [{ label: 'Open Operations Centre', route: '/alerts' }],
  },
];

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export const mockPrimovexProvider = {
  id: 'mock',
  async ask({ prompt, toolContext = {} }) {
    await wait(350);

    const approved = await runApprovedToolForPrompt(prompt, toolContext);
    if (approved) {
      return {
        answer: approved.summary,
        confidence: approved.confidence,
        intent: approved.intent,
        sources: approved.sources,
        actions: approved.actions,
        warnings: approved.warnings,
      };
    }

    const pending = UNCONNECTED_RESPONSES.find((item) => item.match.test(prompt));
    if (pending) return pending;

    return {
      answer: 'I could not confidently match that request to an approved Primovex tool. Try asking about stock, expiry dates, room cleaning, equipment location, maintenance, fridge temperature, practice readiness, or recent operational changes.',
      confidence: 0.72,
      intent: 'general.unmatched',
      sources: [{ title: 'Primovex language engine', detail: 'No approved tool matched with sufficient confidence', type: 'system' }],
      actions: [],
    };
  },
};
