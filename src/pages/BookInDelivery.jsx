import { PackageCheck } from "lucide-react";
import DocumentIntakePanel from "@/components/documents/DocumentIntakePanel";

// Book in a delivery (Operations > Book in a delivery): drop a supplier's delivery note and Primovex reads it, matches it to the purchase order and to your stock, and shows every row for you to check.
// Nothing is added to stock until you have checked it and ticked that you have. For whoever books deliveries in.
export default function BookInDelivery() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><PackageCheck className="h-6 w-6 text-teal-300" aria-hidden="true" /> Book in a delivery</h1>
        <p className="max-w-3xl text-sm text-slate-400">Drop in the supplier's delivery note (a PDF, a photo or an email). Primovex reads it, finds the purchase order and your stock items, and shows each row with the words it came from. You check it, and only then is the stock added and the order ticked off. The original is kept as the record.</p>
      </div>
      <div className="max-w-4xl"><DocumentIntakePanel onlyKind="delivery" /></div>
    </div>
  );
}
