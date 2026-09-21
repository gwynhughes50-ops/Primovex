import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { addDocResendSafe } from '@/lib/resendSafeWrites';
import { db } from '@/lib/firebase';

const COLLECTION = 'orb_intent_learning';
const EVENT_NAME = 'primovex:orb-learning-changed';

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

// Real, cross-practice phrase-learning suggestions. Previously this was
// per-device localStorage, so a manager approving a phrase on their laptop
// never actually improved Orb for anyone else — and IntentEngine.classify()
// runs synchronously on every single request, so it can't just await a
// Firestore read each time either. The fix is the same shape used elsewhere
// tonight (sharedSpaceRegistry.js): a live Firestore subscription keeps an
// in-memory cache warm, and list() reads that cache synchronously — callers
// never need to change.
class IntentLearningStore {
  constructor() {
    this.cache = [];
    this.subscribed = false;
  }

  ensureSubscribed() {
    if (this.subscribed || typeof window === 'undefined') return;
    this.subscribed = true;
    onSnapshot(collection(db, COLLECTION), (snap) => {
      const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
      rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      this.cache = rows;
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    }, () => { /* cache just stays at its last-known state if the listener errors */ });
  }

  async create({ phrase, selectedIntent, userId, role, siteId, originalConfidence = null, candidates = [] }) {
    this.ensureSubscribed();
    const record = {
      phrase: String(phrase || '').trim(),
      selectedIntent,
      originalConfidence,
      candidates,
      status: 'pending',
      governance: 'manager-approval-required',
      suggestedBy: { userId: userId || null, role: role || 'unknown' },
      siteId: siteId || 'primary',
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      reviewNote: null,
    };
    const ref = await addDocResendSafe(collection(db, COLLECTION), record);
    return { id: ref.id, ...record };
  }

  list() {
    this.ensureSubscribed();
    return this.cache;
  }

  async review(id, { status, reviewerId, note = null }) {
    if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid Orb learning review status.');
    await updateDoc(doc(db, COLLECTION, id), {
      status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerId || null,
      reviewNote: note,
    });
    return this.cache.find((record) => record.id === id) || null;
  }
}

export { IntentLearningStore };
export const orbIntentLearningStore = new IntentLearningStore();
