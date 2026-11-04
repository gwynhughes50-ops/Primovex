import { Laptop } from "lucide-react";
import MyLaptopPanel from "@/components/laptops/MyLaptopPanel";

export default function MyLaptop() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-50"><Laptop className="h-6 w-6 text-teal-300" aria-hidden="true" /> My laptop</h1>
        <p className="max-w-3xl text-sm text-slate-400">The laptop assigned or lent to you, and when it is due an update or back.</p>
      </div>
      <MyLaptopPanel />
    </div>
  );
}
