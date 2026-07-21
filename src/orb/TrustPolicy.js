const STATE_CONFIDENCE_CEILINGS = Object.freeze({
  known: 1,
  partial: 0.74,
  unknown: 0.49,
  conflicting: 0.49,
});

const ALL_CLEAR_LANGUAGE = /\b(all clear|everything is (?:ok|okay|safe)|no (?:issues|problems|alerts)|currently clear|are compliant)\b/i;
const CONFLICT_LANGUAGE = /\b(conflict|conflicting|inconsistent|contradictory|does not match)\b/i;

function parseDate(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

function freshnessState(response, now) {
  const supplied = typeof response.freshness === 'string' ? response.freshness : response.freshness?.state;
  const observedAt = response.freshness?.observedAt || response.observedAt;
  const observedTime = parseDate(observedAt);
  if (supplied === 'stale') return { state: 'stale', observedAt, ageMinutes: observedTime == null ? null : Math.max(0, Math.round((now - observedTime) / 60000)) };
  if (observedTime == null) return { state: supplied || 'unknown', observedAt: null, ageMinutes: null };
  const ageMinutes = Math.max(0, Math.round((now - observedTime) / 60000));
  const staleAfterMinutes = response.domain === 'temperature' || response.intent?.startsWith('coldChain.') ? 30 : 1440;
  return { state: ageMinutes > staleAfterMinutes ? 'stale' : (supplied || 'current'), observedAt: new Date(observedTime).toISOString(), ageMinutes };
}

function evidenceLabel(freshness, count) {
  const state = freshness.state === 'stale' ? 'Stale' : freshness.state === 'unknown' ? 'Time unknown' : freshness.state === 'cached' ? 'Cached' : freshness.state === 'synced' ? 'Synced' : 'Current';
  const age = freshness.ageMinutes == null ? '' : freshness.ageMinutes < 2 ? ' just now' : ` ${freshness.ageMinutes} minutes ago`;
  return `Evidence: ${state}${age} · ${count} source${count === 1 ? '' : 's'}.`;
}

export class TrustPolicy {
  apply(response = {}, { now = Date.now() } = {}) {
    const warnings = [...(response.warnings || [])];
    let knownState = response.knownState || (response.data == null ? 'unknown' : 'known');
    if (warnings.some((warning) => CONFLICT_LANGUAGE.test(String(warning)))) knownState = 'conflicting';
    const freshness = freshnessState(response, now);
    let confidence = Number.isFinite(response.confidence) ? response.confidence : null;
    if (confidence != null) confidence = Math.min(confidence, STATE_CONFIDENCE_CEILINGS[knownState] ?? 0.8);
    if (freshness.state === 'stale' && confidence != null) confidence = Math.min(confidence, 0.79);

    let answer = String(response.answer || '');
    if (knownState === 'unknown' && !/^I cannot confirm/i.test(answer)) answer = `I cannot confirm an all-clear from the available evidence. ${answer}`;
    if (knownState === 'partial' && !/^This is a partial operational view/i.test(answer)) answer = `This is a partial operational view. ${answer}`;
    if (knownState === 'conflicting' && !/^The connected evidence conflicts/i.test(answer)) answer = `The connected evidence conflicts, so I cannot confirm the current state. ${answer}`;
    if (freshness.state === 'stale' && !/^The evidence may be stale/i.test(answer)) answer = `The evidence may be stale. ${answer}`;
    if (knownState !== 'known' && ALL_CLEAR_LANGUAGE.test(answer)) warnings.push('All-clear wording suppressed because evidence is incomplete');
    if (freshness.state === 'stale') warnings.push('Evidence is stale');

    const sourceCount = response.sources?.length || response.evidence?.length || 0;
    answer = `${answer.trim()}\n\n${evidenceLabel(freshness, sourceCount)}`;
    if (response.withheld?.length) answer += ' Some named operational details were withheld for your role.';

    return { ...response, answer, confidence, knownState, freshness, warnings: [...new Set(warnings)] };
  }
}
