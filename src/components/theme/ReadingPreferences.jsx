import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_READING, loadReading, normaliseReading, readingKey } from './readingSettings';
import './readingPreferences.css';

const Context = createContext(null);
function readSaved(key) { try { return loadReading(window.localStorage, key); } catch { return { ...DEFAULT_READING }; } }
export function ReadingPreferencesProvider({ children }) {
  const { user } = useAuth();
  const key = readingKey(user?.uid, document.documentElement.dataset.primovexClient);
  const [state, setState] = useState(() => ({ key, value: readSaved(key) }));
  const [saved, setSaved] = useState(true);
  const value = state.key === key ? state.value : readSaved(key);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.readingFont = value.font;
    root.dataset.readingSize = value.size;
    root.dataset.readingSpacing = value.spacing;
    root.dataset.readingMotion = value.motion;
    return () => { ['readingFont', 'readingSize', 'readingSpacing', 'readingMotion'].forEach(k => delete root.dataset[k]); };
  }, [key, value.font, value.size, value.spacing, value.motion]);
  function update(next) {
    const safe = normaliseReading({ ...value, ...next });
    setState({ key, value: safe });
    try { localStorage.setItem(key, JSON.stringify(safe)); setSaved(true); } catch { setSaved(false); }
  }
  return <Context.Provider value={{ value, update, saved, reset: () => update(DEFAULT_READING) }}>{children}</Context.Provider>;
}
export function ReadingControls() {
  const { value, update, reset, saved } = useContext(Context);
  return <section className="reading-panel" aria-labelledby="reading-heading">
    <h2 id="reading-heading">Reading comfort</h2>
    <p>Choose what feels easiest to read. These settings work with every colour theme.</p>
    <div className="reading-actions">
      <button type="button" onClick={() => update({ font: 'verdana', size: 'large', spacing: 'comfortable', motion: 'reduced' })}>Use reading comfort preset</button>
      <button type="button" onClick={reset}>Reset reading settings</button>
    </div>
    <p>No single font suits everyone. Try the preset, then adjust it to your preference.</p>
    <div className="reading-controls">
      <Choice label="Font" value={value.font} options={[["system", "Primovex default"], ["arial", "Arial"], ["verdana", "Verdana"]]} onChange={font => update({font})} />
      <Choice label="Text size" value={value.size} options={[["standard", "Standard"], ["large", "Large · 112.5%"], ["extra-large", "Extra large · 125%"]]} onChange={size => update({size})} />
      <Choice label="Spacing" value={value.spacing} options={[["standard", "Standard"], ["comfortable", "Comfortable"]]} onChange={spacing => update({spacing})} />
      <Choice label="Motion" value={value.motion} options={[["system", "Follow device preference"], ["reduced", "Reduce motion"]]} onChange={motion => update({motion})} />
    </div>
    <p role="status">{saved ? 'Reading preferences are saved for your account on this device. Other devices can use different settings.' : 'Applied for this session. Your browser could not save these settings.'}</p>
    <article className="reading-preview" aria-labelledby="reading-preview-title">
      <span>Live preview · example only</span>
      <h3 id="reading-preview-title">Your practice, clearly presented</h3>
      <p>Review the checks due today, find the information you need and choose your next action. This preview changes as you adjust your reading preferences.</p>
      <label>Example search<input placeholder="Find stock or equipment" type="search" /></label>
      <p><strong>Check due</strong> — Review the details before recording a result.</p>
    </article>
  </section>;
}
function Choice({label, value, options, onChange}) {
  return <label>{label}<select value={value} onChange={e => onChange(e.target.value)}>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
}
