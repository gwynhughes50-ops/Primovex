import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { addDocResendSafe } from '@/lib/resendSafeWrites';
import { db } from '@/lib/firebase';
import { getSpaceRegistryDiagnostics, exportSpaceRegistryBackup } from '@/modules/sense/services/sharedSpaceRegistry';

// Real, cross-device developer issue register. Previously per-device
// localStorage, so a bug reported from the mobile shell never showed up in
// the desktop Developer Centre unless it happened to be the same browser.
const COLLECTION = 'developer_issues';

function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

// No orderBy: a doc missing createdAt would otherwise be silently dropped by
// Firestore rather than just sorted last — sort client-side instead.
export function subscribeDeveloperIssues(callback) {
  return onSnapshot(collection(db, COLLECTION), (snap) => {
    const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
    rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    callback(rows);
  });
}

export async function createDeveloperIssue(input) {
  const ticket = `PVX-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  const issue = {
    ticket,
    status: 'open', createdAt: new Date().toISOString(),
    route: location.pathname, url: location.href,
    platform: document.documentElement.dataset.primovexClient || 'web',
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio, orientation: screen.orientation?.type || null },
    safeAreaProbe: { visualViewportWidth: window.visualViewport?.width || null, visualViewportHeight: window.visualViewport?.height || null },
    online: navigator.onLine, userAgent: navigator.userAgent,
    theme: document.documentElement.dataset.theme || null,
    appVersion: import.meta.env.VITE_APP_VERSION || '0.12.2',
    registry: getSpaceRegistryDiagnostics(),
    ...input,
  };
  const ref = await addDocResendSafe(collection(db, COLLECTION), issue);
  return { id: ref.id, ...issue };
}

export async function updateDeveloperIssue(id, patch) {
  await updateDoc(doc(db, COLLECTION, id), { ...patch, updatedAt: new Date().toISOString() });
}

export function exportDeveloperBundle(issues = []) {
  return { generatedAt: new Date().toISOString(), app: 'Primovex', version: import.meta.env.VITE_APP_VERSION || '0.12.2', issues, spaceRegistry: exportSpaceRegistryBackup() };
}

export function downloadDeveloperBundle(issues = []) {
  const blob = new Blob([JSON.stringify(exportDeveloperBundle(issues), null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = href; anchor.download = `primovex-development-bundle-${new Date().toISOString().slice(0,10)}.json`; anchor.click(); URL.revokeObjectURL(href);
}
