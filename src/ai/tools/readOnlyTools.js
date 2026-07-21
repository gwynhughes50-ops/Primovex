import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getFacilitiesSnapshot } from '@/modules/facilities/services/facilitiesStore';
import { buildOperationsTimeline, changesSince } from '@/operations/engine/operationsTimeline';
import { getOperationsSummary } from '@/operations/tools/operationsSummaryTool';
import { registerTool } from './toolRegistry';
import { getLatestCheck, listAnaphylaxisBoxes, listEmergencyAssets } from '@/lib/checklistsFirestore';
import { loadSpaceRegistry } from '@/modules/sense/services/sharedSpaceRegistry';
import { getOperationalEscalations } from '@/operations/escalations/operationalEscalationService';
import { createReconciliationProposal } from '@/orb/GovernedActionStore';

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
      const target = action[0] || rows[0] || null;
      const proposal = mode === 'reconcile' && target ? createReconciliationProposal({ collectionName, entity: target, kind: id.startsWith('anaphylaxis') ? 'anaphylaxis' : 'emergency-drugs' }) : null;
      const checkedAt = target?.checkedAt ? new Date(target.checkedAt) : null;
      const checkedThisMonth = checkedAt && !Number.isNaN(checkedAt.getTime()) && checkedAt.getMonth() === new Date().getMonth() && checkedAt.getFullYear() === new Date().getFullYear();
      const clinicianSummary = proposal
        ? target.score == null || !checkedThisMonth
          ? `${target.name} needs its readiness check. I haven't found a verified check for this month. Would you like to start the reconciliation now?`
          : target.status === 'critical' || target.missing || target.expired
            ? `${target.name} needs attention before it can be considered ready. Its latest check recorded ${target.score}% readiness${target.missing ? ` with ${target.missing} missing item${target.missing === 1 ? '' : 's'}` : ''}${target.expired ? ` and ${target.expired} expired item${target.expired === 1 ? '' : 's'}` : ''}. Would you like to start the reconciliation now?`
            : `${target.name} has a verified check for this month. You can review it or start a fresh reconciliation.`
        : mode === 'reconcile'
          ? `I couldn't find a configured ${label.toLowerCase().replace(/s$/, '')} to check. A manager may need to review the asset register.`
          : summary;
      const tab = collectionName === 'anaphylaxis_boxes' ? 'anaphylaxis' : 'emergency';
      const actions = proposal
        ? [
            { label: 'Start Check', route: proposal.route },
            { label: 'Show Last Check', route: `/inventory?tab=${tab}&asset=${encodeURIComponent(target.id)}` },
          ]
        : [{ label: `Open ${label}`, route }];
      return { data: proposal ? { rows, proposal } : rows, summary: clinicianSummary, confidence: rows.length ? 0.96 : 0.7, sources: [source(label, `${rows.length} configured asset${rows.length === 1 ? '' : 's'} and latest checks read ${nowLabel()}`)], actions, warnings: [...(checks.some((result) => result.status === 'rejected') ? ['Some latest checks could not be read'] : []), ...(proposal ? ['Starting a check does not change readiness or stock. The completed checklist must still be reviewed and saved.'] : [])] };
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

  registerTool({
    id: 'spaces.summary', label: 'Spaces summary', requiredCapability: 'operations.read',
    execute() {
      const registry = loadSpaceRegistry();
      const spaces = (registry?.spaces || []).filter((space) => !space.archivedAt);
      const attention = spaces.filter((space) => !['ready', 'active', 'open'].includes(String(space.status || 'ready').toLowerCase()));
      return {
        domain: 'spaces',
        data: { spaces: spaces.map(({ id, spaceId, name, typeId, siteId, floorId, zoneId, status }) => ({ id, spaceId, name, typeId, siteId, floorId, zoneId, status })), counts: { active: spaces.length, attention: attention.length } },
        summary: spaces.length ? `${spaces.length} active practice space${spaces.length === 1 ? '' : 's'} are registered. ${attention.length ? `${attention.length} ${attention.length === 1 ? 'has' : 'have'} a status requiring review: ${attention.slice(0, 6).map((space) => space.name).join(', ')}.` : 'No registered Space has a status requiring review.'}` : 'No active practice Spaces are registered, so I cannot confirm room readiness.',
        confidence: spaces.length ? 0.97 : 0.45,
        knownState: spaces.length ? 'known' : 'unknown',
        observedAt: registry?.updatedAt,
        freshness: { state: document.documentElement.dataset.spaceSync === 'synced' ? 'synced' : 'cached', observedAt: registry?.updatedAt || null },
        sources: [source('Unified Space Registry', `${spaces.length} active Spaces; registry revision ${registry?.registryRevision || 'unknown'}`)],
        warnings: spaces.length ? [] : ['Space Registry contains no active Spaces'],
        actions: [{ label: 'Open Spaces', route: '/spaces' }],
      };
    },
  });

  registerTool({
    id: 'compliance.summary', label: 'Compliance summary', requiredCapability: 'compliance.read',
    async execute() {
      const collections = ['compliance_assets', 'compliance_checks', 'fire_weekly_checks', 'water_temp_rounds', 'pat_test_sessions'];
      const settled = await Promise.allSettled(collections.map((name) => getDocs(collection(db, name))));
      const rows = Object.fromEntries(collections.map((name, index) => [name, settled[index].status === 'fulfilled' ? settled[index].value.docs.map((item) => ({ id: item.id, ...item.data() })) : []]));
      const failures = collections.filter((_, index) => settled[index].status === 'rejected');
      const assets = rows.compliance_assets.filter((item) => item.active !== false && !item.archivedAt);
      const checks = rows.compliance_checks;
      const failed = checks.filter((item) => ['failed', 'fail', 'action-required', 'non-compliant'].includes(String(item.result || item.status || '').toLowerCase()));
      const evidenceCount = checks.length + rows.fire_weekly_checks.length + rows.water_temp_rounds.length + rows.pat_test_sessions.length;
      const known = failures.length < collections.length && (assets.length || evidenceCount);
      return {
        domain: 'compliance',
        data: { counts: { assets: assets.length, checks: evidenceCount, failedChecks: failed.length }, failedChecks: failed.slice(0, 10).map(({ id, assetId, result, status, createdAt }) => ({ id, assetId, result, status, createdAt })) },
        summary: known ? `${assets.length} active compliance asset${assets.length === 1 ? '' : 's'} and ${evidenceCount} recorded check${evidenceCount === 1 ? '' : 's'} were found. ${failed.length ? `${failed.length} recorded check${failed.length === 1 ? '' : 's'} require review.` : 'No failed result is present in the connected check records.'}${failures.length ? ' Some compliance sources were unavailable, so this is not a complete assurance statement.' : ''}` : 'Compliance evidence is unavailable or empty, so I cannot confirm that the practice is compliant.',
        confidence: !known ? 0.35 : failures.length ? 0.68 : 0.94,
        knownState: !known ? 'unknown' : failures.length ? 'partial' : 'known',
        sources: collections.map((name) => source(name, failures.includes(name) ? 'Read unavailable' : `${rows[name].length} record${rows[name].length === 1 ? '' : 's'} checked`)),
        warnings: [...failures.map((name) => `${name} unavailable`), ...(!known ? ['Insufficient compliance evidence'] : [])],
        actions: [{ label: 'Open Compliance', route: '/compliance' }],
      };
    },
  });

  registerTool({
    id: 'tasks.summary', label: 'Operational tasks', requiredCapability: 'operations.read',
    execute() {
      const tasks = getOperationalEscalations().filter((item) => item.status !== 'resolved');
      const critical = tasks.filter((item) => ['critical', 'high'].includes(String(item.priority).toLowerCase()));
      return {
        domain: 'tasks', disclosureLevel: 'operational', data: { counts: { open: tasks.length, highPriority: critical.length }, tasks: tasks.slice(0, 15) },
        summary: tasks.length ? `${tasks.length} open operational task${tasks.length === 1 ? '' : 's'} are recorded${critical.length ? `, including ${critical.length} high-priority item${critical.length === 1 ? '' : 's'}` : ''}. ${tasks.slice(0, 5).map((item) => item.title).join('; ')}.` : 'No open operational tasks are recorded in the connected escalation register.',
        confidence: 0.94, freshness: { state: 'local-live', observedAt: new Date().toISOString() },
        sources: [source('Operational escalation register', `${tasks.length} open task${tasks.length === 1 ? '' : 's'} checked`)],
        actions: [{ label: 'Open Operations Centre', route: '/alerts' }],
      };
    },
  });

  registerTool({
    id: 'alerts.summary', label: 'Active alerts', requiredCapability: 'operations.read',
    async execute() {
      const [stockResult, temperatureResult, deviceAlertResult] = await Promise.allSettled([
        readStock(), getDocs(query(collection(db, 'temperature_logs'), orderBy('measured_at', 'desc'), limit(50))), getDocs(collection(db, 'connect_device_alerts')),
      ]);
      const stock = stockResult.status === 'fulfilled' ? stockResult.value : [];
      const low = stock.filter((item) => Number(item.current_stock || 0) <= Number(item.min_stock || 0));
      const deviceAlerts = deviceAlertResult.status === 'fulfilled' ? deviceAlertResult.value.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => !['resolved', 'closed'].includes(String(item.status).toLowerCase())) : [];
      const unavailable = [stockResult, temperatureResult, deviceAlertResult].filter((item) => item.status === 'rejected').length;
      const total = low.length + deviceAlerts.length;
      return {
        domain: 'alerts', data: { counts: { active: total, lowStock: low.length, device: deviceAlerts.length }, lowStock: low.slice(0, 10).map(({ id, name, current_stock, min_stock }) => ({ id, name, current_stock, min_stock })), deviceAlerts: deviceAlerts.slice(0, 10) },
        summary: total ? `${total} active operational exception${total === 1 ? '' : 's'} are visible: ${low.length} low-stock and ${deviceAlerts.length} connected-device alert${deviceAlerts.length === 1 ? '' : 's'}.${unavailable ? ' Some alert sources were unavailable.' : ''}` : unavailable ? 'No active exception was found in the available sources, but some alert sources could not be read, so I cannot confirm an all-clear.' : 'No active low-stock or connected-device alerts are currently visible.',
        confidence: unavailable ? 0.64 : 0.95, knownState: unavailable ? 'partial' : 'known',
        sources: [source('Inventory alerts', `${low.length} low-stock exception${low.length === 1 ? '' : 's'}`), source('Connected-device alerts', `${deviceAlerts.length} active alert${deviceAlerts.length === 1 ? '' : 's'}`), source('Temperature evidence', temperatureResult.status === 'fulfilled' ? `${temperatureResult.value.size} recent reading${temperatureResult.value.size === 1 ? '' : 's'} available` : 'Unavailable')],
        warnings: unavailable ? [`${unavailable} alert source${unavailable === 1 ? '' : 's'} unavailable`] : [], actions: [{ label: 'Open Operations Centre', route: '/alerts' }],
      };
    },
  });
}
