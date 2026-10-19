import { useState } from "react";
import { updatePassword } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

// The first time someone signs in with a temporary password (an account made with a sign-in name, or after a new temporary password was
// set), they choose their own before they can use Primovex.

const MIN = 10;

export default function MustChangePassword() {
  const { user, displayName } = useAuth();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const problem = password.length < MIN ? `Use at least ${MIN} characters.` : password !== again ? "The two passwords don't match." : /^[a-z]+$|^[0-9]+$/i.test(password) ? "Mix letters and numbers, or use a few words together." : "";

  async function save(event) {
    event.preventDefault();
    if (problem) return;
    setBusy(true); setError("");
    try {
      await updatePassword(auth.currentUser, password);
      await updateDoc(doc(db, "users", user.uid), { mustChangePassword: false });
    } catch (failure) {
      setError(failure?.code === "auth/requires-recent-login" ? "Please sign out and sign in again with your temporary password, then try again." : failure?.message || "That could not be saved. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--medtrak-bg)] p-4 text-[var(--medtrak-text)]">
      <form onSubmit={save} className="w-full max-w-md space-y-4 rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-6 shadow-xl">
        <div>
          <h1 className="text-2xl font-black">Choose your own password</h1>
          <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Hello{displayName ? `, ${String(displayName).split(" ")[0]}` : ""}. You signed in with a temporary password. Choose one only you know, then carry on.</p>
        </div>
        <label className="block text-sm font-bold">New password
          <input type="password" autoComplete="new-password" className="mt-1 min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 text-base" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm font-bold">Type it again
          <input type="password" autoComplete="new-password" className="mt-1 min-h-12 w-full rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] px-3 text-base" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        <p className="text-xs text-[var(--medtrak-muted)]">At least {MIN} characters. Three or four words you will remember work well, for example <i>blue-teapot-garden-7</i>. Don't tell anyone, and don't write it where others can see it.</p>
        {(password || again) && problem && <p className="text-sm font-semibold text-amber-700">{problem}</p>}
        {error && <p className="text-sm font-semibold text-rose-700" role="alert">{error}</p>}
        <button type="submit" disabled={busy || Boolean(problem)} className="min-h-12 w-full rounded-2xl bg-[var(--medtrak-accent)] font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Save my password"}</button>
      </form>
    </div>
  );
}
