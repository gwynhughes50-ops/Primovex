import { getSpaceRegistryDiagnostics, exportSpaceRegistryBackup } from '@/modules/sense/services/sharedSpaceRegistry';

const KEY = 'primovex.developerIssues.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (issues) => { localStorage.setItem(KEY, JSON.stringify(issues)); window.dispatchEvent(new CustomEvent('primovex:developer-issues-changed')); return issues; };

export function listDeveloperIssues() { return read(); }
export function createDeveloperIssue(input) {
  const issue = {
    id: `PVX-${new Date().getFullYear()}-${String(read().length + 1).padStart(4, '0')}`,
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
  write([issue, ...read()]);
  return issue;
}
export function updateDeveloperIssue(id, patch) { return write(read().map((issue) => issue.id === id ? { ...issue, ...patch, updatedAt: new Date().toISOString() } : issue)); }
export function exportDeveloperBundle() {
  return { generatedAt: new Date().toISOString(), app: 'Primovex', version: import.meta.env.VITE_APP_VERSION || '0.12.2', issues: read(), spaceRegistry: exportSpaceRegistryBackup() };
}
export function downloadDeveloperBundle() {
  const blob = new Blob([JSON.stringify(exportDeveloperBundle(), null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = href; anchor.download = `primovex-development-bundle-${new Date().toISOString().slice(0,10)}.json`; anchor.click(); URL.revokeObjectURL(href);
}
