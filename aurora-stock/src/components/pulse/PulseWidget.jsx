import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Grip, Minus, X } from 'lucide-react';

import usePulse from '@/hooks/usePulse';
import { getPulseBand } from '@/services/pulseService';

const STORAGE_KEY = 'medtrak_pulse_widget_v1';

const DEFAULT_STATE = {
  enabled: true,
  expanded: false,
  x: null,
  y: null,
  size: 'medium',
};

const MODULE_ROUTES = {
  inventory: '/inventory',
  purchasing: '/purchasing',
  compliance: '/compliance',
  assets: '/compliance',
  estates: '/compliance',
  workforce: '/reports',
  governance: '/reports',
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
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

function sizeClasses(size) {
  if (size === 'small') return { box: 'h-16 w-16', ring: 15, text: 'text-sm', label: 'hidden' };
  if (size === 'large') return { box: 'h-24 w-24', ring: 17, text: 'text-xl', label: 'text-[10px]' };
  return { box: 'h-20 w-20', ring: 16, text: 'text-lg', label: 'text-[9px]' };
}

export default function PulseWidget({ variant = 'desktop' }) {
  const navigate = useNavigate();
  const pulse = usePulse();
  const widgetRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const [state, setState] = useState(loadState);

  const band = pulse.band || getPulseBand(pulse.score || 100);
  const classes = sizeClasses(variant === 'mobile' ? 'small' : state.size);
  const score = Number.isFinite(Number(pulse.score)) ? Number(pulse.score) : 100;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const positionStyle = useMemo(() => {
    if (variant === 'mobile') {
      return { right: 16, bottom: 92 };
    }

    if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
      return { left: state.x, top: state.y };
    }

    return { right: 24, top: 96 };
  }, [state.x, state.y, variant]);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const updateState = (patch) => {
    setState((prev) => ({ ...prev, ...patch }));
  };

  const onPointerDown = (event) => {
    if (variant === 'mobile' || state.expanded) return;
    if (!widgetRef.current) return;

    const rect = widgetRef.current.getBoundingClientRect();
    dragRef.current = {
      dragging: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
    };

    widgetRef.current.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragRef.current.dragging) return;

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    const nextX = Math.max(8, Math.min(window.innerWidth - 120, dragRef.current.originX + dx));
    const nextY = Math.max(8, Math.min(window.innerHeight - 120, dragRef.current.originY + dy));

    updateState({ x: nextX, y: nextY });
  };

  const onPointerUp = (event) => {
    dragRef.current.dragging = false;
    widgetRef.current?.releasePointerCapture?.(event.pointerId);
  };

  if (!state.enabled) {
    return null;
  }

  return (
    <div
      ref={widgetRef}
      className={`fixed z-[90] select-none ${state.expanded ? 'w-[min(92vw,420px)]' : ''}`}
      style={positionStyle}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {!state.expanded ? (
        <button
          type="button"
          onClick={() => updateState({ expanded: true })}
          onPointerDown={onPointerDown}
          title="MedTrak Pulse"
          className={`${classes.box} group relative rounded-full border bg-slate-950/90 p-2 text-white shadow-2xl backdrop-blur ${band.borderClass} ${band.glowClass}`}
        >
          {variant !== 'mobile' && (
            <span className="absolute -left-1 -top-1 hidden rounded-full border border-slate-700 bg-slate-900 p-1 text-slate-500 group-hover:block">
              <Grip className="h-3 w-3" />
            </span>
          )}

          <svg viewBox="0 0 100 100" className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] -rotate-90">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-800" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={classes.ring}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={`transition-all duration-700 ${band.ringClass}`}
            />
          </svg>

          <span className="relative flex h-full flex-col items-center justify-center leading-none">
            <span className={`font-black ${classes.text}`}>{pulse.loading ? '—' : `${score}%`}</span>
            <span className={`mt-1 uppercase tracking-wide text-slate-400 ${classes.label}`}>Pulse</span>
          </span>
        </button>
      ) : (
        <div className="rounded-3xl border border-slate-800 bg-slate-950/95 p-4 text-white shadow-2xl shadow-black/50 backdrop-blur">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${band.dotClass}`} />
                <h2 className="font-bold text-white">MedTrak Pulse</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">Updated {formatTime(pulse.updatedAt || new Date())}</p>
            </div>

            <div className="flex gap-1">
              {variant !== 'mobile' && (
                <button
                  type="button"
                  onClick={() => updateState({ expanded: false })}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                  title="Minimise"
                >
                  <Minus className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => updateState({ expanded: false })}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[110px_1fr] gap-4">
            <div className="relative h-28 w-28 rounded-full">
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
                <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-800" />
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  className={`transition-all duration-700 ${band.ringClass}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-3xl font-black">{pulse.loading ? '—' : `${score}%`}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Practice Health</div>
              </div>
            </div>

            <div>
              <div className="font-semibold text-white">{band.label}</div>
              <p className="mt-1 text-sm text-slate-400">{band.message}</p>
              <p className="mt-3 text-xs text-slate-500">
                This foundation score currently uses Inventory, Purchasing and Compliance signals. Assets, Estates, Workforce and Governance are ready for future modules.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {pulse.modules.map((module) => {
              const moduleBand = getPulseBand(module.score);
              const route = MODULE_ROUTES[module.key] || '/dashboard';

              return (
                <button
                  key={module.key}
                  type="button"
                  onClick={() => {
                    updateState({ expanded: false });
                    navigate(route);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left hover:bg-slate-800"
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${moduleBand.dotClass}`} />
                    <span className="text-sm text-slate-200">{module.label}</span>
                  </span>
                  <span className="flex items-center gap-2 text-sm font-bold text-white">
                    {module.score}% <ChevronRight className="h-4 w-4 text-slate-500" />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attention</div>
            {pulse.issues.length === 0 ? (
              <p className="mt-1 text-sm text-slate-300">No current issues detected.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {pulse.issues.slice(0, 4).map((issue, index) => (
                  <div key={`${issue.moduleKey}-${index}`} className="text-sm text-slate-300">
                    <span className="font-semibold text-slate-100">{issue.moduleLabel}:</span> {issue.text}
                  </div>
                ))}
                {pulse.issues.length > 4 && <div className="text-xs text-slate-500">+ {pulse.issues.length - 4} more</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
