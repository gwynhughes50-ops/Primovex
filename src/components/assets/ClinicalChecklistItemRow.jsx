import React from "react";

function Field({ label, children, help, className = "" }) {
  return (
    <div className={className}>
      <label className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--medtrak-muted)]">{label}</label>
      <div className="mt-2">{children}</div>
      {help && <p className="mt-2 text-xs leading-5 text-[color:var(--medtrak-muted)]">{help}</p>}
    </div>
  );
}

const controlClass = "min-h-11 w-full rounded-xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-3 py-2 text-sm text-[color:var(--medtrak-text)] outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-ring";

export default function ClinicalChecklistItemRow({
  item,
  result,
  status,
  statuses,
  statusLabel,
  statusClass,
  enableSections,
  stock,
  onChange,
}) {
  const quantityRequired = item.expectedQty !== null && item.expectedQty !== undefined;
  const batchRequired = Boolean(item.defaultBatch || item.stock_barcode || result.batch);
  const expiryRequired = Boolean(item.defaultExpiry || result.expiry);

  return (
    <article className="p-4 sm:p-5">
      <div className="rounded-2xl border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-panel-soft)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {enableSections && item.section && (
                <span className="rounded-full border border-[color:var(--medtrak-border)] bg-[color:var(--medtrak-bg)] px-2.5 py-1 text-xs font-medium text-[color:var(--medtrak-muted)]">{item.section}</span>
              )}
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
            </div>
            <h4 className="mt-3 text-base font-semibold leading-6 text-[color:var(--medtrak-text)]">{item.name}</h4>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[color:var(--medtrak-muted)]">
              {item.stock_barcode ? `Linked stock barcode: ${item.stock_barcode}` : "Kit component verified against this checklist; an individual barcode is not required."}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
          <Field label="Status" className="xl:col-span-3">
            <select className={controlClass} value={status} onChange={(event) => onChange({ status: event.target.value })}>
              {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>

          <Field label="Quantity" className="xl:col-span-2" help={!quantityRequired ? "Not required for this component." : null}>
            <input
              className={`${controlClass} ${!quantityRequired ? "opacity-65" : ""}`}
              value={result.qty || ""}
              onChange={(event) => onChange({ qty: event.target.value })}
              placeholder={quantityRequired ? String(item.expectedQty ?? "-") : "Not required"}
              disabled={!quantityRequired}
              inputMode="numeric"
            />
          </Field>

          <Field label="Batch / serial" className="sm:col-span-2 xl:col-span-4" help={!batchRequired ? "No batch or serial is required for this item." : null}>
            <input
              className={`${controlClass} ${!batchRequired ? "opacity-65" : ""}`}
              value={result.batch || ""}
              onChange={(event) => onChange({ batch: event.target.value })}
              placeholder={batchRequired ? "Enter batch or serial" : "Not required"}
              disabled={!batchRequired}
            />
          </Field>

          <Field
            label="Expiry"
            className="sm:col-span-2 xl:col-span-3"
            help={stock ? `Stock level ${stock.current_stock ?? "-"} / minimum ${stock.min_stock ?? 0}` : item.stock_barcode ? "Linked stock item not found." : !expiryRequired ? "No expiry is required for this component." : null}
          >
            <input
              type={expiryRequired ? "date" : "text"}
              className={`${controlClass} ${!expiryRequired ? "opacity-65" : ""}`}
              value={result.expiry || ""}
              onChange={(event) => onChange({ expiry: event.target.value })}
              placeholder={expiryRequired ? "YYYY-MM-DD" : "Not required"}
              disabled={!expiryRequired}
            />
          </Field>

          <Field label="Item notes" className="sm:col-span-2 xl:col-span-12">
            <textarea
              className={`${controlClass} min-h-[92px] resize-y`}
              placeholder="Replacement action, location note, reason for exception, or other relevant detail…"
              value={result.notes || ""}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </Field>
        </div>
      </div>
    </article>
  );
}
