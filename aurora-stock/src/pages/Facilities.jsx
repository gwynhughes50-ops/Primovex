import { useMemo, useState } from 'react';
import {
  AlertTriangle, Building2, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck,
  Filter, History, MapPin, PackageSearch, Plus, RotateCcw, Search, Sparkles, UserRound,
  Wrench, X, XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { loadFacilitiesState, resetFacilitiesState, saveFacilitiesState } from '@/modules/facilities/services/facilitiesStore';

const panel = 'rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] shadow-xl shadow-black/10';
const muted = 'text-[color:var(--medtrak-muted)]';
const text = 'text-[color:var(--medtrak-text)]';
const soft = 'bg-[color:color-mix(in_srgb,var(--medtrak-accent)_12%,transparent)]';
const button = 'rounded-xl border border-[color:var(--medtrak-border)] px-3 py-2 text-sm transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[color:var(--medtrak-accent)]';

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatShort(value) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function getNextCleanAt(room) {
  if (!room.lastCleanedAt) return null;
  return new Date(new Date(room.lastCleanedAt).getTime() + (room.cleaningFrequencyHours || 24) * 3600000);
}

function getRoomOperationalStatus(room, maintenance) {
  const next = getNextCleanAt(room);
  const overdue = !next || next.getTime() < Date.now();
  const hasOpenIssue = maintenance.some((item) => item.roomId === room.id && item.status !== 'closed');
  if (hasOpenIssue || overdue || room.status === 'attention') return overdue ? 'overdue' : 'attention';
  return 'ready';
}

function StatusPill({ status }) {
  const styles = {
    ready: 'bg-emerald-500/15 text-emerald-300',
    attention: 'bg-amber-500/15 text-amber-300',
    overdue: 'bg-rose-500/15 text-rose-300',
    closed: 'bg-emerald-500/15 text-emerald-300',
    open: 'bg-amber-500/15 text-amber-300',
  };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${styles[status] || soft}`}>{status}</span>;
}

export default function Facilities() {
  const { displayName, user } = useAuth();
  const [state, setState] = useState(() => loadFacilitiesState());
  const [tab, setTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(null);
  const [newIssue, setNewIssue] = useState('');
  const [issuePriority, setIssuePriority] = useState('medium');
  const [historyRoom, setHistoryRoom] = useState('all');
  const [historyPerson, setHistoryPerson] = useState('all');

  const actor = displayName || user?.email || 'Signed-in user';
  const today = new Date().toDateString();

  const roomRows = useMemo(() => state.rooms.map((room) => ({
    ...room,
    operationalStatus: getRoomOperationalStatus(room, state.maintenance),
    nextCleanAt: getNextCleanAt(room),
    equipmentCount: state.equipment.filter((item) => item.roomId === room.id).length,
    openIssues: state.maintenance.filter((item) => item.roomId === room.id && item.status !== 'closed').length,
  })), [state]);

  const metrics = useMemo(() => {
    const cleanedToday = state.rooms.filter((room) => room.lastCleanedAt && new Date(room.lastCleanedAt).toDateString() === today).length;
    const openMaintenance = state.maintenance.filter((item) => item.status !== 'closed').length;
    const readyRooms = roomRows.filter((room) => room.operationalStatus === 'ready').length;
    const overdueRooms = roomRows.filter((room) => room.operationalStatus === 'overdue').length;
    return { cleanedToday, openMaintenance, readyRooms, overdueRooms, equipment: state.equipment.length };
  }, [state, roomRows, today]);

  const filteredRooms = roomRows.filter((room) => `${room.name} ${room.id} ${room.type} ${room.zone}`.toLowerCase().includes(query.toLowerCase()));
  const selectedRoom = roomRows.find((room) => room.id === selectedRoomId);
  const selectedEquipment = state.equipment.find((item) => item.id === selectedEquipmentId);
  const cleaners = [...new Set(state.cleaningLogs.map((log) => log.cleanedBy).filter(Boolean))];
  const filteredLogs = state.cleaningLogs.filter((log) => (historyRoom === 'all' || log.roomId === historyRoom) && (historyPerson === 'all' || log.cleanedBy === historyPerson));

  function commit(next) {
    setState(next);
    saveFacilitiesState(next);
  }

  function markCleaned(roomId) {
    const timestamp = new Date().toISOString();
    const room = state.rooms.find((item) => item.id === roomId);
    commit({
      ...state,
      rooms: state.rooms.map((item) => item.id === roomId ? { ...item, lastCleanedAt: timestamp, lastCleanedBy: actor, status: 'ready' } : item),
      cleaningLogs: [{ id: crypto.randomUUID(), roomId, roomName: room?.name || 'Room', cleanedAt: timestamp, cleanedBy: actor, method: 'one-tap-confirmation' }, ...state.cleaningLogs],
    });
  }

  function addIssue() {
    if (!selectedRoom || !newIssue.trim()) return;
    commit({
      ...state,
      maintenance: [{ id: crypto.randomUUID(), roomId: selectedRoom.id, title: newIssue.trim(), priority: issuePriority, status: 'open', assignedTo: 'Caretaker', reportedAt: new Date().toISOString(), reportedBy: actor }, ...state.maintenance],
      rooms: state.rooms.map((room) => room.id === selectedRoom.id ? { ...room, status: 'attention' } : room),
    });
    setNewIssue('');
    setIssuePriority('medium');
  }

  function closeIssue(issueId) {
    const issue = state.maintenance.find((item) => item.id === issueId);
    const nextMaintenance = state.maintenance.map((item) => item.id === issueId ? { ...item, status: 'closed', closedAt: new Date().toISOString(), closedBy: actor } : item);
    const roomHasOtherOpenIssues = nextMaintenance.some((item) => item.roomId === issue?.roomId && item.status !== 'closed');
    commit({
      ...state,
      maintenance: nextMaintenance,
      rooms: state.rooms.map((room) => room.id === issue?.roomId && !roomHasOtherOpenIssues ? { ...room, status: 'ready' } : room),
    });
  }

  function moveEquipment(equipmentId, roomId) {
    const item = state.equipment.find((equipment) => equipment.id === equipmentId);
    if (!item || item.roomId === roomId) return;
    const timestamp = new Date().toISOString();
    commit({
      ...state,
      equipment: state.equipment.map((equipment) => equipment.id === equipmentId ? { ...equipment, roomId, lastSeenAt: timestamp, lastSeenBy: actor } : equipment),
      equipmentMovements: [{ id: crypto.randomUUID(), equipmentId, fromRoomId: item.roomId, toRoomId: roomId, movedAt: timestamp, movedBy: actor }, ...state.equipmentMovements],
    });
  }

  const tabs = ['overview', 'rooms', 'cleaning', 'equipment', 'maintenance'];

  return (
    <div className={`space-y-5 ${text}`}>
      <section className={`${panel} overflow-hidden p-5 sm:p-7`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--medtrak-accent)]"><Building2 className="h-4 w-4" /> Primovex Facilities</div>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Digital rooms and building readiness</h1>
            <p className={`mt-2 max-w-3xl text-sm ${muted}`}>A live operational identity for every room, including cleaning, equipment and maintenance. NFC tags will open the correct room card directly.</p>
          </div>
          <button onClick={() => commit(resetFacilitiesState())} className={button}><RotateCcw className="mr-2 inline h-4 w-4" /> Reset demo</button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Rooms ready', `${metrics.readyRooms}/${state.rooms.length}`, CheckCircle2],
          ['Overdue rooms', metrics.overdueRooms, AlertTriangle],
          ['Cleaned today', `${metrics.cleanedToday}/${state.rooms.length}`, ClipboardCheck],
          ['Open maintenance', metrics.openMaintenance, Wrench],
          ['Tracked equipment', metrics.equipment, MapPin],
        ].map(([label, value, Icon]) => <div key={label} className={`${panel} p-4`}><div className="flex items-center justify-between"><span className={`text-sm ${muted}`}>{label}</span><Icon className="h-5 w-5 text-[color:var(--medtrak-accent)]" /></div><div className="mt-3 text-2xl font-semibold">{value}</div></div>)}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-sm capitalize ${tab === item ? 'bg-[color:var(--medtrak-accent)] text-white' : 'border border-[color:var(--medtrak-border)] hover:bg-white/5'}`}>{item}</button>)}
      </div>

      {(tab === 'overview' || tab === 'rooms') && (
        <section className={`${panel} p-4 sm:p-5`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-lg font-semibold">Room registry</h2><p className={`text-sm ${muted}`}>Open a room to clean it, review equipment, or report an issue.</p></div>
            <label className="relative block sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--medtrak-muted)]"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search room name or ID" className="w-full rounded-xl border border-[color:var(--medtrak-border)] bg-transparent py-2 pl-9 pr-3 outline-none focus:ring-2 focus:ring-[color:var(--medtrak-accent)]" /></label>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredRooms.map((room) => (
              <button key={room.id} onClick={() => setSelectedRoomId(room.id)} className="group rounded-2xl border border-[color:var(--medtrak-border)] p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/5">
                <div className="flex items-start justify-between gap-3"><div><p className={`text-[11px] font-semibold tracking-wide ${muted}`}>{room.id}</p><h3 className="mt-1 font-semibold">{room.name}</h3><p className={`mt-1 text-xs ${muted}`}>{room.floor} • {room.zone}</p></div><StatusPill status={room.operationalStatus} /></div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><span className={`block text-xs ${muted}`}>Last cleaned</span><span className="mt-1 block font-medium">{room.lastCleanedAt ? formatDate(room.lastCleanedAt) : 'Not recorded'}</span></div><div><span className={`block text-xs ${muted}`}>Next clean</span><span className="mt-1 block font-medium">{room.nextCleanAt ? formatDate(room.nextCleanAt) : 'Due now'}</span></div></div>
                <div className={`mt-4 flex items-center justify-between border-t border-[color:var(--medtrak-border)] pt-3 text-xs ${muted}`}><span>{room.equipmentCount} equipment • {room.openIssues} issues</span><span className="flex items-center gap-1 text-[color:var(--medtrak-accent)]">Open <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span></div>
              </button>
            ))}
          </div>
        </section>
      )}

      {tab === 'cleaning' && (
        <section className={`${panel} p-4 sm:p-5`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-lg font-semibold">Cleaning history</h2><p className={`text-sm ${muted}`}>Timestamped audit trail of room cleaning confirmations.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="text-xs"><span className={`mb-1 block ${muted}`}>Room</span><select value={historyRoom} onChange={(e)=>setHistoryRoom(e.target.value)} className="rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3 py-2 text-sm"><option value="all">All rooms</option>{state.rooms.map((room)=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label className="text-xs"><span className={`mb-1 block ${muted}`}>Cleaner</span><select value={historyPerson} onChange={(e)=>setHistoryPerson(e.target.value)} className="rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3 py-2 text-sm"><option value="all">All staff</option>{cleaners.map((person)=><option key={person} value={person}>{person}</option>)}</select></label></div></div>
          <div className="mt-5 space-y-2">{filteredLogs.length === 0 && <p className={muted}>No cleaning records match these filters.</p>}{filteredLogs.map((log)=><div key={log.id} className="grid gap-2 rounded-xl border border-[color:var(--medtrak-border)] p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><div className="font-medium">{log.roomName}</div><div className={`text-xs ${muted}`}>{log.roomId}</div></div><div className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4 text-[color:var(--medtrak-accent)]" /> {log.cleanedBy}</div><div className={`text-sm ${muted}`}>{formatDate(log.cleanedAt)}</div></div>)}</div>
        </section>
      )}

      {tab === 'equipment' && (
        <section className={`${panel} p-5`}><div><h2 className="text-lg font-semibold">Equipment registry</h2><p className={`text-sm ${muted}`}>Current location, movement history and service readiness.</p></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{state.equipment.map((item) => { const room=state.rooms.find(r=>r.id===item.roomId); return <button onClick={()=>setSelectedEquipmentId(item.id)} key={item.id} className="rounded-xl border border-[color:var(--medtrak-border)] p-4 text-left transition hover:bg-white/5"><div className="flex items-start justify-between gap-3"><div><p className={`text-[11px] font-semibold ${muted}`}>{item.id}</p><div className="mt-1 font-medium">{item.name}</div><div className={`text-sm ${muted}`}>{item.category}</div></div><StatusPill status={item.status === 'in-service' ? 'ready' : 'attention'} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><span className={`block text-xs ${muted}`}>Last known room</span><span className="font-medium">{room?.name || 'Unknown'}</span></div><div><span className={`block text-xs ${muted}`}>Last seen</span><span className="font-medium">{formatDate(item.lastSeenAt)}</span></div><div><span className={`block text-xs ${muted}`}>Service due</span><span>{formatShort(item.serviceDue)}</span></div><div><span className={`block text-xs ${muted}`}>PAT due</span><span>{formatShort(item.patDue)}</span></div></div></button>})}</div></section>
      )}

      {tab === 'maintenance' && (
        <section className={`${panel} p-5`}><div><h2 className="text-lg font-semibold">Maintenance</h2><p className={`text-sm ${muted}`}>Issues reported from digital room cards and assigned to the caretaker.</p></div><div className="mt-4 space-y-3">{state.maintenance.length === 0 && <p className={muted}>No maintenance issues.</p>}{state.maintenance.map((item) => { const room=state.rooms.find(r=>r.id===item.roomId); return <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-[color:var(--medtrak-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.title}</span><StatusPill status={item.status} /><span className={`rounded-full px-2 py-1 text-[11px] capitalize ${item.priority === 'high' ? 'bg-rose-500/15 text-rose-300' : item.priority === 'medium' ? 'bg-amber-500/15 text-amber-300' : soft}`}>{item.priority}</span></div><div className={`mt-1 text-sm ${muted}`}>{room?.name || 'Unknown room'} • Assigned to {item.assignedTo || 'Caretaker'} • {formatDate(item.reportedAt)}</div></div>{item.status === 'closed' ? <span className="text-sm text-emerald-300">Completed by {item.closedBy}</span> : <button onClick={()=>closeIssue(item.id)} className={button}>Mark complete</button>}</div>})}</div></section>
      )}

      {selectedRoom && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={()=>setSelectedRoomId(null)}><div className={`${panel} max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-b-none p-5 sm:rounded-2xl`} onClick={(e)=>e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--medtrak-accent)]">Digital room • {selectedRoom.id}</p><h2 className="mt-1 text-2xl font-semibold">{selectedRoom.name}</h2><p className={`mt-1 text-sm ${muted}`}>{selectedRoom.site} • {selectedRoom.floor} • {selectedRoom.zone}</p></div><button onClick={()=>setSelectedRoomId(null)} className="rounded-full p-2 hover:bg-white/5"><X className="h-5 w-5"/></button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className={`rounded-2xl p-4 ${soft}`}><span className={`text-xs ${muted}`}>Room status</span><div className="mt-2"><StatusPill status={selectedRoom.operationalStatus} /></div></div><div className="rounded-2xl border border-[color:var(--medtrak-border)] p-4"><span className={`text-xs ${muted}`}>Last cleaned</span><div className="mt-1 font-semibold">{formatDate(selectedRoom.lastCleanedAt)}</div><div className={`text-xs ${muted}`}>{selectedRoom.lastCleanedBy || 'No cleaner recorded'}</div></div><div className="rounded-2xl border border-[color:var(--medtrak-border)] p-4"><span className={`text-xs ${muted}`}>Next clean due</span><div className="mt-1 font-semibold">{selectedRoom.nextCleanAt ? formatDate(selectedRoom.nextCleanAt) : 'Due now'}</div><div className={`text-xs ${muted}`}>Every {selectedRoom.cleaningFrequencyHours} hours</div></div></div>
        <button onClick={()=>markCleaned(selectedRoom.id)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--medtrak-accent)] px-4 py-4 text-base font-semibold text-white"><Sparkles className="h-5 w-5"/> Room cleaned: YES</button><p className={`mt-2 text-center text-xs ${muted}`}>One confirmation records the signed-in user, room and exact time. NFC will open this card directly.</p>
        <div className="mt-6 grid gap-5 lg:grid-cols-2"><div><h3 className="font-semibold">Equipment in this room</h3><div className="mt-2 space-y-2">{state.equipment.filter((item)=>item.roomId===selectedRoom.id).length === 0 && <p className={`text-sm ${muted}`}>No equipment currently assigned.</p>}{state.equipment.filter((item)=>item.roomId===selectedRoom.id).map((item)=><button key={item.id} onClick={()=>setSelectedEquipmentId(item.id)} className="flex w-full items-center justify-between rounded-xl border border-[color:var(--medtrak-border)] p-3 text-left hover:bg-white/5"><span><span className="block font-medium">{item.name}</span><span className={`text-xs ${muted}`}>{item.id}</span></span><ChevronRight className="h-4 w-4" /></button>)}</div></div><div><h3 className="font-semibold">Report an issue</h3><div className="mt-2 space-y-2"><input value={newIssue} onChange={(e)=>setNewIssue(e.target.value)} placeholder="e.g. hand dryer not working" className="w-full rounded-xl border border-[color:var(--medtrak-border)] bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-[color:var(--medtrak-accent)]"/><div className="flex gap-2"><select value={issuePriority} onChange={(e)=>setIssuePriority(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3 py-2 text-sm"><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option></select><button onClick={addIssue} className={`${button} flex items-center gap-2`}><Plus className="h-4 w-4"/> Add</button></div></div></div></div>
        {selectedRoom.notes && <div className={`mt-5 rounded-xl p-4 ${soft}`}><div className="text-sm font-medium">Room notes</div><p className={`mt-1 text-sm ${muted}`}>{selectedRoom.notes}</p></div>}
      </div></div>}

      {selectedEquipment && <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={()=>setSelectedEquipmentId(null)}><div className={`${panel} w-full max-w-lg rounded-b-none p-5 sm:rounded-2xl`} onClick={(e)=>e.stopPropagation()}><div className="flex items-start justify-between"><div><p className={`text-xs font-semibold ${muted}`}>{selectedEquipment.id}</p><h2 className="mt-1 text-xl font-semibold">{selectedEquipment.name}</h2><p className={`text-sm ${muted}`}>{selectedEquipment.category}</p></div><button onClick={()=>setSelectedEquipmentId(null)} className="rounded-full p-2 hover:bg-white/5"><X className="h-5 w-5"/></button></div><div className="mt-5"><label className={`text-xs ${muted}`}>Current recorded room</label><select value={selectedEquipment.roomId} onChange={(e)=>moveEquipment(selectedEquipment.id,e.target.value)} className="mt-1 w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel)] px-3 py-3">{state.rooms.map((room)=><option key={room.id} value={room.id}>{room.name}</option>)}</select><p className={`mt-2 text-xs ${muted}`}>Changing the room creates a timestamped movement record under the signed-in user.</p></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl border border-[color:var(--medtrak-border)] p-3"><span className={`text-xs ${muted}`}>Last seen</span><div className="mt-1 text-sm font-medium">{formatDate(selectedEquipment.lastSeenAt)}</div><div className={`text-xs ${muted}`}>{selectedEquipment.lastSeenBy}</div></div><div className="rounded-xl border border-[color:var(--medtrak-border)] p-3"><span className={`text-xs ${muted}`}>Service due</span><div className="mt-1 text-sm font-medium">{formatShort(selectedEquipment.serviceDue)}</div><span className={`text-xs ${muted}`}>PAT: {formatShort(selectedEquipment.patDue)}</span></div></div></div></div>}
    </div>
  );
}
