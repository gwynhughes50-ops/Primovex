import { GraduationCap } from "lucide-react";
import MyTraining from "@/modules/training/MyTraining";

// My training (Operations > My training): a person's own training record on the desktop, the same list the phone shows under
// Me. It reads only their own record, so it is open to everyone; the whole practice's record stays under Staff training.

export default function MyTrainingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><GraduationCap className="h-6 w-6 text-teal-300" aria-hidden="true" /> My training</h1>
        <p className="max-w-3xl text-sm text-slate-400">What you have done, what runs out soon and what is overdue. This is only your own record; nobody else's is shown here.</p>
      </div>
      <div className="max-w-3xl rounded-2xl border border-white/10 bg-slate-900/50 p-4">
        <MyTraining />
      </div>
    </div>
  );
}
