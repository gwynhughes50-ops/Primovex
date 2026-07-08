import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function AccessDenied({ title = "Access restricted", message = "You do not currently have permission to view this area." }) {
  return (
    <Card className="rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6 text-amber-50">
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-amber-100/90">{message}</p>
        </div>
      </div>
    </Card>
  );
}
