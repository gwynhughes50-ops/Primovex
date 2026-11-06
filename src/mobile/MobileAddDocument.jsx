import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import DocumentIntakePanel from "@/components/documents/DocumentIntakePanel";

// The phone's Add a document: take a photo of a certificate or safety data sheet (or choose a file) and check what was read before it is saved.
export default function MobileAddDocument() {
  const navigate = useNavigate();
  return (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <button type="button" onClick={() => navigate("/", { replace: true })} className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm font-semibold"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back</button>
      <h1 className="text-xl font-black">Add a document</h1>
      <div className="rounded-2xl bg-slate-900 p-3"><DocumentIntakePanel phone /></div>
    </main>
  );
}
