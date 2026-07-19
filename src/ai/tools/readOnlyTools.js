import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getFacilitiesSnapshot } from '@/modules/facilities/services/facilitiesStore';
import { buildOperationsTimeline, changesSince } from '@/operations/engine/operationsTimeline';
import { getOperationsSummary } from '@/operations/tools/operationsSummaryTool';
import { registerTool } from './toolRegistry';
import { getLatestCheck, listAnaphylaxisBoxes, listEmergencyAssets } from '@/lib/checklistsFirestore';

const nowLabel = () => new Date().toLocaleString('en-GB');
const source = (title, detail, type = 'module') => ({ title, detail, type });
const activeItems = (docs) => docs.map((d) => ({ id: d.id, ...d.data() })).filter((item) => !item.archived_at);
const itemLabel = (item) => [item.name, item.strength, item.form].filter(Boolean).join(' ');

async function readStock() {
  const snap = await getDocs(collection(db, 'stock_items'));
  return activeItems(snap.docs);
}

function isExpiringWithin(value, days = 60) {
  if (!value) return false;
  const expiry = new Date(`${value}T23:59:59`);
  if (Number.isNaN(expiry.getTime())) return false;
  const diff = expiry.getTime() - Date.now();
  return diff >= 0 && diff <= days * 86400000;
}

