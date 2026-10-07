import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getFacilitiesSnapshot } from '@/modules/facilities/services/facilitiesStore';
import { listEquipment } from '@/modules/equipment/services/equipmentRegistry';
import { buildOperationsTimeline, changesSince } from '@/operations/engine/operationsTimeline';
import { getOperationsSummary } from '@/operations/tools/operationsSummaryTool';
import { registerTool } from './toolRegistry';
import { getLatestCheck, listAnaphylaxisBoxes, listEmergencyAssets } from '@/lib/checklistsFirestore';
import { loadSpaceRegistry } from '@/modules/sense/services/sharedSpaceRegistry';
import { getOperationalEscalations } from '@/operations/escalations/operationalEscalationService';
import { createReconciliationProposal } from '@/orb/GovernedActionStore';
import { CONCERNS_COLLECTION, friendly, getDeadlineTone } from '@/modules/governance/services/concernService';
import { SAR_COLLECTION, getSarDeadlineTone, getStatusLabel } from '@/modules/governance/services/sarService';
import { normalizeStockItemCategory } from '@/services/stockService';
import { STOCK_CATEGORIES, categoryLabel as taxonomyCategoryLabel, subcategoryLabel as taxonomySubcategoryLabel } from '@/data/stockCategories';
import { orbKnowledgeStore } from '@/orb/OrbKnowledgeStore';
import { CAPABILITY_CATALOG, ROLE_TEMPLATES, hasCapability } from '@/core/identity/capabilities';
import { describeSource, findHelp, formatHelpAnswer, relatedQuestions, sampleQuestions } from '@/ai/help/helpSearch';
import { buildLocateResult, buildReorderDraft, buildTeamDraft } from '@/ai/stock/stockTools';
import { daysUntilExpiry, expiryStatus, expiryWindowDays, normaliseExpirySettings, stockLevelStatus, summariseStockAlerts } from '@/lib/stockAlerts';
import {
  alertsAnswer, categoryAnswer, cleaningAnswer, coldChainOverview, coldChainUnitAnswer, complianceAnswer, expiryAnswer, lowStockAnswer,
  maintenanceAnswer, operationsAnswer, quickNotesAnswer, spacesAnswer, stockOverview, stockSearchAnswer, tasksAnswer, timelineAnswer, usersAnswer,
} from './answerWording';

const nowLabel = () => new Date().toLocaleString('en-GB');
const source = (title, detail, type = 'module') => ({ title, detail, type });
const activeItems = (docs) => docs.map((d) => ({ id: d.id, ...d.data() })).filter((item) => !item.archived_at);
const itemLabel = (item) => [item.name, item.strength, item.form].filter(Boolean).join(' ');

// The practice's own expiry windows (Settings > Alerts), the same ones the Alerts page and
// the stock cards use, so the Orb and the app never disagree about what is "close to expiry".
async function readExpirySettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'alerts'));
    return normaliseExpirySettings(snap.exists() ? snap.data() : null);
  } catch {
    return normaliseExpirySettings(null);
  }
}

// Stock sorted into out / low / expired / close to expiry by those shared rules.
function stockPicture(items, settings, now = new Date()) {
  const rows = items.map((item) => {
    const categoryId = normalizeStockItemCategory(item).category;
    return { item, categoryId, level: stockLevelStatus(item), expiry: expiryStatus(item, { categoryId, settings, now }), days: daysUntilExpiry(item, now) };
  });
  const shape = (row) => ({ label: itemLabel(row.item), current: Number(row.item.current_stock || 0), min: Number(row.item.min_stock || 0), days: row.days, expiry: row.item.expiry_date || null, status: row.level });
  const byDays = (a, b) => (a.days ?? 0) - (b.days ?? 0);
  return {
    rows,
    out: rows.filter((r) => r.level === 'out').map(shape),
    low: rows.filter((r) => r.level === 'low').map(shape).sort((a, b) => (a.current - a.min) - (b.current - b.min)),
    expired: rows.filter((r) => r.expiry === 'expired').map(shape).sort(byDays),
    soon: rows.filter((r) => r.expiry === 'soon').map(shape).sort(byDays),
    shape,
  };
}

async function readStock() {
  const snap = await getDocs(collection(db, 'stock_items'));
  return activeItems(snap.docs);
}

// Cleaning/stocking status lives in room_operational/cleaning_logs now (see
// cleaningRecordService.js), not on the facilities/space-registry snapshot —
// Orb needs a live one-shot read of both to answer cleaning questions
// correctly, and to build the rooms context the Operations engine expects.
async function readRoomOperational() {
  const snap = await getDocs(collection(db, 'room_operational'));
  const map = {};
  snap.docs.forEach((row) => { map[row.id] = row.data(); });
  return map;
}

