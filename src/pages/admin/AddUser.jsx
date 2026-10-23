import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { featureOn } from "@/config/featureFlags";
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
  Copy,
  RotateCcw,
} from "lucide-react";
import { ROLE_TEMPLATES } from "@/core/identity/capabilities";
import { createUserAccount } from "@/services/adminUserService";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_HINTS = {
  "System Admin": "Full platform access, including user management and destructive actions.",
  "Practice Manager": "Operational management access across Primovex modules.",
  User: "Can view and edit stock for assigned sites.",
  Nurse: "Clinical mobile access — stock, temperature, compliance checks.",
  HCA: "Healthcare assistant mobile access.",
  Reception: featureOn("clinflow") ? "Front-desk access — ClinFlow intake, governance concerns." : "Front-desk access — governance concerns.",
  Caretaker: "Facilities access — spaces, compliance, temperature.",
  Cleaner: "The dedicated cleaning-only mobile screen — scan to start/finish, report issues.",
  Partner: "Read-only visibility across every governance record (concerns, SARs, complaints), no edit rights.",
  ReadOnly: "Can view stock and logs, cannot edit.",
};

const builtInRoles = Object.keys(ROLE_TEMPLATES).map((name) => ({
  value: name,
  label: name,
  hint: ROLE_HINTS[name] || `${name} capability template.`,
}));

import { signInNameProblem, suggestSignInName } from "@/lib/signInName";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export default function AddUser() {
  const navigate = useNavigate();
  const { customRoles } = useAuth();

  const roles = useMemo(
    () => [
      ...builtInRoles,
      ...customRoles.map((r) => ({
        value: r.name,
        label: r.name,
        hint: r.description || `${r.name} custom role.`,
      })),
    ],
    [customRoles]
  );

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    role: "User",
  });
  // someone with no email address signs in with a short name and a temporary password instead
  const [noEmail, setNoEmail] = useState(false);
  const [signInName, setSignInName] = useState("");
  const [signInTouched, setSignInTouched] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [made, setMade] = useState({ signInName: "" });

  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const roleMeta = useMemo(
    () => roles.find((r) => r.value === form.role) || roles[0],
    [form.role, roles]
  );

  const canSubmit = useMemo(() => {
    if (!form.displayName.trim()) return false;
    if (noEmail) return !signInNameProblem(signInName);
    if (!isValidEmail(form.email)) return false;
    return true;
  }, [form.displayName, form.email, noEmail, signInName]);

  const update = (key) => (e) => {
    const value = e.target.value;
    setForm((p) => ({ ...p, [key]: value }));
    if (key === "displayName" && noEmail && !signInTouched) setSignInName(suggestSignInName(value));
    setError("");
  };

  const resetForm = () => {
    setForm({ displayName: "", email: "", role: "User" });
    setStatus("idle");
    setError("");
    setInviteLink("");
    setLinkCopied(false);
    setNoEmail(false);
    setSignInName("");
    setSignInTouched(false);
    setTempPassword("");
    setMade({ signInName: "" });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.displayName.trim()) {
      setError("Please enter a display name.");
      return;
    }
    if (noEmail) {
      const problem = signInNameProblem(signInName);
      if (problem) { setError(problem); return; }
    } else if (!isValidEmail(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setStatus("sending");
      const result = await createUserAccount({
        displayName: form.displayName.trim(),
        email: noEmail ? "" : form.email.trim(),
        signInName: noEmail ? signInName.trim().toLowerCase() : undefined,
        role: form.role,
      });
      setInviteLink(result?.inviteLink || "");
      setTempPassword(result?.temporaryPassword || "");
      setMade({ signInName: result?.signInName || "" });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err?.message || "Something went wrong creating the account. Try again.");
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword || inviteLink);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("Could not copy the link — copy it manually.");
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

              <label className="flex items-start gap-2 rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 text-sm text-slate-200">
                <input type="checkbox" className="mt-1" checked={noEmail} onChange={(e) => { setNoEmail(e.target.checked); setSignInName(e.target.checked ? suggestSignInName(form.displayName) : ""); setSignInTouched(false); setError(""); }} />
                <span><b>This person has no email address</b><span className="block text-xs text-slate-400">They sign in with a short sign-in name and a temporary password that you give them. They choose their own password the first time.</span></span>
              </label>

              {noEmail ? (
                <div>
                  <label className="text-xs text-slate-300">Sign-in name</label>
                  <Input
                    value={signInName}
                    onChange={(e) => { setSignInName(e.target.value.toLowerCase()); setSignInTouched(true); setError(""); }}
                    placeholder="e.g. cherryl.blair"
                    autoCapitalize="none"
                    className="mt-1 bg-slate-950/40 border-slate-800/70 text-slate-100 placeholder:text-slate-500"
                  />
                  {signInName.trim().length > 0 && signInNameProblem(signInName) && <div className="mt-1 text-xs text-amber-200">{signInNameProblem(signInName)}</div>}
                </div>
              ) : (
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
              )}

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

                {form.role === "System Admin" && (
                  <div className="mt-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                    <strong>System Admin access:</strong> grants full control including user
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
                  onClick={() => navigate("/admin/users")}
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
                  {status === "sending" ? "Creating account…" : "Create account"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-200 mt-0.5" />
                  <div>
                    <div className="font-semibold text-emerald-50">Account created</div>
                    <div className="text-sm text-emerald-100/80">
                      {tempPassword ? (<><span className="font-medium text-emerald-50">{form.displayName}</span> now exists as {form.role}. Give them the sign-in name and temporary password below, in person. The password is shown only now.</>) : (<><span className="font-medium text-emerald-50">{form.email}</span> now exists as {form.role}. There's no email sending set up yet, so send this password-set link to them yourself.</>)}
                    </div>
                  </div>
                </div>
              </div>

              {tempPassword && (
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3 space-y-2">
                  <div><div className="text-xs text-slate-400">Sign-in name</div><code className="text-base text-slate-50">{made.signInName}</code></div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1"><div className="text-xs text-slate-400">Temporary password</div><code className="text-lg tracking-wider text-slate-50">{tempPassword}</code></div>
                    <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60 shrink-0" onClick={copyInviteLink}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> {linkCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-xs text-amber-100">Write it down or tell them now: it can't be shown again (you can set a new temporary password later from Users). They will be asked to choose their own password when they first sign in.</div>
                </div>
              )}

              {inviteLink && (
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/40 p-3">
                  <div className="text-xs text-slate-400 mb-1">Password-set link</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate text-xs text-slate-200">{inviteLink}</code>
                    <Button type="button" size="sm" variant="outline" className="rounded-full border-slate-700/70 bg-slate-900/40 text-slate-200 hover:bg-slate-900/60 shrink-0" onClick={copyInviteLink}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> {linkCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  className="rounded-full px-4"
                  onClick={() => navigate("/admin/users")}
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

