import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bug, Maximize2, Minimize2, Ruler, ShieldCheck, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MobileLayout from '@/mobile/MobileLayout';
import { useAuth } from '@/contexts/AuthContext';
import { developerAccessAllowed } from '@/developer/developerAccess';
import MobileDeveloperIssueRecorder from '@/developer/MobileDeveloperIssueRecorder';

const DEVICES = {
  pixel7: { label: 'Pixel 7', width: 412, height: 915 },
  galaxy: { label: 'Galaxy S24', width: 384, height: 832 },
  iphone: { label: 'iPhone 15', width: 393, height: 852 },
  small: { label: 'Small Android', width: 360, height: 740 },
};

export default function DeveloperMobilePreview() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const allowed = developerAccessAllowed(role);
  const [deviceKey, setDeviceKey] = useState('pixel7');
  const [showInspector, setShowInspector] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const device = DEVICES[deviceKey];

  useEffect(() => {
    document.documentElement.dataset.primovexPreview = 'mobile';
    return () => delete document.documentElement.dataset.primovexPreview;
  }, []);

  const scale = useMemo(() => {
    if (fullscreen) return 1;
    const availableHeight = Math.max(520, window.innerHeight - 150);
    const availableWidth = Math.max(360, window.innerWidth - 80);
    return Math.min(1, availableHeight / device.height, availableWidth / device.width);
  }, [device, fullscreen]);

  if (!allowed) {
    return <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><div className="max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10"/><h1 className="mt-4 text-2xl font-bold">Mobile Preview locked</h1><button onClick={() => navigate('/developer-centre')} className="mt-5 rounded-xl bg-blue-600 px-4 py-2 font-semibold">Return</button></div></div>;
  }

  return <div className="min-h-screen bg-slate-950 text-white">
    <header className="sticky top-0 z-[200] flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3"><button onClick={() => navigate('/developer-centre')} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold"><ArrowLeft className="h-4 w-4"/>Exit preview</button><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-300">Developer mobile preview</p><p className="text-sm text-slate-300">Real Primovex mobile shell</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={deviceKey} onChange={(e) => setDeviceKey(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm">{Object.entries(DEVICES).map(([key, item]) => <option key={key} value={key}>{item.label} · {item.width}×{item.height}</option>)}</select>
        <button onClick={() => setShowInspector((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold"><Ruler className="h-4 w-4"/>{showInspector ? 'Hide' : 'Show'} overlay</button>
        <button onClick={() => setFullscreen((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold">{fullscreen ? <Minimize2 className="h-4 w-4"/> : <Maximize2 className="h-4 w-4"/>}{fullscreen ? 'Phone frame' : 'Fill window'}</button>
      </div>
    </header>

    <main className={fullscreen ? 'relative' : 'flex justify-center overflow-auto p-5'}>
      <div
        className={fullscreen ? 'relative min-h-[calc(100vh-73px)] overflow-hidden bg-white' : 'relative origin-top overflow-hidden rounded-[32px] border-[10px] border-slate-800 bg-white shadow-2xl'}
        style={fullscreen ? undefined : { width: device.width, height: device.height, transform: `scale(${scale})`, marginBottom: `${device.height * (scale - 1)}px` }}
      >
        {!fullscreen && <div className="pointer-events-none absolute left-1/2 top-2 z-[190] h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900"/>}
        <div className="h-full overflow-y-auto" style={{ width: fullscreen ? '100%' : device.width, height: fullscreen ? 'calc(100vh - 73px)' : device.height }}>
          <MobileLayout />
          <MobileDeveloperIssueRecorder />
        </div>
        {showInspector && <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[180] h-8 border-b-2 border-dashed border-cyan-400 bg-cyan-400/10"/>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[180] h-24 border-t-2 border-dashed border-amber-400 bg-amber-400/10"/>
          <div className="pointer-events-none absolute inset-2 z-[179] rounded-[22px] border border-dashed border-fuchsia-400"/>
          <div className="pointer-events-none absolute left-3 top-10 z-[181] rounded bg-slate-950/85 px-2 py-1 text-[10px] text-cyan-200">top safe area</div>
          <div className="pointer-events-none absolute bottom-24 left-3 z-[181] rounded bg-slate-950/85 px-2 py-1 text-[10px] text-amber-200">bottom navigation exclusion zone</div>
        </>}
      </div>
    </main>
  </div>;
}
