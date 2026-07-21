function TemperatureIncidentsTab() {
    const [units, setUnits] = useState([]);
    const [incidents, setIncidents] = useState([]);
  
    const [siteFilter, setSiteFilter] = useState("__ALL__");
    const [statusFilter, setStatusFilter] = useState("open"); // open | resolved | all
  
    const [isOpenModal, setIsOpenModal] = useState(false);
    const [modalError, setModalError] = useState("");
  
      // ✅ Resolve modal state (replaces window.prompt)
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolveBy, setResolveBy] = useState("");
  const [resolveNotes, setResolveNotes] = useState("");
  const [resolveErr, setResolveErr] = useState("");
  
    const [newIncident, setNewIncident] = useState({
      unitId: "",
      observedTemp: "",
      summary: "",
      details: "",
      actionsTaken: "",
      quarantined: false,
      discarded: false,
      movedToBackupUnit: false,
      stockNotes: "",
      openedBy: "",
    });
  
    // Load units
    useEffect(() => {
      const qy = query(collection(db, UNITS_COLLECTION), orderBy("site", "asc"));
      return onSnapshot(
        qy,
        (snap) => {
          const rows = snap.docs.map((d) => {
            const data = d.data();
            const type = normalizeUnitType(data.unitType);
            const fallback = DEFAULT_RANGES[type] || DEFAULT_RANGES.fridge;
  
            const min = safeNumber(data.rangeMin);
            const max = safeNumber(data.rangeMax);
  
            return {
              id: d.id,
              siteId: data.site ?? data.siteId ?? "",
              name: data.unitName ?? data.name ?? d.id,
              type,
              active: data.active !== false,
              range: {
                min: min !== null ? min : fallback.min,
                max: max !== null ? max : fallback.max,
              },
            };
          });
  
          rows.sort((a, b) => {
            const s = String(a.siteId).localeCompare(String(b.siteId));
            if (s !== 0) return s;
            return String(a.name).localeCompare(String(b.name));
          });
  
          setUnits(rows);
  
          // Default unit selection
          setNewIncident((prev) => {
            if (prev.unitId && rows.some((u) => u.id === prev.unitId)) return prev;
            const first = rows.find((u) => u.active) || rows[0];
            return { ...prev, unitId: first?.id || "" };
          });
        },
        (err) => console.error("temperature_units subscribe error:", err)
      );
    }, []);
  
    // Load incidents
    useEffect(() => {
      const qy = query(collection(db, INCIDENTS_COLLECTION), orderBy("openedAt", "desc"));
      return onSnapshot(
        qy,
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setIncidents(rows);
        },
        (err) => console.error("temperature_incidents subscribe error:", err)
      );
    }, []);
  
    const siteOptions = useMemo(() => {
      const vals = Array.from(new Set(units.map((u) => u.siteId).filter(Boolean)));
      vals.sort((a, b) => a.localeCompare(b));
      return [
        { value: "__ALL__", label: "All Sites" },
        ...vals.map((v) => ({ value: v, label: siteLabel(v) })),
      ];
    }, [units]);
  
    const filteredIncidents = useMemo(() => {
      return incidents.filter((i) => {
        const siteOk = siteFilter === "__ALL__" ? true : String(i.siteId || "") === siteFilter;
        const statusOk = statusFilter === "all" ? true : String(i.status || "open") === statusFilter;
        return siteOk && statusOk;
      });
    }, [incidents, siteFilter, statusFilter]);
  
    const openCount = useMemo(
      () => incidents.filter((i) => String(i.status || "open") === "open").length,
      [incidents]
    );
    const resolvedCount = useMemo(
      () => incidents.filter((i) => String(i.status || "open") === "resolved").length,
      [incidents]
    );
  
    const handleNewChange = (field, value) => setNewIncident((p) => ({ ...p, [field]: value }));
  
    const resetModal = () => {
      setModalError("");
      setNewIncident((prev) => ({
        ...prev,
        observedTemp: "",
        summary: "",
        details: "",
        actionsTaken: "",
        quarantined: false,
        discarded: false,
        movedToBackupUnit: false,
        stockNotes: "",
        openedBy: "",
      }));
    };
  
    const createIncident = async () => {
      setModalError("");
  
      const unit = units.find((u) => u.id === newIncident.unitId);
      if (!unit) {
        setModalError("Please select a unit.");
        return;
      }
      if (!newIncident.summary.trim()) {
        setModalError("Please add a short summary.");
        return;
      }
  
      const tempNum = newIncident.observedTemp === "" ? null : Number(newIncident.observedTemp);
      if (newIncident.observedTemp !== "" && Number.isNaN(tempNum)) {
        setModalError("Observed temperature must be a number.");
        return;
      }
  
      try {
        await addDoc(collection(db, INCIDENTS_COLLECTION), {
          unitId: unit.id,
          unitName: unit.name,
          unitType: unit.type,
          siteId: unit.siteId || "",
          expectedRange: unit.range,
  
          observedTemp: tempNum,
  
          summary: newIncident.summary.trim(),
          details: newIncident.details.trim(),
  
          actionsTaken: newIncident.actionsTaken.trim(),
          affectedStock: {
            quarantined: !!newIncident.quarantined,
            discarded: !!newIncident.discarded,
            movedToBackupUnit: !!newIncident.movedToBackupUnit,
            stockNotes: newIncident.stockNotes.trim(),
          },
  
          status: "open",
          openedAt: serverTimestamp(),
          openedBy: newIncident.openedBy.trim() || "",
  
          resolvedAt: null,
          resolvedBy: null,
          resolutionNotes: "",
        });
  
        resetModal();
        setIsOpenModal(false);
      } catch (e) {
        console.error("Create incident error:", e);
        setModalError("Failed to create incident. Check Firestore rules.");
      }
    };
  
    // ✅ Open resolve modal instead of window.prompt
    const openResolveModal = (incident) => {
      setResolveError("");
      setResolveTarget(incident);
      setResolveForm({
        resolvedBy: "",
        resolutionNotes: "",
      });
      setIsResolveModalOpen(true);
    };
  
    const submitResolve = async () => {
      setResolveError("");
      if (!resolveTarget?.id) {
        setResolveError("No incident selected.");
        return;
      }
      if (!String(resolveForm.resolutionNotes || "").trim()) {
        setResolveError("Please add resolution notes.");
        return;
      }
  
      try {
        await updateDoc(doc(db, INCIDENTS_COLLECTION, resolveTarget.id), {
          status: "resolved",
          resolvedAt: serverTimestamp(),
          resolvedBy: String(resolveForm.resolvedBy || "").trim(),
          resolutionNotes: String(resolveForm.resolutionNotes || "").trim(),
        });
  
        setIsResolveModalOpen(false);
        setResolveTarget(null);
      } catch (e) {
        console.error("Resolve incident error:", e);
        setResolveError("Could not resolve incident. Check permissions/rules.");
      }
    };
  
    const reopenIncident = async (incidentId) => {
      if (!window.confirm("Re-open this incident?")) return;
      try {
        await updateDoc(doc(db, INCIDENTS_COLLECTION, incidentId), {
          status: "open",
          resolvedAt: null,
          resolvedBy: null,
          resolutionNotes: "",
        });
      } catch (e) {
        console.error("Reopen incident error:", e);
        alert("Could not re-open incident. Check permissions/rules.");
      }
    };
  
    return (
      <div className="space-y-6">
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-200 border border-white/10">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Incidents</h2>
              <p className="text-sm text-slate-400">Log out-of-range events and track resolution.</p>
            </div>
          </div>
  
          <Button
            className="rounded-full bg-gradient-to-r from-rose-400 to-amber-300 px-4 py-2 text-xs font-medium text-slate-950 shadow-sm hover:from-rose-300 hover:to-amber-200"
            onClick={() => setIsOpenModal(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Incident
          </Button>
        </div>
  
        {/* Mini stats */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border border-white/10 bg-slate-900/60 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-200 border border-white/10">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-100">{openCount}</div>
                <div className="text-xs text-slate-400">Open</div>
              </div>
            </div>
          </Card>
  
          <Card className="border border-white/10 bg-slate-900/60 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-200 border border-white/10">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xl font-semibold text-slate-100">{resolvedCount}</div>
                <div className="text-xs text-slate-400">Resolved</div>
              </div>
            </div>
          </Card>
        </div>
  
        {/* Filters */}
        <Card className="border border-white/10 bg-slate-900/70 backdrop-blur p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-xs text-slate-200">
              <MapPin className="h-4 w-4 text-slate-400 pointer-events-none" />
              <select className={SELECT_CLASS} value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
                {siteOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
  
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-800/70 px-3 py-2 text-xs text-slate-200">
              <CheckCircle className="h-4 w-4 text-slate-400 pointer-events-none" />
              <select className={SELECT_CLASS} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="all">All</option>
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </Card>
  
        {/* List */}
        <Card className="border border-white/10 bg-slate-900/60 backdrop-blur shadow-lg">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-slate-100">Incidents</p>
          </div>
  
          <div className="divide-y divide-white/10">
            {filteredIncidents.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-slate-400">
                No incidents match the current filters.
              </div>
            ) : (
              filteredIncidents.map((i) => {
                const status = String(i.status || "open");
                const range = i.expectedRange || null;
  
                return (
                  <div key={i.id} className="px-4 py-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              status === "open"
                                ? "inline-flex items-center rounded-full border border-rose-500/20 bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200"
                                : "inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200"
                            }
                          >
                            {status === "open" ? "OPEN" : "RESOLVED"}
                          </span>
  
                          <span className="text-xs font-semibold text-slate-100 truncate">
                            {i.summary || "Incident"}
                          </span>
                        </div>
  
                        <div className="mt-1 text-xs text-slate-300">
                          <span className="font-medium">{siteLabel(i.siteId)}</span> —{" "}
                          <span className="text-slate-100">{i.unitName || i.unitId}</span>{" "}
                          <span className="text-slate-400">({i.unitType || "unit"})</span>
                        </div>
  
                        <div className="mt-1 text-[0.7rem] text-slate-400">
                          Opened: {formatDateTime(i.openedAt)} {i.openedBy ? `• ${i.openedBy}` : ""}
                        </div>
  
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <Card className="border border-white/10 bg-slate-950/30 p-3">
                            <div className="flex items-center gap-2 text-xs text-slate-200">
                              <Thermometer className="h-4 w-4 text-slate-400" />
                              Observed:{" "}
                              <span className="text-slate-100 font-semibold">
                                {i.observedTemp === null || i.observedTemp === undefined
                                  ? "—"
                                  : `${i.observedTemp} °C`}
                              </span>
                            </div>
                            {range ? (
                              <div className="mt-1 text-[0.7rem] text-slate-400">
                                Expected: {range.min} to {range.max} °C
                              </div>
                            ) : null}
                          </Card>
  
                          <Card className="border border-white/10 bg-slate-950/30 p-3">
                            <div className="text-xs font-medium text-slate-100">Affected stock</div>
                            <div className="mt-1 text-[0.7rem] text-slate-400">
                              {i.affectedStock?.quarantined ? "• Quarantined " : ""}
                              {i.affectedStock?.discarded ? "• Discarded " : ""}
                              {i.affectedStock?.movedToBackupUnit ? "• Moved " : ""}
                              {!i.affectedStock?.quarantined &&
                              !i.affectedStock?.discarded &&
                              !i.affectedStock?.movedToBackupUnit
                                ? "None recorded"
                                : ""}
                            </div>
                          </Card>
                        </div>
  
                        {i.details ? (
                          <div className="mt-2 text-xs text-slate-200 whitespace-pre-wrap">{i.details}</div>
                        ) : null}
  
                        {i.actionsTaken ? (
                          <div className="mt-2 text-xs text-slate-200">
                            <span className="text-slate-400">Actions:</span>{" "}
                            <span className="whitespace-pre-wrap">{i.actionsTaken}</span>
                          </div>
                        ) : null}
  
                        {status === "resolved" ? (
                          <div className="mt-2 text-xs text-emerald-200">
                            <span className="text-slate-400">Resolved:</span> {formatDateTime(i.resolvedAt)}{" "}
                            {i.resolvedBy ? `• ${i.resolvedBy}` : ""}
                            {i.resolutionNotes ? (
                              <div className="mt-1 text-xs text-slate-200 whitespace-pre-wrap">
                                {i.resolutionNotes}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
  
                      <div className="flex gap-2 shrink-0">
                        {status === "open" ? (
                          <Button
                            className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs"
                            onClick={() => openResolveModal(i)}
                          >
                            <CheckCircle className="mr-1.5 h-4 w-4" />
                            Resolve
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                            onClick={() => reopenIncident(i.id)}
                          >
                            Re-open
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
  
        {/* New Incident modal (UNCHANGED from your existing modal) */}
        {isOpenModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-50">New incident</h2>
                  <p className="mt-0.5 text-[0.7rem] text-slate-400">
                    Log an out-of-range event and what was done about it.
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-slate-900/40 p-2 text-slate-200 hover:bg-slate-900/60"
                  onClick={() => {
                    resetModal();
                    setIsOpenModal(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
  
              {modalError && (
                <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {modalError}
                </div>
              )}
  
              <div className="mt-4 space-y-3 text-sm">
                {/* Unit */}
                <div>
                  <label className="text-xs text-slate-300">Unit</label>
                  <div className="mt-1 inline-flex w-full items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2">
                    <Thermometer className="h-4 w-4 text-slate-400 pointer-events-none" />
                    <select
                      className={"flex-1 " + SELECT_CLASS}
                      value={newIncident.unitId}
                      onChange={(e) => handleNewChange("unitId", e.target.value)}
                    >
                      {units.filter((u) => u.active).map((u) => (
                        <option key={u.id} value={u.id}>
                          {siteLabel(u.siteId)} — {u.name} ({u.type}) [{u.range.min} to {u.range.max}°C]
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="h-3 w-3 text-slate-400 pointer-events-none" />
                  </div>
                </div>
  
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-slate-300">Observed temperature (optional)</label>
                    <Input
                      value={newIncident.observedTemp}
                      onChange={(e) => handleNewChange("observedTemp", e.target.value)}
                      placeholder="e.g. 12.3"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-300">Opened by (optional)</label>
                    <Input
                      value={newIncident.openedBy}
                      onChange={(e) => handleNewChange("openedBy", e.target.value)}
                      placeholder="e.g. J. Smith"
                    />
                  </div>
                </div>
  
                <div>
                  <label className="text-xs text-slate-300">Summary</label>
                  <Input
                    value={newIncident.summary}
                    onChange={(e) => handleNewChange("summary", e.target.value)}
                    placeholder="e.g. Vaccine fridge out of range (10°C)"
                  />
                </div>
  
                <div>
                  <label className="text-xs text-slate-300">Details (optional)</label>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    rows={3}
                    value={newIncident.details}
                    onChange={(e) => handleNewChange("details", e.target.value)}
                    placeholder="What happened / context"
                  />
                </div>
  
                <div>
                  <label className="text-xs text-slate-300">Actions taken (optional)</label>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    rows={3}
                    value={newIncident.actionsTaken}
                    onChange={(e) => handleNewChange("actionsTaken", e.target.value)}
                    placeholder="e.g. Checked door seal, moved vaccines to backup fridge, called engineer…"
                  />
                </div>
  
                <Card className="border border-white/10 bg-slate-950/30 p-3">
                  <div className="text-xs font-semibold text-slate-100">Affected stock</div>
  
                  <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs text-slate-200">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newIncident.quarantined}
                        onChange={(e) => handleNewChange("quarantined", e.target.checked)}
                      />
                      Quarantined
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newIncident.discarded}
                        onChange={(e) => handleNewChange("discarded", e.target.checked)}
                      />
                      Discarded
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newIncident.movedToBackupUnit}
                        onChange={(e) => handleNewChange("movedToBackupUnit", e.target.checked)}
                      />
                      Moved
                    </label>
                  </div>
  
                  <div className="mt-2">
                    <label className="text-[0.7rem] text-slate-400">Stock notes (optional)</label>
                    <Input
                      value={newIncident.stockNotes}
                      onChange={(e) => handleNewChange("stockNotes", e.target.value)}
                      placeholder="e.g. Quarantined batch FLU23-184 pending pharmacist advice"
                    />
                  </div>
                </Card>
              </div>
  
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
                  onClick={() => {
                    resetModal();
                    setIsOpenModal(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-gradient-to-r from-rose-400 to-amber-300 px-3 py-1.5 text-xs font-medium text-slate-950"
                  onClick={createIncident}
                >
                  Create incident
                </button>
              </div>
            </div>
          </div>
        )}
  
        {/* ✅ Resolve modal (NEW) */}
        {isResolveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-50">Resolve incident</h2>
                  <p className="mt-0.5 text-[0.7rem] text-slate-400">
                    {resolveTarget?.summary ? resolveTarget.summary : "Incident"}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-slate-900/40 p-2 text-slate-200 hover:bg-slate-900/60"
                  onClick={() => {
                    setIsResolveModalOpen(false);
                    setResolveTarget(null);
                    setResolveError("");
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
  
              {resolveError && (
                <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {resolveError}
                </div>
              )}
  
              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-xs text-slate-300">Resolved by (optional)</label>
                  <Input
                    value={resolveForm.resolvedBy}
                    onChange={(e) => setResolveForm((p) => ({ ...p, resolvedBy: e.target.value }))}
                    placeholder="e.g. J. Smith"
                  />
                </div>
  
                <div>
                  <label className="text-xs text-slate-300">Resolution notes (required)</label>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    rows={4}
                    value={resolveForm.resolutionNotes}
                    onChange={(e) => setResolveForm((p) => ({ ...p, resolutionNotes: e.target.value }))}
                    placeholder="What was done / outcome / any follow-up?"
                  />
                </div>
              </div>
  
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="outline"
                  className="rounded-full border-white/10 bg-slate-900/40 text-xs text-slate-200 hover:bg-slate-900/60"
                  onClick={() => {
                    setIsResolveModalOpen(false);
                    setResolveTarget(null);
                    setResolveError("");
                  }}
                >
                  Cancel
                </Button>
  
                <Button
                  className="rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300 text-xs"
                  onClick={submitResolve}
                >
                  <CheckCircle className="mr-1.5 h-4 w-4" />
                  Resolve
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  


