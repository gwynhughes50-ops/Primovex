import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  UserPlus,
  Shield,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";

const roles = [
  { value: "User", label: "User", hint: "Can view and edit stock for assigned sites." },
  { value: "ReadOnly", label: "Read-only", hint: "Can view stock and logs, cannot edit." },
  { value: "Admin", label: "Admin", hint: "Full access, including user management." },
];

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export default function AddUser() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    role: "User",
  });

  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const roleMeta = useMemo(
    () => roles.find((r) => r.value === form.role) || roles[0],
    [form.role]
  );

  const canSubmit = useMemo(() => {
    if (!form.displayName.trim()) return false;
    if (!isValidEmail(form.email)) return false;
    return true;
  }, [form.displayName, form.email]);

  const update = (key) => (e) => {
    setForm((p) => ({ ...p, [key]: e.target.value }));
    setError("");
  };

  const resetForm = () => {
    setForm({ displayName: "", email: "", role: "User" });
    setStatus("idle");
    setError("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.displayName.trim()) {
      setError("Please enter a display name.");
      return;
    }
    if (!isValidEmail(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setStatus("sending");

      // Demo delay. Replace with real API call later.
      await new Promise((r) => setTimeout(r, 700));

      setStatus("sent");
    } catch {
      setStatus("error");
      setError("Something went wrong sending the invite. Try again.");
    }
  };

  return (
    <div className="mt-6 max-w-2xl">
      <Card className="rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 shadow-sm backdrop-blur">
        <CardHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-slate-50">
                <UserPlus className="h-5 w-5 text-teal-300" />
                Add user
              </CardTitle>
              <CardDescription className="text-slate-300/80">
                Create an account and send an invite link to set a password.
              </CardDescription>
            </div>

            <Badge className="bg-teal-500/15 text-teal-200 hover:bg-teal-500/15">
              Admin only
            </Badge>
          </div>

          <div className="rounded-xl bg-slate-950/40 border border-slate-800/70 p-3 text-xs text-slate-300 flex gap-2">
            <Shield className="h-4 w-4 text-amber-200 mt-0.5" />
            <div className="leading-5">
              Admin accounts can only be created by existing Admins. Users cannot
              request Admin access.
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {status !== "sent" ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-300">Display name</label>
                <Input
                  value={form.displayName}
                  onChange={update("displayName")}
                  placeholder="e.g. Gwyn Hughes"
                  className="mt-1 bg-slate-950/40 border-slate-800/70 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300">Email address</label>
                <div className="relative mt-1">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={form.email}
                    onChange={update("email")}
                    placeholder="name@organisation.nhs.uk"
                    className="pl-9 bg-slate-950/40 border-slate-800/70 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                {!isValidEmail(form.email) && form.email.trim().length > 0 && (
                  <div className="mt-1 text-xs text-amber-200">
                    That email doesn’t look valid.
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-300">Role</label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, role: e.target.value }))
                  }
                  className="mt-1 h-10 w-full rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 text-sm text-slate-100"
                >
                  {roles.map((r) => (
                    <option key={r.value} value={r.value} className="bg-slate-950">
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-slate-400">{roleMeta.hint}</div>

                {form.role === "Admin" && (
                  <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                    <strong>Admin access:</strong> grants full control including user
                    management and destructive actions. Assign only if necessary.
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-100">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full px-4"
                  onClick={() => navigate("/reports/users")}
                  disabled={status === "sending"}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Cancel
                </Button>

                <Button
                  type="submit"
                  className="rounded-full"
                  disabled={!canSubmit || status === "sending"}
                >
                  {status === "sending" ? "Sending invite…" : "Send invite"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-200 mt-0.5" />
                  <div>
                    <div className="font-semibold text-emerald-50">Invite sent</div>
                    <div className="text-sm text-emerald-100/80">
                      An invitation link would be emailed to{" "}
                      <span className="font-medium text-emerald-50">{form.email}</span>.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  className="rounded-full px-4"
                  onClick={() => navigate("/reports/users")}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to users
                </Button>

                <Button
                  variant="secondary"
                  className="rounded-full"
                  onClick={resetForm}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Add another
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