export function registerApprovedReadOnlyTools() {
  const registerClinicalReadinessTool = ({ id, label, collectionName, listEntities, route }) => registerTool({
    id, label, requiredCapability: 'inventory.read',
    async execute({ mode = 'status' } = {}) {
      const entities = await listEntities();
      const checks = await Promise.allSettled(entities.map((entity) => getLatestCheck(collectionName, entity.id)));
      const rows = entities.map((entity, index) => {
        const check = checks[index]?.status === 'fulfilled' ? checks[index].value : null;
        const readiness = check?.readiness || {};
        return { id: entity.id, name: entity.name || entity.id, location: entity.location || null, score: Number.isFinite(readiness.score) ? readiness.score : null, status: readiness.status || (check ? 'recorded' : 'unknown'), missing: readiness.missing || 0, expired: readiness.expired || 0, expiringSoon: readiness.expiringSoon || 0, checkedAt: check?.createdAt?.toDate?.()?.toISOString?.() || null };
      });
      const action = rows.filter((row) => row.score == null || row.status === 'critical' || row.missing || row.expired);
      const summary = !rows.length
        ? `No ${label.toLowerCase()} are configured.`
        : action.length
          ? `${action.length} of ${rows.length} ${label.toLowerCase()} need verification or action: ${action.slice(0, 6).map((row) => `${row.name}${row.score == null ? ' has no verified readiness check' : ` is ${row.score}% ready`}`).join('; ')}.`
          : `All ${rows.length} ${label.toLowerCase()} have recorded checks with no missing or expired items.`;
      return { data: rows, summary: mode === 'reconcile' ? `${summary} Open Inventory to perform the governed reconciliation.` : summary, confidence: rows.length ? 0.96 : 0.7, sources: [source(label, `${rows.length} configured asset${rows.length === 1 ? '' : 's'} and latest checks read ${nowLabel()}`)], actions: [{ label: mode === 'reconcile' ? 'Start reconciliation' : `Open ${label}`, route }], warnings: checks.some((result) => result.status === 'rejected') ? ['Some latest checks could not be read'] : [] };
    },
  });

  registerClinicalReadinessTool({ id: 'emergency.readiness', label: 'Emergency drugs and equipment', collectionName: 'emergency_assets', listEntities: listEmergencyAssets, route: '/inventory?tab=emergency' });
  registerClinicalReadinessTool({ id: 'anaphylaxis.readiness', label: 'Anaphylaxis boxes', collectionName: 'anaphylaxis_boxes', listEntities: listAnaphylaxisBoxes, route: '/inventory?tab=anaphylaxis' });

  registerTool({
    id: 'operations.summary', label: 'Operations summary', requiredCapability: 'operations.read',
    async execute() {
      const summary = getOperationsSummary();
      const priorities = summary.priorities?.slice(0, 5) || [];
      return {
        data: summary,
        summary: `${summary.readiness.overall == null ? 'Practice readiness is awaiting connected data' : `Practice readiness is ${summary.readiness.overall}%`}. ${priorities.length ? priorities.map((p) => p.title).join('; ') : 'No connected priorities need attention.'}`,
        confidence: summary.connectedModules ? Math.min(0.98, 0.72 + summary.connectedModules * 0.06) : 0.55,
        sources: [source('Primovex Operations Engine', `${summary.connectedModules || 0} approved contributors · generated ${nowLabel()}`, 'system')],
        actions: [{ label: 'Open Dashboard', route: '/dashboard' }],
        warnings: summary.unconnectedModules?.length ? [`Not connected: ${summary.unconnectedModules.join(', ')}`] : [],
      };
    },
  });

  registerTool({
    id: 'operations.timeline', label: 'Operations timeline', requiredCapability: 'operations.read',
    async execute({ sinceYesterday = true } = {}) {
      const timeline = buildOperationsTimeline();
      const since = new Date();
      if (sinceYesterday) { since.setDate(since.getDate() - 1); since.setHours(0, 0, 0, 0); }
      const events = sinceYesterday ? changesSince(timeline, since) : timeline;
      return {
        data: events,
        summary: events.length ? events.slice(0, 8).map((e) => e.title).join('; ') : 'No connected operational changes have been recorded in this period.',
        confidence: 0.97,
        sources: [source('Primovex Operations Timeline', `${events.length} recorded event${events.length === 1 ? '' : 's'} · read ${nowLabel()}`, 'system')],
        actions: [{ label: 'Open Dashboard', route: '/dashboard' }],
      };
    },
  });


  registerTool({
    id: 'inventory.summary', label: 'Inventory summary', requiredCapability: 'inventory.read',
    async execute() {
      const items = await readStock();
      const low = items.filter((i) => Number(i.current_stock || 0) <= Number(i.min_stock || 0));
      const out = items.filter((i) => Number(i.current_stock || 0) <= 0);
      const expiring60 = items.filter((i) => isExpiringWithin(i.expiry_date, 60));
      const totalUnits = items.reduce((sum, item) => sum + Math.max(0, Number(item.current_stock || 0)), 0);
      const parts = [
        `${items.length} active stock item${items.length === 1 ? '' : 's'}`,
        `${totalUnits} total unit${totalUnits === 1 ? '' : 's'} recorded`,
        `${low.length} at or below minimum`,
        `${out.length} out of stock`,
        `${expiring60.length} expiring within 60 days`,
      ];
      return {
        data: { items, counts: { active: items.length, totalUnits, low: low.length, outOfStock: out.length, expiringWithin60Days: expiring60.length } },
        summary: `Inventory summary: ${parts.join('; ')}.`,
        confidence: 0.99,
        sources: [source('Inventory', `${items.length} active items checked · live read ${nowLabel()}`)],
        actions: [{ label: 'Open Inventory', route: '/inventory' }],
      };
    },
  });

  registerTool({
    id: 'inventory.search', label: 'Inventory search', requiredCapability: 'inventory.read',
    async execute({ query: search = '' } = {}) {
      const term = String(search).trim().toLowerCase();
      const items = await readStock();
      const matches = items.filter((item) => !term || [item.name, item.strength, item.form, item.brand, item.barcode, item.location, item.site].some((v) => String(v || '').toLowerCase().includes(term))).slice(0, 20);
      return {
        data: matches,
        summary: matches.length ? `${matches.length} matching item${matches.length === 1 ? '' : 's'}: ${matches.slice(0, 8).map((i) => `${itemLabel(i)} (${Number(i.current_stock || 0)} in stock)`).join('; ')}.` : `No active inventory items matched “${search}”.`,
        confidence: 0.99,
        sources: [source('Inventory', `${items.length} active items checked · live read ${nowLabel()}`)],
        actions: [{ label: 'Open Inventory', route: '/inventory' }],
      };
    },
  });

  registerTool({
    id: 'inventory.lowStock', label: 'Low stock', requiredCapability: 'inventory.read',
    async execute() {
      const items = await readStock();
      const matches = items.filter((i) => Number(i.current_stock || 0) <= Number(i.min_stock || 0)).sort((a, b) => (Number(a.current_stock || 0) - Number(a.min_stock || 0)) - (Number(b.current_stock || 0) - Number(b.min_stock || 0)));
      return {
        data: matches,
        summary: matches.length ? `${matches.length} low-stock item${matches.length === 1 ? '' : 's'}: ${matches.slice(0, 10).map((i) => `${itemLabel(i)} ${Number(i.current_stock || 0)}/${Number(i.min_stock || 0)}`).join('; ')}.` : 'No active items are at or below their minimum stock level.',
        confidence: 0.99,
        sources: [source('Inventory', `${items.length} active items checked against minimum stock · ${nowLabel()}`)],
        actions: [{ label: 'Open Inventory', route: '/inventory' }],
      };
    },
  });

  registerTool({
    id: 'inventory.expiring', label: 'Expiring stock', requiredCapability: 'inventory.read',
    async execute({ days = 60 } = {}) {
      const items = await readStock();
      const matches = items.filter((i) => isExpiringWithin(i.expiry_date, days)).sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
      return {
        data: matches,
        summary: matches.length
          ? `${matches.length} item${matches.length === 1 ? '' : 's'} expire within ${days} days: ${matches.slice(0, 10).map((i) => `${itemLabel(i)} on ${i.expiry_date}`).join('; ')}.`
          : (() => {
              const future = items
                .filter((i) => i.expiry_date && new Date(`${i.expiry_date}T23:59:59`).getTime() > Date.now())
                .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)))[0];
              return future
                ? `No active stock expires within ${days} days. The next recorded expiry is ${itemLabel(future)} on ${future.expiry_date}.`
                : `No active stock expires within ${days} days, and no later valid expiry date is recorded.`;
            })(),
        confidence: 0.98,
        sources: [source('Inventory expiry register', `${items.length} active items checked · ${nowLabel()}`)],
        actions: [{ label: 'Open Inventory', route: '/inventory' }],
      };
    },
  });

  registerTool({
    id: 'facilities.roomStatus', label: 'Room status', requiredCapability: 'operations.read',
    execute({ room = '' } = {}) {
      const state = getFacilitiesSnapshot();
      const term = String(room).trim().toLowerCase();
      const match = state.rooms.find((r) => r.name.toLowerCase().includes(term) || String(r.slug || '').replaceAll('-', ' ').includes(term));
      if (!match) return { data: null, summary: `I could not find a room matching “${room}”.`, confidence: 0.86, sources: [source('Facilities room registry', `${state.rooms.length} rooms checked · local read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
      const cleanedToday = match.lastCleanedAt && new Date(match.lastCleanedAt).toDateString() === new Date().toDateString();
      return { data: match, summary: cleanedToday ? `${match.name} was cleaned today at ${new Date(match.lastCleanedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} by ${match.lastCleanedBy}.` : `${match.name} has not been marked as cleaned today. Last recorded clean: ${match.lastCleanedAt ? new Date(match.lastCleanedAt).toLocaleString('en-GB') : 'none'}.`, confidence: 0.99, sources: [source(match.name, `Facilities room record · local read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
    },
  });

  registerTool({
    id: 'facilities.cleaningStatus', label: 'Cleaning status', requiredCapability: 'operations.read',
    execute() {
      const state = getFacilitiesSnapshot();
      const today = new Date().toDateString();
      const overdue = state.rooms.filter((r) => !r.lastCleanedAt || new Date(r.lastCleanedAt).toDateString() !== today);
      return { data: overdue, summary: overdue.length ? `${overdue.length} room${overdue.length === 1 ? '' : 's'} not marked as cleaned today: ${overdue.map((r) => r.name).join(', ')}.` : `All ${state.rooms.length} rooms are marked as cleaned today.`, confidence: 0.99, sources: [source('Facilities cleaning register', `${state.rooms.length} rooms checked · local read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
    },
  });

  registerTool({
    id: 'facilities.equipmentLocation', label: 'Equipment location', requiredCapability: 'operations.read',
    execute({ equipment = '' } = {}) {
      const state = getFacilitiesSnapshot();
      const term = String(equipment).trim().toLowerCase();
      const match = state.equipment.find((e) => e.name.toLowerCase().includes(term));
      if (!match) return { data: null, summary: `I could not find equipment matching “${equipment}”.`, confidence: 0.86, sources: [source('Facilities equipment registry', `${state.equipment.length} assets checked · local read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
      const room = state.rooms.find((r) => r.id === match.roomId);
      return { data: match, summary: `${match.name} is currently recorded in ${room?.name || 'an unknown location'}. Last seen ${match.lastSeenAt ? new Date(match.lastSeenAt).toLocaleString('en-GB') : 'not recorded'}${match.lastSeenBy ? ` by ${match.lastSeenBy}` : ''}.`, confidence: 0.99, sources: [source('Facilities equipment registry', `Asset record · local read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
    },
  });

  registerTool({
    id: 'facilities.maintenanceOpen', label: 'Open maintenance', requiredCapability: 'operations.read',
    execute() {
      const state = getFacilitiesSnapshot();
      const open = state.maintenance.filter((m) => m.status !== 'closed');
      return { data: open, summary: open.length ? `${open.length} open maintenance issue${open.length === 1 ? '' : 's'}: ${open.slice(0, 10).map((m) => m.title || m.issue || 'Maintenance issue').join('; ')}.` : 'There are no open maintenance issues.', confidence: 0.99, sources: [source('Facilities maintenance register', `Local read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
    },
  });

  registerTool({
    id: 'coldChain.unitStatus', label: 'Cold-chain unit status', requiredCapability: 'temperature.read',
    async execute({ unit = '' } = {}) {
      const requested = String(unit || '').trim();
      const term = requested.toLowerCase().replace(/number\s+/g, '');
      const normalise = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

      // Android WebView/Firestore cache failures must never be allowed to take down Orb.
      // Read each source independently and continue with whatever evidence is available.
      const [unitResult, logResult] = await Promise.allSettled([
        getDocs(collection(db, 'temperature_units')),
        getDocs(collection(db, 'temperature_logs')),
      ]);

      const units = unitResult.status === 'fulfilled'
        ? unitResult.value.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        : [];
      const logs = logResult.status === 'fulfilled'
        ? logResult.value.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        : [];

      const wanted = normalise(term);
      const target = units.find((candidate) => {
        const haystack = normalise([candidate.name, candidate.unitName, candidate.label, candidate.id].filter(Boolean).join(' '));
        return Boolean(haystack && wanted && (haystack.includes(wanted) || wanted.includes(haystack)));
      });

      const matchingLogs = logs
        .filter((record) => {
          const recordUnit = normalise([record.unitName, record.unit_name, record.unitId, record.unit_id, record.fridge, record.device].filter(Boolean).join(' '));
          const targetTerms = [term, target?.name, target?.unitName, target?.id].filter(Boolean).map(normalise);
          return Boolean(recordUnit && targetTerms.some((value) => value && (recordUnit.includes(value) || value.includes(recordUnit))));
        })
        .sort((a, b) => {
          const toMillis = (value) => {
            try {
              if (value?.toMillis) return value.toMillis();
              if (value?.toDate) return value.toDate().getTime();
              const parsed = new Date(value || 0).getTime();
              return Number.isFinite(parsed) ? parsed : 0;
            } catch { return 0; }
          };
          return toMillis(b.measured_at || b.created_at) - toMillis(a.measured_at || a.created_at);
        });

      const record = matchingLogs[0] || null;
      const sourceErrors = [];
      if (unitResult.status === 'rejected') sourceErrors.push('Temperature unit registry unavailable');
      if (logResult.status === 'rejected') sourceErrors.push('Temperature log unavailable');

      if (!target && !record) {
        const unavailable = sourceErrors.length === 2;
        return {
          data: null,
          summary: unavailable
            ? `I cannot retrieve ${requested || 'that cold-chain unit'} at the moment because the temperature data service is unavailable. Primovex has kept the app running safely.`
            : `I could not find a cold-chain unit matching “${requested}”.`,
          confidence: unavailable ? 0.35 : 0.82,
          warnings: sourceErrors,
          sources: [source('Temperature data', `${units.length} units and ${logs.length} readings safely checked · ${nowLabel()}`)],
          actions: [{ label: 'Open Temperatures', route: '/temperature' }],
        };
      }

      const value = Number(record?.temperature ?? record?.value ?? record?.currentValue ?? record?.current_value ?? target?.currentValue);
      const min = Number(record?.unitRange?.min ?? record?.min_temp ?? record?.min ?? target?.min ?? target?.minTempC ?? 2);
      const max = Number(record?.unitRange?.max ?? record?.max_temp ?? record?.max ?? target?.max ?? target?.maxTempC ?? 8);
      const within = Number.isFinite(value) && value >= min && value <= max;
      const name = String(target?.name || target?.unitName || record?.unitName || record?.unit_name || requested || 'Cold-chain unit');

      let measuredAt = null;
      try {
        measuredAt = record?.measured_at?.toDate?.() || record?.created_at?.toDate?.() || (record?.measured_at ? new Date(record.measured_at) : null);
      } catch { measuredAt = null; }
      const ageMinutes = measuredAt instanceof Date && !Number.isNaN(measuredAt.getTime())
        ? Math.max(0, Math.round((Date.now() - measuredAt.getTime()) / 60000))
        : null;
      const freshness = ageMinutes == null ? 'reading time unavailable' : ageMinutes < 2 ? 'just now' : `${ageMinutes} minutes ago`;

      return {
        // Keep data deliberately serialisable. Raw Firestore snapshots/timestamps are not
        // passed into the conversation layer because some Android WebViews fail on them.
        data: {
          unitId: String(target?.id || record?.unitId || record?.unit_id || ''),
          name,
          value: Number.isFinite(value) ? value : null,
          min: Number.isFinite(min) ? min : 2,
          max: Number.isFinite(max) ? max : 8,
          measuredAt: measuredAt instanceof Date && !Number.isNaN(measuredAt.getTime()) ? measuredAt.toISOString() : null,
        },
        summary: Number.isFinite(value)
          ? `${name} is ${within ? 'operating within range' : 'outside its configured range'}. The latest reading is ${value}°C against a ${min}–${max}°C range, recorded ${freshness}.${ageMinutes != null && ageMinutes > 30 ? ' The reading is stale, so a current physical check is recommended.' : ''}`
          : `${name} is registered, but I do not have a valid recent temperature reading. I cannot confirm that it is currently operating normally.`,
        confidence: Number.isFinite(value) ? (ageMinutes != null && ageMinutes > 30 ? 0.76 : 0.97) : 0.58,
        warnings: [...sourceErrors, ...(!Number.isFinite(value) ? ['No valid temperature reading'] : within ? [] : ['Latest reading is outside range'])],
        sources: [
          source(name, `Temperature unit registry · ${nowLabel()}`),
          source('Temperature log', record ? `Latest matching reading · ${freshness}` : 'No matching reading found'),
        ],
        actions: [{ label: 'Open Temperatures', route: '/temperature' }],
      };
    },
  });

  registerTool({
    id: 'coldChain.latestStatus', label: 'Cold-chain status', requiredCapability: 'temperature.read',
    async execute() {
      const snap = await getDocs(query(collection(db, 'temperature_logs'), orderBy('measured_at', 'desc'), limit(1)));
      if (snap.empty) return { data: null, summary: 'No cold-chain reading is available.', confidence: 0.72, warnings: ['No temperature reading found'], sources: [source('Temperature log', `Live read ${nowLabel()}`)], actions: [{ label: 'Open Temperatures', route: '/temperature' }] };
      const record = { id: snap.docs[0].id, ...snap.docs[0].data() };
      const value = Number(record.temperature ?? record.value ?? record.currentValue ?? record.current_value);
      const min = Number(record.unitRange?.min ?? record.min_temp ?? record.min ?? 2);
      const max = Number(record.unitRange?.max ?? record.max_temp ?? record.max ?? 8);
      const within = Number.isFinite(value) && value >= min && value <= max;
      return { data: record, summary: within ? `Latest cold-chain reading is ${value}°C and within the configured ${min}–${max}°C range.` : `Latest cold-chain reading is ${Number.isFinite(value) ? `${value}°C` : 'unavailable'} and requires review against the configured ${min}–${max}°C range.`, confidence: Number.isFinite(value) ? 0.98 : 0.72, warnings: within ? [] : ['Latest reading requires review'], sources: [source('Temperature log', `Latest recorded reading · live read ${nowLabel()}`)], actions: [{ label: 'Open Temperatures', route: '/temperature' }] };
    },
  });
}
