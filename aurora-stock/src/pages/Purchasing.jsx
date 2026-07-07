import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  BarChart3,
  Building2,
  ExternalLink,
  PackageCheck,
  Send,
  ShoppingCart,
  Truck,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";

const ORDER_STATUSES_OPEN = ["draft", "ready", "sent", "awaiting_delivery", "part_delivered"];
const DELIVERY_STATUSES = ["sent", "awaiting_delivery", "part_delivered"];

function makePoNumber() {
  const year = new Date().getFullYear();
  const suffix = String(Date.now()).slice(-6);
  return `PO-${year}-${suffix}`;
}

function asDateLabel(value) {
  if (!value) return "—";

  try {
    const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function titleCase(value) {
  const text = String(value || "").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getSupplierName(request, suppliersById) {
  if (request.supplier_name) return request.supplier_name;
  if (request.supplier_id && suppliersById[request.supplier_id]?.name) {
    return suppliersById[request.supplier_id].name;
  }
  return "Unassigned Supplier";
}

function groupApprovedRequests(requests, suppliersById) {
  const groups = new Map();

  requests
    .filter((request) => (request.status || "pending") === "approved")
    .forEach((request) => {
      const supplierId = request.supplier_id || "unassigned";
      const supplier = supplierId !== "unassigned" ? suppliersById[supplierId] : null;
      const supplierName = getSupplierName(request, suppliersById);
      const key = supplierId || supplierName;

      if (!groups.has(key)) {
        groups.set(key, {
          supplier_id: supplierId === "unassigned" ? "" : supplierId,
          supplier_name: supplierName,
          supplier,
          is_unassigned: supplierId === "unassigned",
          requests: [],
        });
      }

      groups.get(key).requests.push({
        ...request,
        supplier_name: supplierName,
      });
    });

  return Array.from(groups.values()).sort((a, b) =>
    a.supplier_name.localeCompare(b.supplier_name)
  );
}

function StatusPill({ status }) {
  const value = status || "draft";
  const classes = {
    draft: "bg-slate-500/10 text-slate-200 border-slate-500/30",
    ready: "bg-cyan-500/10 text-cyan-200 border-cyan-500/30",
    sent: "bg-blue-500/10 text-blue-200 border-blue-500/30",
    awaiting_delivery: "bg-amber-500/10 text-amber-200 border-amber-500/30",
    part_delivered: "bg-violet-500/10 text-violet-200 border-violet-500/30",
    completed: "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
    cancelled: "bg-rose-500/10 text-rose-200 border-rose-500/30",
  };

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${classes[value] || classes.draft}`}>
      {titleCase(value)}
    </span>
  );
}

function OrderingMethodBadge({ method }) {
  const label = titleCase(method || "manual");
  return (
    <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-1 text-xs font-semibold text-teal-200">
      {label}
    </span>
  );
}

function productSubtitle(row) {
  return [row?.item_strength || row?.strength, row?.item_form || row?.form].filter(Boolean).join(" • ");
}

export default function Purchasing() {
  const [requests, setRequests] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [poLoading, setPoLoading] = useState(true);
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [busySupplierKey, setBusySupplierKey] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [activeTab, setActiveTab] = useState("basket");

  useEffect(() => {
    const qRequests = query(collection(db, "reorder_requests"), limit(300));

    const unsub = onSnapshot(
      qRequests,
      (snap) => {
        const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
        setRequests(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Purchasing request query failed:", err);
        alert(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const qOrders = query(collection(db, "purchase_orders"), limit(200));

    const unsub = onSnapshot(
      qOrders,
      (snap) => {
        const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
        setPurchaseOrders(rows);
        setPoLoading(false);
      },
      (err) => {
        console.error("Purchase order query failed:", err);
        alert(err.message);
        setPoLoading(false);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    const qSuppliers = query(collection(db, "suppliers"), limit(300));

    const unsub = onSnapshot(
      qSuppliers,
      (snap) => {
        const rows = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
        setSuppliers(rows);
        setSupplierLoading(false);
      },
      (err) => {
        console.error("Supplier query failed:", err);
        alert(err.message);
        setSupplierLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const suppliersById = useMemo(() => {
    return suppliers.reduce((acc, supplier) => {
      acc[supplier.id] = supplier;
      return acc;
    }, {});
  }, [suppliers]);

  const basketGroups = useMemo(
    () => groupApprovedRequests(requests, suppliersById),
    [requests, suppliersById]
  );

  const openPurchaseOrders = useMemo(() => {
    return purchaseOrders.filter((order) => ORDER_STATUSES_OPEN.includes(order.status || "draft"));
  }, [purchaseOrders]);

  const deliveryOrders = useMemo(() => {
    return purchaseOrders.filter((order) => DELIVERY_STATUSES.includes(order.status || "draft"));
  }, [purchaseOrders]);

  const approvedRequestCount = useMemo(() => {
    return requests.filter((request) => (request.status || "pending") === "approved").length;
  }, [requests]);

  const integrationReadySupplierCount = useMemo(() => {
    return suppliers.filter((supplier) => supplier.ordering_method && supplier.ordering_method !== "manual").length;
  }, [suppliers]);

  const supplierPerformance = useMemo(() => {
    const map = new Map();

    purchaseOrders.forEach((order) => {
      const key = order.supplier_id || order.supplier_name || "unassigned";

      if (!map.has(key)) {
        map.set(key, {
          supplier_id: order.supplier_id || "",
          supplier_name: order.supplier_name || "Unassigned Supplier",
          total_orders: 0,
          open_orders: 0,
          completed_orders: 0,
          total_qty: 0,
        });
      }

      const row = map.get(key);
      row.total_orders += 1;
      row.total_qty += Number(order.total_qty || 0);

      if (ORDER_STATUSES_OPEN.includes(order.status || "draft")) {
        row.open_orders += 1;
      }

      if ((order.status || "") === "completed") {
        row.completed_orders += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.total_orders - a.total_orders);
  }, [purchaseOrders]);

  const createPurchaseOrder = async (group) => {
    if (!group || group.is_unassigned) return;

    const supplierKey = group.supplier_id || group.supplier_name;
    const supplier = group.supplier || suppliersById[group.supplier_id] || null;

    try {
      setBusySupplierKey(supplierKey);

      const batch = writeBatch(db);
      const poRef = doc(collection(db, "purchase_orders"));
      const poNumber = makePoNumber();
      const user = auth.currentUser ?? null;

      const items = group.requests.map((request) => ({
        reorder_request_id: request.id,
        item_id: request.item_id || "",
        item_name: request.item_name || "Unnamed item",
        item_strength: request.item_strength || request.strength || "",
        item_form: request.item_form || request.form || "",
        product_identity_key: request.product_identity_key || "",
        barcode: request.barcode || "",
        supplier_sku: request.supplier_sku || "",
        requested_qty: Number(request.requested_qty || request.order_quantity || 1),
        approved_qty: Number(request.requested_qty || request.order_quantity || 1),
        received_qty: 0,
        current_stock: Number(request.current_stock || 0),
        min_stock: Number(request.min_stock || 0),
        site: request.site || "",
        location: request.location || "",
      }));

      const totalQty = items.reduce((sum, item) => sum + Number(item.approved_qty || 0), 0);
      const submissionMethod = supplier?.ordering_method || "manual";

      batch.set(poRef, {
        po_number: poNumber,
        supplier_id: group.supplier_id,
        supplier_name: group.supplier_name,
        supplier_account_number: supplier?.account_number || "",
        supplier_ordering_method: submissionMethod,
        supplier_ordering_email: supplier?.ordering_email || supplier?.email || "",
        supplier_portal_url: supplier?.portal_url || supplier?.website || "",
        supplier_api_provider: supplier?.api_provider || "",
        supports_auto_ordering: Boolean(supplier?.supports_auto_ordering),
        status: "draft",
        source: "purchasing_basket",
        submission_method: submissionMethod,
        submission_status: "draft",
        external_order_reference: "",
        submitted_at: null,
        submitted_by: null,
        total_items: items.length,
        total_qty: totalQty,
        items,
        notes: "",
        expected_delivery_date: "",
        created_by: {
          uid: user?.uid || null,
          displayName: user?.displayName || user?.email || "Unknown",
          email: user?.email || null,
        },
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      group.requests.forEach((request) => {
        const requestRef = doc(db, "reorder_requests", request.id);

        batch.update(requestRef, {
          status: "ordered",
          purchase_order_id: poRef.id,
          po_number: poNumber,
          ordered_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      });

      await batch.commit();

      alert(`${poNumber} created for ${group.supplier_name}`);
    } catch (err) {
      console.error(err);
      alert("Failed to create purchase order");
    } finally {
      setBusySupplierKey(null);
    }
  };

  const updatePurchaseOrderStatus = async (orderId, status, extra = {}) => {
    try {
      setBusyOrderId(orderId);

      await updateDoc(doc(db, "purchase_orders", orderId), {
        status,
        ...extra,
        updated_at: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      alert("Failed to update purchase order");
    } finally {
      setBusyOrderId(null);
    }
  };

  const markReadyToSend = (order) => {
    updatePurchaseOrderStatus(order.id, "ready", {
      submission_status: "ready",
    });
  };

  const markSubmitted = (order) => {
    const user = auth.currentUser ?? null;

    updatePurchaseOrderStatus(order.id, "sent", {
      submission_status: "submitted",
      submitted_at: serverTimestamp(),
      submitted_by: {
        uid: user?.uid || null,
        displayName: user?.displayName || user?.email || "Unknown",
        email: user?.email || null,
      },
    });
  };

  const markAwaitingDelivery = (order) => {
    updatePurchaseOrderStatus(order.id, "awaiting_delivery", {
      submission_status: order.submission_status || "submitted",
    });
  };

  const markCompleted = (order) => {
    updatePurchaseOrderStatus(order.id, "completed", {
      completed_at: serverTimestamp(),
    });
  };

  const tabs = [
    { id: "basket", label: "Basket" },
    { id: "orders", label: "Purchase Orders" },
    { id: "deliveries", label: "Deliveries" },
    { id: "performance", label: "Supplier Performance" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-300">
          <ShoppingCart className="h-6 w-6" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">Purchasing</h1>
          <p className="text-sm text-slate-400">
            Group approved reorder requests by supplier, generate purchase orders, and prepare future supplier integrations.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <button
          type="button"
          onClick={() => setActiveTab("basket")}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left hover:bg-slate-800"
        >
          <div className="text-xs uppercase tracking-wide text-slate-500">Supplier Baskets</div>
          <div className="mt-2 text-3xl font-bold text-white">{loading ? "—" : basketGroups.length}</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("basket")}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left hover:bg-slate-800"
        >
          <div className="text-xs uppercase tracking-wide text-slate-500">Approved Requests</div>
          <div className="mt-2 text-3xl font-bold text-white">{loading ? "—" : approvedRequestCount}</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("orders")}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left hover:bg-slate-800"
        >
          <div className="text-xs uppercase tracking-wide text-slate-500">Open Orders</div>
          <div className="mt-2 text-3xl font-bold text-white">{poLoading ? "—" : openPurchaseOrders.length}</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("deliveries")}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left hover:bg-slate-800"
        >
          <div className="text-xs uppercase tracking-wide text-slate-500">Awaiting Delivery</div>
          <div className="mt-2 text-3xl font-bold text-white">{poLoading ? "—" : deliveryOrders.length}</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("performance")}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left hover:bg-slate-800"
        >
          <div className="text-xs uppercase tracking-wide text-slate-500">Integration Ready</div>
          <div className="mt-2 text-3xl font-bold text-white">{supplierLoading ? "—" : integrationReadySupplierCount}</div>
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              activeTab === tab.id
                ? "bg-teal-400 text-slate-950"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "basket" && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Purchasing Basket</h2>
              <p className="text-sm text-slate-400">Approved reorder requests grouped into one basket per supplier.</p>
            </div>
            <PackageCheck className="h-5 w-5 text-emerald-300" />
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Loading basket...</p>
          ) : basketGroups.length === 0 ? (
            <p className="text-sm text-slate-400">No approved requests waiting for purchasing.</p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {basketGroups.map((group) => {
                const supplierKey = group.supplier_id || group.supplier_name;
                const supplier = group.supplier || suppliersById[group.supplier_id] || null;
                const totalQty = group.requests.reduce(
                  (sum, request) => sum + Number(request.requested_qty || request.order_quantity || 1),
                  0
                );

                return (
                  <div key={supplierKey} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-white">{group.supplier_name}</h3>
                        <p className="text-sm text-slate-400">
                          {group.requests.length} item{group.requests.length === 1 ? "" : "s"} • Qty {totalQty}
                        </p>
                      </div>

                      {group.is_unassigned ? (
                        <span className="rounded-full bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-200">
                          Supplier needed
                        </span>
                      ) : (
                        <OrderingMethodBadge method={supplier?.ordering_method || "manual"} />
                      )}
                    </div>

                    {!group.is_unassigned && (
                      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
                        <div>Account: {supplier?.account_number || "Not recorded"}</div>
                        <div>Ordering email: {supplier?.ordering_email || supplier?.email || "Not recorded"}</div>
                        <div>Portal: {supplier?.portal_url || supplier?.website || "Not recorded"}</div>
                      </div>
                    )}

                    <div className="mt-4 space-y-2">
                      {group.requests.map((request) => (
                        <div key={request.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
                          <div className="flex justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-white">{request.item_name}</div>
                              {productSubtitle(request) && (
                                <div className="text-xs text-teal-200">{productSubtitle(request)}</div>
                              )}
                              <div className="text-xs text-slate-400">
                                {request.supplier_sku ? `SKU: ${request.supplier_sku}` : "No supplier SKU"}
                                {request.location ? ` • ${request.location}` : ""}
                              </div>
                            </div>
                            <div className="shrink-0 font-bold text-emerald-300">
                              x{request.requested_qty || request.order_quantity || 1}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => createPurchaseOrder(group)}
                      disabled={group.is_unassigned || busySupplierKey === supplierKey}
                      className="mt-4 w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busySupplierKey === supplierKey
                        ? "Creating Purchase Order..."
                        : group.is_unassigned
                        ? "Assign supplier before creating PO"
                        : "Create Purchase Order"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "orders" && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Purchase Orders</h2>
              <p className="text-sm text-slate-400">Drafts, ready orders, and submitted supplier orders.</p>
            </div>
            <Send className="h-5 w-5 text-cyan-300" />
          </div>

          {poLoading ? (
            <p className="text-sm text-slate-400">Loading purchase orders...</p>
          ) : purchaseOrders.length === 0 ? (
            <p className="text-sm text-slate-400">No purchase orders yet.</p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {purchaseOrders.map((order) => (
                <div key={order.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{order.po_number || order.id}</div>
                      <div className="text-sm text-slate-400">{order.supplier_name || "No supplier"}</div>
                    </div>

                    <StatusPill status={order.status || "draft"} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-900 p-2">
                      <div className="text-slate-500">Items</div>
                      <div className="font-bold text-white">{order.total_items ?? order.items?.length ?? 0}</div>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-2">
                      <div className="text-slate-500">Total Qty</div>
                      <div className="font-bold text-white">{order.total_qty ?? 0}</div>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-2">
                      <div className="text-slate-500">Method</div>
                      <div className="font-bold text-white">{titleCase(order.submission_method || "manual")}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
                    <div>Created: {asDateLabel(order.created_at)}</div>
                    <div>Submission: {titleCase(order.submission_status || "draft")}</div>
                    {order.supplier_ordering_email && <div>Email: {order.supplier_ordering_email}</div>}
                    {order.supplier_portal_url && (
                      <div className="flex items-center gap-1">
                        Portal: <span className="truncate">{order.supplier_portal_url}</span>
                      </div>
                    )}
                  </div>

                  {Array.isArray(order.items) && order.items.length > 0 && (
                    <div className="mt-3 space-y-1 text-sm text-slate-300">
                      {order.items.slice(0, 5).map((item) => (
                        <div key={`${order.id}-${item.reorder_request_id || item.item_id}`} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            <span className="block truncate">{item.item_name}</span>
                            {productSubtitle(item) && (
                              <span className="block truncate text-xs text-teal-200">{productSubtitle(item)}</span>
                            )}
                          </span>
                          <span className="shrink-0 text-slate-400">x{item.approved_qty || item.requested_qty || 0}</span>
                        </div>
                      ))}
                      {order.items.length > 5 && <div className="text-xs text-slate-500">+ {order.items.length - 5} more</div>}
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => markReadyToSend(order)}
                      disabled={!['draft'].includes(order.status || 'draft') || busyOrderId === order.id}
                      className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40"
                    >
                      Ready
                    </button>

                    <button
                      type="button"
                      onClick={() => markSubmitted(order)}
                      disabled={!['draft', 'ready'].includes(order.status || 'draft') || busyOrderId === order.id}
                      className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-200 disabled:opacity-40"
                    >
                      Mark Submitted
                    </button>

                    <button
                      type="button"
                      onClick={() => markAwaitingDelivery(order)}
                      disabled={!['sent'].includes(order.status || '') || busyOrderId === order.id}
                      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200 disabled:opacity-40"
                    >
                      Awaiting Delivery
                    </button>

                    {order.supplier_portal_url ? (
                      <a
                        href={order.supplier_portal_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-slate-700 px-3 py-2 text-center text-sm font-semibold text-slate-200 hover:bg-slate-800"
                      >
                        <span className="inline-flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" /> Portal</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="rounded-xl border border-slate-800 px-3 py-2 text-sm font-semibold text-slate-500"
                      >
                        No Portal
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "deliveries" && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Deliveries</h2>
              <p className="text-sm text-slate-400">Orders awaiting receipt. Full goods receiving comes in the next build.</p>
            </div>
            <Truck className="h-5 w-5 text-amber-300" />
          </div>

          {poLoading ? (
            <p className="text-sm text-slate-400">Loading deliveries...</p>
          ) : deliveryOrders.length === 0 ? (
            <p className="text-sm text-slate-400">No purchase orders awaiting delivery.</p>
          ) : (
            <div className="space-y-3">
              {deliveryOrders.map((order) => (
                <div key={order.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{order.po_number || order.id}</div>
                      <div className="text-sm text-slate-400">{order.supplier_name || "No supplier"}</div>
                    </div>
                    <StatusPill status={order.status || "awaiting_delivery"} />
                  </div>

                  <div className="mt-3 text-sm text-slate-300">
                    {order.total_items || order.items?.length || 0} item{(order.total_items || order.items?.length || 0) === 1 ? "" : "s"} • Qty {order.total_qty || 0}
                  </div>

                  <button
                    type="button"
                    onClick={() => markCompleted(order)}
                    disabled={busyOrderId === order.id}
                    className="mt-4 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200 disabled:opacity-40"
                  >
                    Mark Delivery Complete
                  </button>

                  <p className="mt-2 text-xs text-slate-500">
                    This closes the purchase order only. Stock-updating goods receiving will be added in Build 0.9.6.
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "performance" && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">Supplier Performance</h2>
              <p className="text-sm text-slate-400">Early purchasing intelligence based on purchase orders.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-violet-300" />
          </div>

          <div className="mb-5 rounded-xl border border-teal-500/20 bg-teal-500/10 p-4">
            <div className="font-semibold text-teal-100">Integration-ready structure</div>
            <p className="mt-1 text-sm text-teal-50/80">
              Supplier records now support email, portal, CSV, API and EDI ordering methods. Purchase orders store submission method and external order reference fields ready for future supplier integrations.
            </p>
          </div>

          {supplierPerformance.length === 0 ? (
            <p className="text-sm text-slate-400">No supplier purchasing history yet.</p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {supplierPerformance.map((row) => (
                <div key={row.supplier_id || row.supplier_name} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-white">{row.supplier_name}</div>
                      <div className="text-sm text-slate-400">{row.total_orders} order{row.total_orders === 1 ? "" : "s"}</div>
                    </div>
                    <Building2 className="h-5 w-5 text-slate-400" />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-lg bg-slate-900 p-2">
                      <div className="text-slate-500">Open</div>
                      <div className="font-bold text-white">{row.open_orders}</div>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-2">
                      <div className="text-slate-500">Complete</div>
                      <div className="font-bold text-white">{row.completed_orders}</div>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-2">
                      <div className="text-slate-500">Qty</div>
                      <div className="font-bold text-white">{row.total_qty}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
