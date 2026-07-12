import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronRight, ExternalLink, Move, RotateCcw, Settings, Sparkles, X } from 'lucide-react';

import usePulse from '@/hooks/usePulse';
import { getPulseBand } from '@/services/pulseService';
import { useMedTrakTheme } from '@/components/theme/MedTrakThemeProvider';
import usePrimovexAI from '@/ai/hooks/usePrimovexAI';

const STORAGE_KEY = 'medtrak_pulse_nexus_v3';
const LEGACY_STORAGE_KEY = 'medtrak_pulse_widget_v1';

const DEFAULT_STATE = {
  enabled: true,
  expanded: false,
  x: null,
  y: null,
  size: 'medium',
  snapToEdge: false,
  reducedMotion: false,
  settingsOpen: false,
  hintDismissed: false,
};

const MODULE_ROUTES = {
  inventory: '/inventory',
  purchasing: '/purchasing',
  compliance: '/compliance',
  assets: '/compliance',
  estates: '/compliance',
  workforce: '/reports',
  governance: '/governance/sars',
  connect: '/connect',
};

const TONES = {
  green: {
    id: 'excellent',
    name: 'Excellent',
    accent: '#35e6d3',
    soft: '#1ad6bd',
    deep: '#0b766d',
    aura: 'rgba(45, 212, 191, 0.22)',
    glass: 'rgba(13, 148, 136, 0.18)',
    badge: 'bg-teal-400 text-slate-950',
    label: 'Excellent',
  },
  amber: {
    id: 'attention',
    name: 'Attention',
    accent: '#facc15',
    soft: '#fbbf24',
    deep: '#92400e',
    aura: 'rgba(250, 204, 21, 0.22)',
    glass: 'rgba(146, 64, 14, 0.22)',
    badge: 'bg-amber-300 text-slate-950',
    label: 'Attention',
  },
  orange: {
    id: 'at-risk',
    name: 'At Risk',
    accent: '#fb923c',
    soft: '#f97316',
    deep: '#9a3412',
    aura: 'rgba(249, 115, 22, 0.25)',
    glass: 'rgba(154, 52, 18, 0.24)',
    badge: 'bg-orange-400 text-white',
    label: 'At Risk',
  },
  red: {
    id: 'critical',
    name: 'Critical',
    accent: '#fb7185',
    soft: '#ef4444',
    deep: '#991b1b',
    aura: 'rgba(244, 63, 94, 0.28)',
    glass: 'rgba(127, 29, 29, 0.24)',
    badge: 'bg-rose-500 text-white',
    label: 'Critical',
  },
  violet: {
    id: 'event-pulse',
    name: 'Event Pulse',
    accent: '#a78bfa',
    soft: '#8b5cf6',
    deep: '#5b21b6',
    aura: 'rgba(139, 92, 246, 0.28)',
    glass: 'rgba(91, 33, 182, 0.24)',
    badge: 'bg-violet-500 text-white',
    label: 'Event Pulse',
  },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw), expanded: false, settingsOpen: false };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage can be unavailable in some private browsing contexts.
  }
}