async function readCleaningLogs() {
  const snap = await getDocs(collection(db, 'cleaning_logs'));
  return snap.docs.map((row) => ({ id: row.id, ...row.data() }));
}

async function buildRoomsContext() {
  const [operational, logs] = await Promise.all([readRoomOperational(), readCleaningLogs()]);
  return { operational, logs, loading: false };
}

function cleanedAtDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
      const summary = getOperationsSummary({ rooms: await buildRoomsContext() });
      const priorities = summary.priorities?.slice(0, 5) || [];
      return {
        data: summary,
        ...(() => { const answer = operationsAnswer({ readiness: summary.readiness.overall ?? null, priorities: priorities.map((p) => p.title) }); return { summary: answer.text, followUps: answer.followUps }; })(),
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
      const timeline = buildOperationsTimeline({ rooms: await buildRoomsContext() });
      const since = new Date();
      if (sinceYesterday) { since.setDate(since.getDate() - 1); since.setHours(0, 0, 0, 0); }
      const events = sinceYesterday ? changesSince(timeline, since) : timeline;
      return {
        data: events,
        ...(() => { const answer = timelineAnswer({ titles: events.map((e) => e.title) }); return { summary: answer.text, followUps: answer.followUps }; })(),
        confidence: 0.97,
        sources: [source('Primovex Operations Timeline', `${events.length} recorded event${events.length === 1 ? '' : 's'} · read ${nowLabel()}`, 'system')],
        actions: [{ label: 'Open Dashboard', route: '/dashboard' }],
      };
    },
  });


  registerTool({
    id: 'inventory.summary', label: 'Inventory summary', requiredCapability: 'inventory.read',
    async execute() {
      const [items, settings] = await Promise.all([readStock(), readExpirySettings()]);
      const picture = stockPicture(items, settings);
      const totalUnits = items.reduce((sum, item) => sum + Math.max(0, Number(item.current_stock || 0)), 0);
      const answer = stockOverview({ total: items.length, units: totalUnits, out: picture.out, low: picture.low, expired: picture.expired, soon: picture.soon });
      return {
        data: { items, counts: { active: items.length, totalUnits, low: picture.low.length, outOfStock: picture.out.length, expired: picture.expired.length, expiringSoon: picture.soon.length } },
        summary: answer.text,
        followUps: answer.followUps,
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
      const [items, settings] = await Promise.all([readStock(), readExpirySettings()]);
      const matches = items.filter((item) => !term || [item.name, item.strength, item.form, item.brand, item.barcode, item.location, item.site].some((v) => String(v || '').toLowerCase().includes(term))).slice(0, 20);
      const picture = stockPicture(matches, settings);
      const answer = stockSearchAnswer({ term: search, matches: picture.rows.map((row) => picture.shape(row)) });
      return {
        data: matches,
        summary: answer.text,
        followUps: answer.followUps,
        confidence: 0.99,
        sources: [source('Inventory', `${items.length} active items checked · live read ${nowLabel()}`)],
        actions: [{ label: 'Open Inventory', route: '/inventory' }],
      };
    },
  });

  registerTool({
    id: 'inventory.lowStock', label: 'Low stock', requiredCapability: 'inventory.read',
    async execute() {
      const [items, settings] = await Promise.all([readStock(), readExpirySettings()]);
      const picture = stockPicture(items, settings);
      const answer = lowStockAnswer({ out: picture.out, low: picture.low });
      return {
        data: [...picture.out, ...picture.low],
        summary: answer.text,
        followUps: answer.followUps,
        confidence: 0.99,
        sources: [source('Inventory', `${items.length} active items checked against minimum stock · ${nowLabel()}`)],
        actions: [{ label: 'Open Inventory', route: '/inventory' }],
      };
    },
  });

  registerTool({
    id: 'inventory.expiring', label: 'Expiring stock', requiredCapability: 'inventory.read',
    // With no number of days given, this uses the practice's own expiry windows; a
    // number ("expiring in 14 days") overrides them.
    async execute({ days = null } = {}) {
      const [items, settings] = await Promise.all([readStock(), readExpirySettings()]);
      const explicit = Number.isFinite(Number(days)) && Number(days) > 0;
      const picture = stockPicture(items, settings);
      let expired = picture.expired;
      let soon = picture.soon;
      if (explicit) {
        const limit = Number(days);
        soon = picture.rows.filter((r) => r.days !== null && r.days >= 0 && r.days <= limit).map((r) => picture.shape(r)).sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
      }
      const upcoming = picture.rows.filter((r) => r.days !== null && r.days >= 0).map((r) => picture.shape(r)).sort((a, b) => a.days - b.days)[0] || null;
      const answer = expiryAnswer({ expired, soon, windowDays: explicit ? Number(days) : 30, explicitDays: explicit, next: upcoming });
      return {
        data: [...expired, ...soon],
        summary: answer.text,
        followUps: answer.followUps,
        confidence: 0.98,
        sources: [source('Inventory expiry register', `${items.length} active items checked · ${nowLabel()}`)],
        actions: [{ label: 'Open Inventory', route: '/inventory' }],
      };
    },
  });

  // Matches free text like "wound care" or "emergency drugs" against the
  // fixed Category -> Subcategory taxonomy (src/data/stockCategories.js).
  // Subcategory labels are checked first since they're more specific — "PPE"
  // should resolve to Clinical Consumables > PPE, not just Clinical
  // Consumables as a whole.
  function resolveCategoryQuery(term) {
    const q = String(term || '').trim().toLowerCase();
    if (!q) return null;
    for (const cat of STOCK_CATEGORIES) {
      for (const sub of cat.subcategories) {
        if (sub.label.toLowerCase().includes(q) || q.includes(sub.label.toLowerCase())) {
          return { category: cat.id, subcategory: sub.id };
        }
      }
    }
    for (const cat of STOCK_CATEGORIES) {
      if (cat.label.toLowerCase().includes(q) || q.includes(cat.label.toLowerCase())) {
        return { category: cat.id, subcategory: null };
      }
    }
    return null;
  }

  registerTool({
    id: 'inventory.categoryLookup', label: 'Inventory by category', requiredCapability: 'inventory.read',
    async execute({ category = '' } = {}) {
      const match = resolveCategoryQuery(category);
      const [items, settings] = await Promise.all([readStock(), readExpirySettings()]);
      if (!match) {
        const available = STOCK_CATEGORIES.filter((c) => c.id !== 'uncategorised').map((c) => c.label).join(', ');
        return {
          data: { matched: false },
          summary: `"${category}" didn't match a known stock category. Available categories: ${available}.`,
          confidence: 0.6,
          sources: [source('Inventory categories', `${STOCK_CATEGORIES.length} categories checked · ${nowLabel()}`)],
          actions: [{ label: 'Open Inventory', route: '/inventory' }],
        };
      }
      const matches = items.filter((item) => {
        const resolved = normalizeStockItemCategory(item);
        if (resolved.category !== match.category) return false;
        if (match.subcategory && resolved.subcategory !== match.subcategory) return false;
        return true;
      });
      const picture = stockPicture(matches, settings);
      const totalUnits = matches.reduce((sum, item) => sum + Math.max(0, Number(item.current_stock || 0)), 0);
      const label = match.subcategory ? taxonomySubcategoryLabel(match.category, match.subcategory) : taxonomyCategoryLabel(match.category);
      const answer = categoryAnswer({ label, total: matches.length, units: totalUnits, out: picture.out, low: picture.low, expired: picture.expired, soon: picture.soon, names: matches.slice(0, 10).map(itemLabel) });
      return {
        data: { matched: true, category: match.category, subcategory: match.subcategory, items: matches, counts: { total: matches.length, totalUnits, low: picture.low.length, outOfStock: picture.out.length, expired: picture.expired.length, expiring: picture.soon.length } },
        summary: answer.text,
        followUps: answer.followUps,
        confidence: 0.97,
        sources: [source('Inventory', `${items.length} active items checked against the Category/Subcategory taxonomy · ${nowLabel()}`)],
        actions: [{ label: 'Open Inventory', route: '/inventory' }],
      };
    },
  });

  registerTool({
    id: 'facilities.roomStatus', label: 'Room status', requiredCapability: 'operations.read',
    async execute({ room = '' } = {}) {
      const state = getFacilitiesSnapshot();
      const operational = await readRoomOperational();
      const term = String(room).trim().toLowerCase();
      const match = state.rooms.find((r) => r.name.toLowerCase().includes(term) || String(r.slug || '').replaceAll('-', ' ').includes(term));
      if (!match) return { data: null, summary: `I could not find a room matching “${room}”.`, confidence: 0.86, sources: [source('Facilities room registry', `${state.rooms.length} rooms checked · local read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
      const lastCleanedAt = cleanedAtDate(operational[match.id]?.lastCleanedAt);
      const lastCleanedBy = operational[match.id]?.lastCleanedBy;
      const cleanedToday = lastCleanedAt && lastCleanedAt.toDateString() === new Date().toDateString();
      const enriched = { ...match, lastCleanedAt: lastCleanedAt?.toISOString() || null, lastCleanedBy: lastCleanedBy || null };
      return { data: enriched, summary: cleanedToday ? `${match.name} was cleaned today at ${lastCleanedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} by ${lastCleanedBy}.` : `${match.name} has not been marked as cleaned today. Last recorded clean: ${lastCleanedAt ? lastCleanedAt.toLocaleString('en-GB') : 'none'}.`, confidence: 0.99, sources: [source(match.name, `Facilities room record · live read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
    },
  });

  registerTool({
    id: 'facilities.cleaningStatus', label: 'Cleaning status', requiredCapability: 'operations.read',
    async execute() {
      const state = getFacilitiesSnapshot();
      const operational = await readRoomOperational();
      const today = new Date().toDateString();
      const overdue = state.rooms.filter((r) => {
        const lastCleanedAt = cleanedAtDate(operational[r.id]?.lastCleanedAt);
        return !lastCleanedAt || lastCleanedAt.toDateString() !== today;
      });
      const cleaning = cleaningAnswer({ overdue: overdue.map((r) => r.name), total: state.rooms.length });
      return { data: overdue, summary: cleaning.text, followUps: cleaning.followUps, confidence: 0.99, sources: [source('Facilities cleaning register', `${state.rooms.length} rooms checked · live read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
    },
  });

  registerTool({
    id: 'facilities.equipmentLocation', label: 'Equipment location', requiredCapability: 'operations.read',
    async execute({ equipment = '' } = {}) {
      const term = String(equipment).trim().toLowerCase();
      const all = listEquipment();
      const byName = all.filter((item) => item.name?.toLowerCase().includes(term));
      const matches = byName.length ? byName : all.filter((item) => item.category?.toLowerCase().includes(term) || item.equipmentType?.toLowerCase().includes(term));

      if (!matches.length) {
        return { data: null, summary: `I could not find equipment matching “${equipment}”.`, confidence: 0.86, sources: [source('Equipment registry', `${all.length} assets checked · local read ${nowLabel()}`)], actions: [{ label: 'Open Equipment', route: '/spaces' }] };
      }
      if (matches.length > 1) {
        const names = matches.slice(0, 6).map((item) => item.name).join(', ');
        return { data: matches, summary: `${matches.length} items match “${equipment}”: ${names}. Ask about one by name to narrow it down.`, confidence: 0.85, sources: [source('Equipment registry', `${matches.length} matches · local read ${nowLabel()}`)], actions: [{ label: 'Open Equipment', route: '/spaces' }] };
      }

      const match = matches[0];
      let sighting = null;
      try {
        const snap = await getDoc(doc(db, 'equipment_sightings', match.id));
        sighting = snap.exists() ? snap.data() : null;
      } catch { sighting = null; }

      let seenLabel = 'not been detected by a BLE tag scan yet';
      let seenAt = null;
      try { seenAt = sighting?.lastSeenAt?.toDate?.() || null; } catch { seenAt = null; }
      if (seenAt) {
        const ageMinutes = Math.max(0, Math.round((Date.now() - seenAt.getTime()) / 60000));
        const ageLabel = ageMinutes < 1 ? 'just now' : ageMinutes < 60 ? `${ageMinutes} min ago` : ageMinutes < 1440 ? `${Math.round(ageMinutes / 60)}h ago` : `${Math.round(ageMinutes / 1440)}d ago`;
        seenLabel = `last seen ${ageLabel}${sighting?.lastSeenSpaceName ? ` near ${sighting.lastSeenSpaceName}` : ''}${sighting?.lastSeenBy ? ` (by ${sighting.lastSeenBy})` : ''}`;
      }

      const homeSpace = match.homeSpaceId ? `home location ${match.homeSpaceId}` : null;
      return {
        data: { equipment: match, sighting },
        summary: `${match.name} (${match.category || 'equipment'}) — ${seenLabel}.${homeSpace && !seenAt ? ` Registered ${homeSpace}.` : ''}`,
        confidence: seenAt ? 0.97 : 0.75,
        sources: [source('Equipment registry', `Asset record · local read ${nowLabel()}`), source('BLE sighting log', sighting ? `Last updated ${nowLabel()}` : 'No sighting recorded')],
        actions: [{ label: 'Open Equipment', route: '/spaces' }],
      };
    },
  });

  registerTool({
    id: 'facilities.maintenanceOpen', label: 'Open maintenance', requiredCapability: 'operations.read',
    execute() {
      const state = getFacilitiesSnapshot();
      const open = state.maintenance.filter((m) => m.status !== 'closed');
      const maintenance = maintenanceAnswer(open.map((m) => m.title || m.issue || 'Maintenance issue'));
      return { data: open, summary: maintenance.text, followUps: maintenance.followUps, confidence: 0.99, sources: [source('Facilities maintenance register', `Local read ${nowLabel()}`)], actions: [{ label: 'Open Facilities', route: '/facilities' }] };
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
        summary: coldChainUnitAnswer({ name, value, min, max, ageMinutes }).text,
        followUps: coldChainUnitAnswer({ name, value, min, max, ageMinutes }).followUps,
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
    // The latest reading of every fridge and freezer. (This used to report the single
    // newest reading from anywhere, so "are the fridges OK" could be answered from
    // one unit.)
    async execute() {
      const snap = await getDocs(query(collection(db, 'temperature_logs'), orderBy('measured_at', 'desc'), limit(200)));
      const toMillis = (value) => { try { return value?.toMillis ? value.toMillis() : value?.toDate ? value.toDate().getTime() : value ? new Date(value).getTime() : 0; } catch { return 0; } };
      const latest = new Map();
      snap.docs.forEach((row) => {
        const record = { id: row.id, ...row.data() };
        const key = String(record.unitId || record.unit_id || record.unitName || record.unit_name || record.fridge || record.device || row.id);
        if (!latest.has(key)) latest.set(key, record);
      });
      if (!latest.size) return { data: null, summary: coldChainOverview({ units: [] }).text, confidence: 0.72, warnings: ['No temperature reading found'], sources: [source('Temperature log', `Live read ${nowLabel()}`)], actions: [{ label: 'Open Temperatures', route: '/temperature' }] };
      const units = [...latest.values()].map((record) => {
        const at = toMillis(record.measured_at || record.created_at);
        return {
          name: String(record.unitName || record.unit_name || record.fridge || record.device || 'A fridge'),
          value: Number(record.temperature ?? record.value ?? record.currentValue ?? record.current_value),
          min: Number(record.unitRange?.min ?? record.min_temp ?? record.min ?? 2),
          max: Number(record.unitRange?.max ?? record.max_temp ?? record.max ?? 8),
          ageMinutes: at ? Math.max(0, Math.round((Date.now() - at) / 60000)) : null,
        };
      });
      const answer = coldChainOverview({ units });
      const outOfRange = units.filter((u) => Number.isFinite(u.value) && (u.value < u.min || u.value > u.max));
      return {
        data: units,
        summary: answer.text,
        followUps: answer.followUps,
        confidence: units.some((u) => Number.isFinite(u.value)) ? 0.97 : 0.72,
        warnings: outOfRange.length ? ['A unit is outside its range'] : [],
        sources: [source('Temperature log', `Latest reading from each of ${units.length} unit${units.length === 1 ? '' : 's'} · live read ${nowLabel()}`)],
        actions: [{ label: 'Open Temperatures', route: '/temperature' }],
      };
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
        summary: spacesAnswer({ total: spaces.length, attention: attention.map((space) => space.name) }).text,
        followUps: spacesAnswer({ total: spaces.length, attention: attention.map((space) => space.name) }).followUps,
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
        summary: complianceAnswer({ assets: assets.length, checks: evidenceCount, failed: failed.length, incomplete: failures.length > 0, known: Boolean(known) }).text,
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
        summary: tasksAnswer({ titles: tasks.map((item) => item.title), total: tasks.length, high: critical.length }).text,
        followUps: tasksAnswer({ titles: tasks.map((item) => item.title), total: tasks.length, high: critical.length }).followUps,
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
      const settings = await readExpirySettings();
      const stockAlerts = summariseStockAlerts(stock, { categoryOf: (item) => normalizeStockItemCategory(item).category, settings });
      const low = stock.filter((item) => stockLevelStatus(item));
      const deviceAlerts = deviceAlertResult.status === 'fulfilled' ? deviceAlertResult.value.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => !['resolved', 'closed'].includes(String(item.status).toLowerCase())) : [];
      const unavailable = [stockResult, temperatureResult, deviceAlertResult].filter((item) => item.status === 'rejected').length;
      const total = stockAlerts.total + deviceAlerts.length;
      return {
        domain: 'alerts', data: { counts: { active: total, lowStock: low.length, device: deviceAlerts.length }, lowStock: low.slice(0, 10).map(({ id, name, current_stock, min_stock }) => ({ id, name, current_stock, min_stock })), deviceAlerts: deviceAlerts.slice(0, 10) },
        summary: alertsAnswer({ stock: stockAlerts.counts, device: deviceAlerts.length, unavailable }).text,
        followUps: alertsAnswer({ stock: stockAlerts.counts, device: deviceAlerts.length, unavailable }).followUps,
        confidence: unavailable ? 0.64 : 0.95, knownState: unavailable ? 'partial' : 'known',
        sources: [source('Inventory alerts', `${low.length} low-stock exception${low.length === 1 ? '' : 's'}`), source('Connected-device alerts', `${deviceAlerts.length} active alert${deviceAlerts.length === 1 ? '' : 's'}`), source('Temperature evidence', temperatureResult.status === 'fulfilled' ? `${temperatureResult.value.size} recent reading${temperatureResult.value.size === 1 ? '' : 's'} available` : 'Unavailable')],
        warnings: unavailable ? [`${unavailable} alert source${unavailable === 1 ? '' : 's'} unavailable`] : [], actions: [{ label: 'Open Operations Centre', route: '/alerts' }],
      };
    },
  });

  registerTool({
    id: 'tasks.quickNotes', label: 'Quick notes', requiredCapability: 'operations.read',
    async execute(_input = {}, context = {}) {
      if (!context.userId) return { data: null, summary: 'I need to know who is asking before I can read your quick notes.', confidence: 0.4, sources: [source('Quick Notes', 'No signed-in user in context')], actions: [] };
      const [ownSnap, practiceSnap] = await Promise.all([
        getDocs(query(collection(db, 'quick_notes'), where('authorUid', '==', context.userId))),
        getDocs(query(collection(db, 'quick_notes'), where('scope', '==', 'practice'))),
      ]);
      const merged = new Map();
      ownSnap.docs.forEach((row) => merged.set(row.id, { id: row.id, ...row.data() }));
      practiceSnap.docs.forEach((row) => merged.set(row.id, { id: row.id, ...row.data() }));
      const open = Array.from(merged.values()).filter((note) => note.status !== 'completed');
      const overdue = open.filter((note) => note.dueAt && new Date(note.dueAt) < new Date());
      open.sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0));
      return {
        domain: 'tasks', data: { counts: { open: open.length, overdue: overdue.length }, notes: open.slice(0, 15) },
        summary: quickNotesAnswer({ notes: open.map((note) => note.text), overdue: overdue.length }).text,
        confidence: 0.95,
        sources: [source('Quick Notes', `${open.length} open note${open.length === 1 ? '' : 's'} checked · live read ${nowLabel()}`)],
        actions: [{ label: 'Open Dashboard', route: '/dashboard' }],
      };
    },
  });

  registerTool({
    id: 'admin.users', label: 'Team members', requiredCapability: 'admin.access',
    async execute({ name = '' } = {}) {
      const snap = await getDocs(collection(db, 'users'));
      const users = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
      const term = String(name).trim().toLowerCase();
      if (term) {
        const match = users.find((u) => String(u.displayName || '').toLowerCase().includes(term) || String(u.email || '').toLowerCase().includes(term));
        if (!match) return { data: null, summary: `I could not find a user matching “${name}”.`, confidence: 0.8, sources: [source('Users', `${users.length} account${users.length === 1 ? '' : 's'} checked · live read ${nowLabel()}`)], actions: [{ label: 'Open Advanced Admin', route: '/admin/users' }] };
        return { data: match, summary: `${match.displayName || match.email} is ${match.role || 'not assigned a role'}.`, confidence: 0.97, sources: [source(match.displayName || match.email || match.id, `User record · live read ${nowLabel()}`)], actions: [{ label: 'Open Advanced Admin', route: '/admin/users' }] };
      }
      const byRole = {};
      users.forEach((u) => { const role = u.role || 'No role'; byRole[role] = (byRole[role] || 0) + 1; });
      return {
        domain: 'admin', data: { counts: { total: users.length }, byRole, users: users.map(({ id, displayName, email, role }) => ({ id, displayName, email, role })) },
        summary: usersAnswer({ total: users.length, byRole }).text,
        confidence: 0.97,
        sources: [source('Users', `${users.length} account${users.length === 1 ? '' : 's'} checked · live read ${nowLabel()}`)],
        actions: [{ label: 'Open Advanced Admin', route: '/admin/users' }],
      };
    },
  });

  registerTool({
    id: 'governance.concernLookup', label: 'Concern lookup', requiredCapability: 'governance.read',
    async execute({ reference = '', emisNumber = '' } = {}) {
      const ref = String(reference).trim().toUpperCase();
      const emis = String(emisNumber).trim();
      if (!ref && !emis) {
        return { data: null, summary: 'Give me a concern reference (e.g. CN-2026-...) or an EMIS number to look up.', confidence: 0.4, sources: [source('Governance concerns', 'No identifier provided')], actions: [{ label: 'Open Concerns', route: '/governance/concerns' }] };
      }
      const [byRef, byEmis] = await Promise.all([
        ref ? getDocs(query(collection(db, CONCERNS_COLLECTION), where('reference', '==', ref))) : Promise.resolve(null),
        emis ? getDocs(query(collection(db, CONCERNS_COLLECTION), where('emisNumber', '==', emis))) : Promise.resolve(null),
      ]);
      const rows = new Map();
      byRef?.docs.forEach((row) => rows.set(row.id, { id: row.id, ...row.data() }));
      byEmis?.docs.forEach((row) => rows.set(row.id, { id: row.id, ...row.data() }));
      const matches = Array.from(rows.values());

      if (!matches.length) {
        return { data: null, summary: `I could not find a concern matching ${ref || `EMIS ${emis}`}.`, confidence: 0.82, sources: [source('Governance concerns', `Searched by ${ref ? 'reference' : 'EMIS number'} · live read ${nowLabel()}`)], actions: [{ label: 'Open Concerns', route: '/governance/concerns' }] };
      }

      const describe = (concern) => {
        const deadline = getDeadlineTone(concern);
        return `${concern.reference}: ${friendly(concern.status)} case, ${friendly(concern.priority)} priority${concern.category ? `, category ${friendly(concern.category)}` : ''}. ${deadline.label}. Owned by ${concern.ownerName || 'Unassigned'}.`;
      };

      return {
        domain: 'governance', data: matches,
        summary: matches.length === 1 ? describe(matches[0]) : `${matches.length} concerns matched: ${matches.map(describe).join(' ')}`,
        confidence: 0.97,
        sources: [source('Governance concerns', `${matches.length} match${matches.length === 1 ? '' : 'es'} · live read ${nowLabel()}`)],
        actions: [{ label: 'Open Concerns', route: '/governance/concerns' }],
      };
    },
  });

  registerTool({
    id: 'governance.sarLookup', label: 'SAR lookup', requiredCapability: 'governance.read',
    async execute({ reference = '', emisNumber = '' } = {}) {
      const ref = String(reference).trim().toUpperCase();
      const emis = String(emisNumber).trim();
      if (!ref && !emis) {
        return { data: null, summary: 'Give me a SAR reference (e.g. SAR-2026-...) or an EMIS number to look up.', confidence: 0.4, sources: [source('Governance SARs', 'No identifier provided')], actions: [{ label: 'Open SARs', route: '/governance/sars' }] };
      }
      const [byRef, byEmis] = await Promise.all([
        ref ? getDocs(query(collection(db, SAR_COLLECTION), where('reference', '==', ref))) : Promise.resolve(null),
        emis ? getDocs(query(collection(db, SAR_COLLECTION), where('emisNumber', '==', emis))) : Promise.resolve(null),
      ]);
      const rows = new Map();
      byRef?.docs.forEach((row) => rows.set(row.id, { id: row.id, ...row.data() }));
      byEmis?.docs.forEach((row) => rows.set(row.id, { id: row.id, ...row.data() }));
      const matches = Array.from(rows.values());

      if (!matches.length) {
        return { data: null, summary: `I could not find a SAR matching ${ref || `EMIS ${emis}`}.`, confidence: 0.82, sources: [source('Governance SARs', `Searched by ${ref ? 'reference' : 'EMIS number'} · live read ${nowLabel()}`)], actions: [{ label: 'Open SARs', route: '/governance/sars' }] };
      }

      const describe = (sar) => {
        const deadline = getSarDeadlineTone(sar);
        return `${sar.reference}: ${getStatusLabel(sar.status)}, ${sar.requestTypeLabel || 'record'} request${sar.urgent ? ' (urgent)' : ''}, assigned to ${sar.assignedToName || 'Unassigned'}. ${deadline.label}.`;
      };

      return {
        domain: 'governance', data: matches,
        summary: matches.length === 1 ? describe(matches[0]) : `${matches.length} SARs matched: ${matches.map(describe).join(' ')}`,
        confidence: 0.97,
        sources: [source('Governance SARs', `${matches.length} match${matches.length === 1 ? '' : 'es'} · live read ${nowLabel()}`)],
        actions: [{ label: 'Open SARs', route: '/governance/sars' }],
      };
    },
  });

  // ---- stock: where it is, and things the Orb can PREPARE for you to confirm ------------------------------------
  // The two "draft" lookups only read data and return a proposal card; nothing is sent, created
  // or changed until the person presses Confirm (see src/orb/actionProposals.js).
  const readKits = async () => {
    const [emergency, anaphylaxis] = await Promise.all([listEmergencyAssets().catch(() => []), listAnaphylaxisBoxes().catch(() => [])]);
    return [
      ...emergency.map((kit) => ({ collection: 'emergency_assets', kit })),
      ...anaphylaxis.map((kit) => ({ collection: 'anaphylaxis_boxes', kit })),
    ];
  };
  const readRoleNames = async () => {
    const custom = await getDocs(collection(db, 'roles')).then((snap) => snap.docs.map((d) => ({ ...d.data(), name: d.data().name || d.id }))).catch(() => []);
    return [...new Set([...Object.keys(ROLE_TEMPLATES), ...custom.filter((r) => r.active !== false).map((r) => r.name)])];
  };

  registerTool({
    id: 'inventory.locate', label: 'Stock location', requiredCapability: 'inventory.read',
    async execute(input = {}) {
      const [items, kits] = await Promise.all([readStock(), readKits()]);
      const result = buildLocateResult(input, { items, kits });
      return {
        domain: 'inventory', data: { ambiguous: Boolean(result.ambiguous) }, summary: result.text, followUps: result.followUps,
        confidence: result.ambiguous ? 0.7 : 0.95,
        sources: [source('Inventory', `${items.length} active products and ${kits.length} kit${kits.length === 1 ? '' : 's'} checked · live read ${nowLabel()}`)],
        actions: [{ label: 'Open Inventory', route: '/inventory' }],
      };
    },
  });

  registerTool({
    id: 'team.messageDraft', label: 'Message a team', requiredCapability: 'inventory.write',
    async execute(input = {}) {
      // Stock is only used to offer a matching reorder chip, so a failed read doesn't stop the draft.
      const [items, roleNames] = await Promise.all([readStock().catch(() => []), readRoleNames()]);
      const result = buildTeamDraft(input, { items, roleNames });
      return {
        domain: 'inventory', data: { proposed: Boolean(result.proposal) }, summary: result.text, followUps: result.followUps, proposal: result.proposal || null,
        confidence: result.proposal ? 0.95 : 0.6,
        sources: [source('Primovex teams', `${roleNames.length} roles known`, 'system')],
        actions: [],
      };
    },
  });

  registerTool({
    id: 'reorder.draft', label: 'Reorder or report missing stock', requiredCapability: 'inventory.write',
    async execute(input = {}) {
      const [items, kits, roleNames, pendingSnap] = await Promise.all([
        readStock(), readKits(), readRoleNames(),
        getDocs(query(collection(db, 'reorder_requests'), where('status', '==', 'pending'))).catch(() => ({ docs: [] })),
      ]);
      const pending = pendingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const result = buildReorderDraft(input, { items, kits, roleNames, pending });
      return {
        domain: 'inventory', data: { proposed: Boolean(result.proposal) }, summary: result.text, followUps: result.followUps, proposal: result.proposal || null,
        confidence: result.proposal ? 0.95 : result.ambiguous ? 0.7 : 0.8,
        sources: [source('Inventory', `${items.length} active products and ${pending.length} pending reorder${pending.length === 1 ? '' : 's'} checked · live read ${nowLabel()}`)],
        actions: result.actions || [{ label: 'Open Reorder Centre', route: '/reorder-centre' }],
      };
    },
  });

  // Step-by-step "how do I...?" help from the practice's own help articles. Static text:
  // it reads no practice data and sends nothing anywhere.
  registerTool({
    id: 'help.howTo', label: 'How-to help', requiredCapability: 'dashboard.read',
    execute({ question = '', topic = '' } = {}, context = {}) {
      const asked = String(topic || question || '').trim();
      const found = findHelp(asked);
      const platform = typeof document !== 'undefined' ? document.documentElement.dataset.primovexClient || 'desktop' : 'desktop';
      const capabilityLabel = (id) => CAPABILITY_CATALOG.find((c) => c.id === id)?.label || id;
      const common = { domain: 'help', sources: [describeSource()] };
      if (found.match) {
        const article = found.match;
        return {
          ...common,
          data: { id: article.id, title: article.title, topic: article.topic },
          summary: formatHelpAnswer(article, { capabilities: context.capabilities || [], platform, hasCapability, capabilityLabel }),
          followUps: relatedQuestions(article),
          confidence: 0.95,
          actions: article.open ? [article.open] : [],
        };
      }
      if (found.alternatives.length) {
        return {
          ...common,
          data: { options: found.alternatives.map((a) => a.id) },
          summary: ['That could be a few different things. Which did you mean?', ...found.alternatives.map((a) => `• ${a.title}`)].join('\n'),
          followUps: found.alternatives.map((a) => a.asks[0]).slice(0, 3),
          confidence: 0.7,
          actions: [],
        };
      }
      return {
        ...common,
        data: { id: null },
        summary: "I don't have step-by-step help for that yet. I can show you how to do things like adding stock, checking a kit, logging a temperature or adding a member of staff. A colleague or an administrator can help with anything else.",
        followUps: sampleQuestions(3),
        confidence: 0.5,
        actions: [],
      };
    },
  });

  registerTool({
    id: 'knowledge.faqLookup', label: 'Practice knowledge lookup', requiredCapability: 'operations.read',
    execute({ entryId = '' } = {}) {
      const entry = orbKnowledgeStore.get(entryId);
      if (!entry) {
        return { data: null, summary: "I don't have an answer taught for that yet.", confidence: 0.3, sources: [source('Practice knowledge', 'No matching entry')], actions: [] };
      }
      return {
        domain: 'knowledge', data: entry,
        summary: entry.answer,
        confidence: 0.9,
        sources: [source('Practice knowledge', `Taught entry · ${entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString('en-GB') : 'date unknown'}`)],
        actions: [],
      };
    },
  });
}
