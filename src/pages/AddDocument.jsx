import { FilePlus2 } from "lucide-react";
import DocumentIntakePanel from "@/components/documents/DocumentIntakePanel";

// Add a document (Operations > Add a document): drop a certificate or a COSHH safety data sheet and the register's form opens already filled in from it, for you to check and save.
export default function AddDocument() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><FilePlus2 className="h-6 w-6 text-teal-300" aria-hidden="true" /> Add a document</h1>
        <p className="max-w-3xl text-sm text-slate-400">Drop in a certificate, test or service record, or a COSHH safety data sheet. Primovex reads it and fills in the form, showing you the words it took each answer from. You check it, and only then is it saved. The original is kept as the record.</p>
      </div>
      <div className="max-w-4xl"><DocumentIntakePanel /></div>
    </div>
  );
}