function formatTime(value) {
  try {
    return value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function sizeSpec(size) {
  if (size === 'small') return { box: 70, score: 'text-2xl', icon: 'h-4 w-4', stroke: 9 };
  if (size === 'large') return { box: 108, score: 'text-4xl', icon: 'h-5 w-5', stroke: 10 };
  return { box: 88, score: 'text-3xl', icon: 'h-4 w-4', stroke: 9.5 };
}

function hexToRgba(hex, alpha) {
  const value = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(0, 94, 184, ${alpha})`;
  const number = Number.parseInt(value, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getTone(score, theme) {
  const band = getPulseBand(score);
  const base = TONES[band.tone] || TONES.green;

  // A healthy Pulse follows the selected application theme. Warning and
  // critical states retain their semantic colours for patient-safety clarity.
  if (band.tone !== 'green') return base;

  return {
    ...base,
    accent: theme.accent,
    soft: theme.accent2,
    deep: theme.accent2,
    aura: hexToRgba(theme.accent, 0.28),
    glass: hexToRgba(theme.accent, theme.light ? 0.10 : 0.24),
    badge: 'mt-pulse-badge',
  };
}

function eventSeverityClass(score) {
  if (score < 50) return TONES.red.badge;
  if (score < 75) return TONES.orange.badge;
  if (score < 90) return TONES.amber.badge;
  return 'mt-pulse-badge';
}

export default function PulseWidget({ variant = 'desktop' }) {
  const navigate = useNavigate();
  const { theme } = useMedTrakTheme();
  const primovexAI = usePrimovexAI();
  const pulse = usePulse();
  const widgetRef = useRef(null);
  const orbRef = useRef(null);
  const dragRef = useRef({
    pressed: false,
    dragging: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pointerId: null,
    timer: null,
  });

  const [state, setState] = useState(loadState);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);

  const score = Number.isFinite(Number(pulse.score)) ? Math.round(Number(pulse.score)) : 100;
  const issues = Array.isArray(pulse.issues) ? pulse.issues : [];
  const issueCount = issues.length;
  const band = pulse.band || getPulseBand(score);
  const tone = getTone(score, theme);
  const spec = sizeSpec(variant === 'mobile' ? 'small' : state.size);

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const positionStyle = useMemo(() => {
    if (variant === 'mobile') return { left: '50%', bottom: 88, transform: 'translateX(-50%)' };
    if (Number.isFinite(state.x) && Number.isFinite(state.y)) return { left: state.x, top: state.y };
    return { left: 'calc(50% - 44px)', top: 108 };
  }, [state.x, state.y, variant]);

  const drawerSide = useMemo(() => {
    if (variant === 'mobile') return 'mobile';
    const x = Number.isFinite(state.x) ? state.x : window.innerWidth / 2;
    return x > window.innerWidth - 520 ? 'left' : 'right';
  }, [state.x, variant]);

  const updateState = (patch) => setState((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!state.expanded) return;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') updateState({ expanded: false, settingsOpen: false });
    };

    const onPointerDown = (event) => {
      if (!widgetRef.current?.contains(event.target)) {
        updateState({ expanded: false, settingsOpen: false });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [state.expanded]);

  const beginDrag = () => {
    const current = dragRef.current;
    if (!current.pressed || current.dragging) return;
    current.dragging = true;
    setDragging(true);
    updateState({ expanded: false, settingsOpen: false, hintDismissed: true });
    document.body.style.cursor = 'grabbing';
  };

  const finishDrag = () => {
    const current = dragRef.current;
    if (current.timer) clearTimeout(current.timer);

    if (current.dragging && state.snapToEdge && widgetRef.current) {
      const rect = widgetRef.current.getBoundingClientRect();
      const snapX = rect.left + rect.width / 2 < window.innerWidth / 2 ? 12 : window.innerWidth - rect.width - 12;
      updateState({ x: snapX, y: Math.max(12, Math.min(window.innerHeight - rect.height - 12, rect.top)) });
    }

    current.pressed = false;
    current.dragging = false;
    current.pointerId = null;
    setDragging(false);
    document.body.style.cursor = '';
  };

  useEffect(() => {
    const onMove = (event) => {
      const current = dragRef.current;
      if (!current.pressed || variant === 'mobile') return;

      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (!current.dragging && Math.hypot(dx, dy) > 5) beginDrag();
      if (!current.dragging) return;

      const box = spec.box;
      const nextX = Math.max(8, Math.min(window.innerWidth - box - 8, current.originX + dx));
      const nextY = Math.max(8, Math.min(window.innerHeight - box - 8, current.originY + dy));
      updateState({ x: nextX, y: nextY });
    };

    const onUp = () => finishDrag();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [spec.box, state.snapToEdge, variant]);

  const onOrbPointerDown = (event) => {
    if (variant === 'mobile' || event.button !== 0) return;
    const rect = orbRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragRef.current = {
      pressed: true,
      dragging: false,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      pointerId: event.pointerId,
      timer: window.setTimeout(beginDrag, 150),
    };
  };

  const onOrbDoubleClick = (event) => {
    event.preventDefault();
    if (dragRef.current.dragging) return;
    updateState({ expanded: !state.expanded, settingsOpen: false, hintDismissed: true });
  };

  const onContextMenu = (event) => {
    event.preventDefault();
    updateState({ settingsOpen: !state.settingsOpen, expanded: true, hintDismissed: true });
  };

  const resetPosition = () => updateState({ x: null, y: null, snapToEdge: false });

  if (!state.enabled) return null;

  const showHint = !state.hintDismissed && variant !== 'mobile' && !state.expanded;
  const showPreview = hovered && !dragging && variant !== 'mobile' && !state.expanded;

  return (
    <div ref={widgetRef} className="fixed z-[90] select-none" style={positionStyle}>
      <div
        ref={orbRef}
        role="button"
        tabIndex={0}
        aria-label="Pulse Nexus. Double click to open. Drag to move."
        onPointerDown={onOrbPointerDown}
        onDoubleClick={onOrbDoubleClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            updateState({ expanded: !state.expanded, settingsOpen: false });
          }
        }}
        className="group relative grid place-items-center rounded-full outline-none"
        style={{
          width: spec.box,
          height: spec.box,
          cursor: dragging ? 'grabbing' : 'grab',
          filter: `drop-shadow(0 0 22px ${tone.aura})`,
        }}
      >
        {!state.reducedMotion && (
          <>
            <span
              className="absolute inset-[-10px] rounded-full opacity-70 blur-xl"
              style={{ background: `radial-gradient(circle, ${tone.aura}, transparent 62%)` }}
            />
            <span
              className="absolute inset-[-6px] rounded-full opacity-30"
              style={{
                border: `1px solid ${tone.accent}`,
                animation: 'pulseNexusBreath 6s ease-in-out infinite',
              }}
            />
          </>
        )}

        <div
          className="absolute inset-0 rounded-full border shadow-2xl backdrop-blur-xl mt-pulse-orb-core"
          style={{
            background: `radial-gradient(circle at 50% 38%, rgba(255,255,255,0.16), transparent 22%), radial-gradient(circle at center, var(--pulse-orb-centre) 0%, var(--pulse-orb-centre) 54%, ${tone.glass} 100%)`,
          }}
        />

        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
          <defs>
            <linearGradient id={`pulse-nexus-${tone.id}`} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor={tone.accent} stopOpacity="1" />
              <stop offset="55%" stopColor={tone.soft} stopOpacity="0.9" />
              <stop offset="100%" stopColor={tone.deep} stopOpacity="0.75" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--pulse-orb-track)" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={`url(#pulse-nexus-${tone.id})`}
            strokeWidth={spec.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 700ms ease' }}
          />
          <circle
            cx="50"
            cy="50"
            r="35"
            fill="none"
            stroke={tone.accent}
            strokeOpacity="0.18"
            strokeWidth="1.5"
            strokeDasharray="7 8"
          />
        </svg>

        <div className="relative z-10 flex flex-col items-center justify-center text-center leading-none mt-pulse-text">
          <Activity className={`${spec.icon} mb-1`} style={{ color: tone.accent }} />
          <span className={`${spec.score} font-black tracking-tight drop-shadow`}>{pulse.loading ? '—' : score}</span>
          <span className="mt-1 text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: tone.accent }}>
            Pulse
          </span>
        </div>

        {issueCount > 0 && (
          <span className={`absolute -right-1 -top-1 z-20 grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-black shadow-lg ${eventSeverityClass(score)}`}>
            {issueCount}
          </span>
        )}
      </div>

      {showHint && (
        <div className="absolute left-1/2 top-[calc(100%+10px)] z-[95] w-56 -translate-x-1/2 rounded-2xl border px-3 py-2 text-center text-xs shadow-2xl backdrop-blur mt-pulse-panel mt-pulse-text">
          Drag anywhere · Double-click to open
        </div>
      )}

      {showPreview && (
        <div className="absolute left-1/2 top-[calc(100%+10px)] z-[95] w-56 -translate-x-1/2 rounded-2xl border p-3 shadow-2xl backdrop-blur mt-pulse-panel mt-pulse-text">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] mt-pulse-muted">Pulse</span>
            <span className="text-xs font-bold" style={{ color: tone.accent }}>{tone.label}</span>
          </div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-3xl font-black">{score}</div>
            <div className="text-right text-xs mt-pulse-muted">
              <div>{issueCount} Pulse Event{issueCount === 1 ? '' : 's'}</div>
              <div>Double-click to open</div>
            </div>
          </div>
        </div>
      )}

      {state.expanded && variant !== 'mobile' && (
        <PulseDrawer
          side={drawerSide}
          pulse={pulse}
          score={score}
          tone={tone}
          band={band}
          state={state}
          updateState={updateState}
          resetPosition={resetPosition}
          navigate={navigate}
          theme={theme}
          primovexAI={primovexAI}
        />
      )}

      {state.expanded && variant === 'mobile' && (
        <div className="fixed inset-x-3 bottom-20 top-16 z-[100] flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-xl mt-pulse-panel mt-pulse-text">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pr-3 [scrollbar-gutter:stable]">
            <PulseDrawerContent pulse={pulse} score={score} tone={tone} band={band} updateState={updateState} navigate={navigate} theme={theme} primovexAI={primovexAI} compact />
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulseNexusBreath {
          0%, 100% { transform: scale(0.98); opacity: 0.22; }
          50% { transform: scale(1.08); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function PulseDrawer({ side, pulse, score, tone, band, state, updateState, resetPosition, navigate, theme, primovexAI }) {
  const sideClass = side === 'left' ? 'right-[calc(100%+14px)]' : 'left-[calc(100%+14px)]';
  return (
    <div className={`absolute top-0 z-[92] flex max-h-[min(82dvh,760px)] w-[min(92vw,430px)] flex-col overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-xl mt-pulse-panel mt-pulse-text ${sideClass}`}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pr-3 [scrollbar-gutter:stable]">
        <PulseDrawerContent pulse={pulse} score={score} tone={tone} band={band} updateState={updateState} navigate={navigate} theme={theme} primovexAI={primovexAI} />
      </div>
      {state.settingsOpen && (
        <div className="shrink-0 border-t p-4 mt-pulse-panel">
          <div className="rounded-2xl border p-3 mt-pulse-surface">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold mt-pulse-accent-text"><Settings className="h-4 w-4" /> Pulse Settings</div>
            <button type="button" className="rounded-full p-1 mt-pulse-icon-button" onClick={() => updateState({ settingsOpen: false })}><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-2 text-sm">
            <Toggle label="Snap to screen edge" checked={state.snapToEdge} onChange={() => updateState({ snapToEdge: !state.snapToEdge })} />
            <Toggle label="Reduced motion" checked={state.reducedMotion} onChange={() => updateState({ reducedMotion: !state.reducedMotion })} />
            <div className="flex items-center justify-between rounded-xl border px-3 py-2 mt-pulse-surface">
              <span className="mt-pulse-secondary">Orb size</span>
              <div className="flex gap-1">
                {['small', 'medium', 'large'].map((size) => (
                  <button key={size} type="button" onClick={() => updateState({ size })} className={`rounded-full px-2 py-1 text-xs ${state.size === size ? 'mt-pulse-accent-fill' : 'mt-pulse-choice'}`}>{size}</button>
                ))}
              </div>
            </div>
            <button type="button" onClick={resetPosition} className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 mt-pulse-action-secondary"><RotateCcw className="h-4 w-4" /> Reset position</button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}

function PulseDrawerContent({ pulse, score, tone, band, updateState, navigate, theme, primovexAI, compact = false }) {
  const modules = Array.isArray(pulse.modules) ? pulse.modules : [];
  const issues = Array.isArray(pulse.issues) ? pulse.issues : [];
  const timeline = makeTimeline(issues);

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" style={{ color: tone.accent }} />
            <h2 className="font-bold mt-pulse-text">Practice Pulse</h2>
          </div>
          <p className="mt-1 text-xs mt-pulse-muted">Updated {formatTime(pulse.updatedAt || new Date())}</p>
        </div>
        <div className="flex gap-1">
          {!compact && (
            <button type="button" onClick={() => updateState({ settingsOpen: true })} className="rounded-full p-2 mt-pulse-icon-button" title="Pulse settings"><Settings className="h-4 w-4" /></button>
          )}
          <button type="button" onClick={() => updateState({ expanded: false, settingsOpen: false })} className="rounded-full p-2 mt-pulse-icon-button" title="Close"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-[112px_1fr] gap-4">
        <div className="relative grid h-28 w-28 place-items-center rounded-full" style={{ filter: `drop-shadow(0 0 18px ${tone.aura})` }}>
          <div className="absolute inset-0 rounded-full border mt-pulse-orb-core" />
          <div className="relative z-10 text-center">
            <div className="text-4xl font-black">{score}</div>
            <div className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: tone.accent }}>Pulse</div>
          </div>
        </div>
        <div>
          <div className="inline-flex rounded-full border px-3 py-1 text-xs font-bold" style={{ borderColor: tone.accent, color: tone.accent }}>{band.label || tone.label}</div>
          <p className="mt-3 text-sm mt-pulse-secondary">{band.message || 'Live operational health for the practice.'}</p>
          <p className="mt-3 text-xs mt-pulse-muted">Pulse reflects Inventory, Compliance, Governance, Connect and future operational signals.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border p-3 mt-pulse-surface">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] mt-pulse-muted">Modules</div>
          <div className="mt-2 space-y-2">
            {modules.map((module) => {
              const moduleBand = getPulseBand(module.score);
              const moduleTone = moduleBand.tone === 'green' ? getTone(module.score, theme) : (TONES[moduleBand.tone] || TONES.green);
              const route = MODULE_ROUTES[module.key] || '/dashboard';
              return (
                <button
                  key={module.key}
                  type="button"
                  onClick={() => {
                    updateState({ expanded: false, settingsOpen: false });
                    navigate(route);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left mt-pulse-row"
                >
                  <span className="flex items-center gap-2 text-sm mt-pulse-secondary">
                    <span className="h-2 w-2 rounded-full" style={{ background: moduleTone.accent }} />
                    {module.label}
                  </span>
                  <span className="flex items-center gap-2 text-sm font-bold mt-pulse-text">{module.score}<ChevronRight className="h-4 w-4 mt-pulse-muted" /></span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border p-3 mt-pulse-surface">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] mt-pulse-muted">Why?</div>
          {issues.length === 0 ? (
            <div className="mt-3 rounded-xl border px-3 py-2 text-sm mt-pulse-success">No active issues detected.</div>
          ) : (
            <div className="mt-2 space-y-2">
              {issues.slice(0, 4).map((issue, index) => (
                <div key={`${issue.moduleKey}-${index}`} className="rounded-xl border px-3 py-2 text-sm mt-pulse-row mt-pulse-secondary">
                  <span className="font-semibold mt-pulse-text">{issue.moduleLabel}:</span> {issue.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border p-3 mt-pulse-surface">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] mt-pulse-muted">Pulse Events</div>
        <div className="mt-2 space-y-2">
          {timeline.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm mt-pulse-row">
              <div>
                <div className="mt-pulse-secondary">{item.title}</div>
                <div className="text-xs mt-pulse-muted">{item.time} · {item.module}</div>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-black ${item.delta > 0 ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-400/15 text-rose-200'}`}>{item.delta > 0 ? `+${item.delta}` : item.delta}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={() => {
            updateState({ expanded: false, settingsOpen: false });
            primovexAI.open();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold mt-pulse-action-primary"
        >
          Ask Primovex <Sparkles className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            updateState({ expanded: false, settingsOpen: false });
            navigate('/alerts');
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold mt-pulse-action-secondary"
        >
          Open Operations Centre <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

function makeTimeline(issues) {
  if (!issues.length) {
    return [
      { id: 'healthy', time: formatTime(new Date()), title: 'Practice operating steadily', module: 'Operations', delta: 1 },
      { id: 'checks', time: 'Today', title: 'Routine monitoring active', module: 'Pulse', delta: 0 },
    ];
  }
  return issues.slice(0, 3).map((issue, index) => ({
    id: `${issue.moduleKey}-${index}`,
    time: index === 0 ? formatTime(new Date()) : 'Today',
    title: issue.text,
    module: issue.moduleLabel,
    delta: issue.score < 75 ? -2 : -1,
  }));
}

function Toggle({ label, checked, onChange }) {
  return (
    <button type="button" onClick={onChange} className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left mt-pulse-surface">
      <span className="mt-pulse-secondary">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${checked ? 'mt-pulse-toggle-on' : 'mt-pulse-toggle-off'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full mt-pulse-toggle-thumb transition ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}
