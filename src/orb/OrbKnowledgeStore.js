import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { phraseSimilarity } from '@/ai/tools/languageEngine';

const COLLECTION = 'orb_knowledge_entries';
const EVENT_NAME = 'primovex:orb-knowledge-changed';
const MATCH_THRESHOLD = 0.62;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

// Practice-specific facts/FAQs Orb doesn't otherwise know (policies,
// procedures, "who do I call for X") — a plain Q&A store, not a tool-routed
// intent. Mirrors IntentLearningStore.js's shape exactly: IntentEngine/the
// router run synchronously on every request, so a live Firestore
// subscription keeps an in-memory cache warm and list()/findBestMatch() read
// it synchronously — no per-request Firestore round trip.
class OrbKnowledgeStore {
  constructor() {
    this.cache = [];
    this.subscribed = false;
  }

  ensureSubscribed() {
    if (this.subscribed || typeof window === 'undefined') return;
    this.subscribed = true;
    onSnapshot(collection(db, COLLECTION), (snap) => {
      const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
      rows.sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
      this.cache = rows;
      window.dispatchEvent(new CustomEvent(EVENT_NAME));
    }, () => { /* cache just stays at its last-known state if the listener errors */ });
  }

  list() {
    this.ensureSubscribed();
    return this.cache;
  }

  // One-shot re-fetch, independent of the live listener. The onSnapshot error
  // handler above deliberately never retries (a transient network blip just
  // leaves the cache at its last-known state), so this is the actual recovery
  // path if that listener ever silently died — and it doubles as a visible
  // "did my change take" confirmation for whoever's teaching Orb.
  async refresh() {
    const snap = await getDocs(collection(db, COLLECTION));
    const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
    rows.sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
    this.cache = rows;
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
    return rows;
  }

  get(id) {
    this.ensureSubscribed();
    return this.cache.find((entry) => entry.id === id) || null;
  }

  // Compares the query against each entry's question and keywords; returns
  // the single best match if it clears MATCH_THRESHOLD, otherwise null. This
  // is intentionally the same phrase-similarity approach the rest of the
  // intent router already uses, not a separate matching strategy.
  findBestMatch(text) {
    this.ensureSubscribed();
    if (!text?.trim() || !this.cache.length) return null;
    let best = null;
    let bestScore = 0;
    for (const entry of this.cache) {
      const questionScore = phraseSimilarity(text, entry.question || '');
      const keywordScore = (entry.keywords || []).reduce((max, keyword) => Math.max(max, phraseSimilarity(text, keyword)), 0);
      const score = Math.max(questionScore, keywordScore);
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return bestScore >= MATCH_THRESHOLD ? best : null;
  }

  async create({ question, answer, keywords = [] }, actor = null) {
    this.ensureSubscribed();
    const record = {
      question: String(question || '').trim(),
      answer: String(answer || '').trim(),
      keywords: keywords.map((k) => String(k).trim()).filter(Boolean),
      createdBy: actor,
      createdAt: new Date().toISOString(),
      updatedBy: actor,
      updatedAt: new Date().toISOString(),
    };
    if (!record.question || !record.answer) throw new Error('A question and answer are both required.');
    const ref = await addDoc(collection(db, COLLECTION), record);
    return { id: ref.id, ...record };
  }

  async update(id, { question, answer, keywords }, actor = null) {
    const patch = { updatedBy: actor, updatedAt: new Date().toISOString() };
    if (question !== undefined) patch.question = String(question).trim();
    if (answer !== undefined) patch.answer = String(answer).trim();
    if (keywords !== undefined) patch.keywords = keywords.map((k) => String(k).trim()).filter(Boolean);
    await updateDoc(doc(db, COLLECTION, id), patch);
    return this.cache.find((entry) => entry.id === id) || null;
  }

  async remove(id) {
    await deleteDoc(doc(db, COLLECTION, id));
  }
}

export { OrbKnowledgeStore };
export const orbKnowledgeStore = new OrbKnowledgeStore();
