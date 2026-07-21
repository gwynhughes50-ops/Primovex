// src/pages/Register.jsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

import { auth, db } from "../lib/firebase";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Register() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteId = params.get("invite");

  const [loading, setLoading] = useState(true);

  const [invite, setInvite] = useState(null);

  // ✅ Split errors
  const [inviteError, setInviteError] = useState("");
  const [formError, setFormError] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  // -----------------------------
  // Load invite
  // -----------------------------
  useEffect(() => {
    let active = true;

    async function loadInvite() {
      setInviteError("");
      setFormError("");

      try {
        if (!inviteId) {
          throw new Error("Invalid or missing invite link. Please use the invite URL your admin sent you.");
        }

        const ref = doc(db, "invites", inviteId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          throw new Error("Invite not found.");
        }

        const data = snap.data();

        if (data.used) {
          throw new Error("This invite has already been used.");
        }

        if (data.expiresAt?.toDate && data.expiresAt.toDate() < new Date()) {
          throw new Error("This invite has expired.");
        }

        // Hard-lock roles (client-side)
        const role = data.role === "ReadOnly" ? "ReadOnly" : "User";

        if (active) {
          setInvite({
            id: snap.id,
            email: data.email,
            displayName: data.displayName || "",
            role,
          });
        }
      } catch (e) {
        if (active) setInviteError(e?.message || "Failed to load invite.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadInvite();
    return () => {
      active = false;
    };
  }, [inviteId]);

  // -----------------------------
  // Create account
  // -----------------------------
  async function handleRegister(e) {
    e?.preventDefault?.();
    setFormError("");

    if (!invite?.email) return setFormError("Invite email missing.");
    if (password.length < 10) return setFormError("Password must be at least 10 characters.");
    if (password !== confirm) return setFormError("Passwords do not match.");

    setSaving(true);

    try {
      // Ensure clean auth state
      if (auth.currentUser) {
        await signOut(auth);
      }

      // 1) Create Auth user (this signs the user in)
      const cred = await createUserWithEmailAndPassword(auth, invite.email, password);

      // 2) Create Firestore profile
      await setDoc(doc(db, "users", cred.user.uid), {
        email: invite.email,
        displayName: invite.displayName || invite.email,
        role: invite.role, // User / ReadOnly only
        createdAt: serverTimestamp(),
      });

      // 3) Mark invite used
      await updateDoc(doc(db, "invites", invite.id), {
        used: true,
        usedAt: serverTimestamp(),
        usedByUid: cred.user.uid,
      });

      navigate("/dashboard", { replace: true });
    } catch (e) {
      console.error("Register error:", e);
      setFormError(e?.message || "Registration failed.");
    } finally {
      setSaving(false);
    }
  }

  // -----------------------------
  // UI
  // -----------------------------
  if (loading) {
    return <div className="p-8 text-slate-100">Loading invite…</div>;
  }

  if (inviteError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <Card className="w-full max-w-lg rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
          <CardHeader>
            <CardTitle>Invite problem</CardTitle>
            <CardDescription className="text-slate-300/80">{inviteError}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => navigate("/login")}>
              Back to login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <Card className="w-full max-w-lg rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
        <CardHeader>
          <CardTitle>Create account</CardTitle>
          <CardDescription className="text-slate-300/80">
            You’re creating an account using an invite.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="text-sm text-slate-300 space-y-1 mb-4">
            <div>
              <span className="text-slate-400">Email:</span>{" "}
              <span className="text-slate-100 font-medium">{invite.email}</span>
            </div>
            <div>
              <span className="text-slate-400">Role:</span>{" "}
              <span className="text-slate-100 font-medium">{invite.role}</span>
            </div>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <div className="text-xs text-slate-300 mb-1">Password</div>
              <Input
                type="password"
                placeholder="Password (min 10 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div>
              <div className="text-xs text-slate-300 mb-1">Confirm password</div>
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate("/login")}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
              >
                {saving ? "Creating…" : "Create account"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
