import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { VEHICLES, cleanRateChange, dateKey, describeTiers, rateChanges, rateProblem, ratesOn } from "./mileage";
import { removeRateChange, saveRateChange, usePlaces } from "./mileageService";

const uk = (key) => String(key || "").split("-").reverse().join("/");
const blank = () => ({ from: "", carFirst: "", carAfter: "", carThreshold: "10000", motorcycle: "", bicycle: "" });

// What the practice pays a mile, in Practice Administration. Everyone with access sees the rates; whoever manages timesheets (or the System Admin) can
// schedule a change from a date. A claim is priced at the rate on the day of the journey, so a change never re-prices claims already made.
export default function MileageRatesPanel({ canEdit }) {
  const { rates, ready } = usePlaces(true);
  const today = dateKey(new Date());
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const now = useMemo(() => ratesOn(rates, today), [rates, today]);
  const changes = useMemo(() => rateChanges(rates), [rates]);
  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setDone(""); };

  // start the form from the rates in force, so only what is changing needs typing
  const fillFromNow = () => {
    const tiers = now.car.tiers;
    setForm({ from: form.from, carFirst: String(tiers[0].pence), carAfter: tiers.length > 1 ? String(tiers[1].pence) : "", carThreshold: String(tiers[0].upTo || 10000), motorcycle: String(now.motorcycle.tiers[0].pence), bicycle: String(now.bicycle.tiers[0].pence) });
  };

  const submit = async () => {
    const problem = rateProblem(form, { today });
    if (problem) { setError(problem); return; }
    setBusy(true); setError(""); setDone("");
    try {
      await saveRateChange(cleanRateChange(form), rates);
      setDone(`Saved. The new rates apply to journeys from ${uk(form.from)}.`);
      setForm(blank());
    } catch (e) { setError(e?.message || "That could not be saved."); }
    setBusy(false);
  };

  const remove = async (from) => {
    setBusy(true); setError(""); setDone("");
    try { await removeRateChange(from, rates); setDone("The planned change has been taken out."); } catch (e) { setError(e?.message || "That could not be removed."); }
    setBusy(false);
  };

  return (
    <Card className="rounded-2xl mt-card border p-4 mt-text-primary">
      <h2 className="mb-1 text-lg font-bold mt-text-primary">Mileage rates</h2>
      <p className="mb-4 text-sm leading-6 mt-text-secondary">
        What the practice pays for each mile. A claim is worked out at the rate in force on the day of the journey, so changing the rate later never alters claims already made.
        Until you set your own, the HMRC approved rates are used.
      </p>

      <div className="mb-4 rounded-xl mt-card-strong border p-4">
        <div className="mb-2 font-bold mt-text-primary">Paying now{ready ? "" : " (loading)"}</div>
        <ul className="space-y-1 text-sm mt-text-secondary">
          {VEHICLES.map((v) => <li key={v.key}><span className="font-semibold mt-text-primary">{v.label}:</span> {describeTiers(now[v.key].tiers)}</li>)}
        </ul>
      </div>

      <div className="mb-4">
        <div className="mb-2 font-bold mt-text-primary">Changes from a date</div>
        {changes.length === 0 ? <p className="text-sm mt-text-secondary">No changes planned or made: the rates above have always applied.</p> : (
          <ul className="space-y-2">
            {changes.map((c) => (
              <li key={c.from} className="rounded-xl mt-card-strong border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold mt-text-primary">From {uk(c.from)} {c.from <= today ? "(in force)" : "(planned)"}</div>
                    <ul className="mt-text-secondary">{VEHICLES.filter((v) => c[v.key]?.tiers?.length).map((v) => <li key={v.key}>{v.label}: {describeTiers(c[v.key].tiers)}</li>)}</ul>
                  </div>
                  {canEdit && c.from > today ? <Button variant="outline" disabled={busy} onClick={() => remove(c.from)}>Take out</Button> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit ? (
        <div className="rounded-xl mt-card-strong border p-4">
          <div className="mb-1 font-bold mt-text-primary">Set new rates</div>
          <p className="mb-3 text-sm mt-text-secondary">Choose the first day they apply, then the pence a mile. Dates before today are not allowed, so claims already made keep their rate.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Applies from
              <Input type="date" value={form.from} min={today} onChange={set("from")} />
            </label>
            <div className="flex items-end"><Button variant="outline" onClick={fillFromNow}>Start from today's rates</Button></div>
            <label className="text-sm">Car or van, pence a mile
              <Input inputMode="decimal" value={form.carFirst} onChange={set("carFirst")} placeholder="e.g. 45" />
            </label>
            <label className="text-sm">Car or van after the threshold, pence (leave blank for the same rate throughout)
              <Input inputMode="decimal" value={form.carAfter} onChange={set("carAfter")} placeholder="e.g. 25" />
            </label>
            {form.carAfter.trim() !== "" ? (
              <label className="text-sm">Miles in a tax year paid at the first car rate
                <Input inputMode="numeric" value={form.carThreshold} onChange={set("carThreshold")} />
              </label>
            ) : null}
            <label className="text-sm">Motorcycle, pence a mile
              <Input inputMode="decimal" value={form.motorcycle} onChange={set("motorcycle")} placeholder="e.g. 24" />
            </label>
            <label className="text-sm">Bicycle, pence a mile
              <Input inputMode="decimal" value={form.bicycle} onChange={set("bicycle")} placeholder="e.g. 20" />
            </label>
          </div>
          {error ? <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{error}</p> : null}
          {done ? <p className="mt-3 text-sm font-semibold text-emerald-700" role="status">{done}</p> : null}
          <div className="mt-3"><Button disabled={busy} onClick={submit}>{busy ? "Saving..." : "Save the new rates"}</Button></div>
        </div>
      ) : <p className="text-sm mt-text-secondary">Only the System Admin or whoever manages timesheets can change the rates.</p>}
      {canEdit ? null : error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </Card>
  );
}
