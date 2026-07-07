// src/pages/ForgotPassword.jsx
import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LoadingScreen from "@/components/ui/LoadingScreen";

export default function ForgotPassword() {
  const cardBase =
    "rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 shadow-sm backdrop-blur";

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const emailRef = useRef(null);

  const canSubmit = useMemo(() => {
    const e = String(email || "").trim();
    return e.includes("@") && e.includes(".");
  }, [email]);

  const normalizeFirebaseError = (err) => {
    const code = String(err?.code || "");
    if (code === "auth/invalid-email") return "That email address doesn’t look valid.";
    if (code === "auth/user-not-found") return "No account found with that email address.";
    if (code === "auth/too-many-requests")
      return "Too many attempts. Please wait a moment and try again.";
    return String(err?.message || err || "Something went wrong.");
  };

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;

    const trimmed = String(email || "").trim();
    if (!trimmed) {
      setMsg({ type: "error", text: "Enter your email address." });
      emailRef.current?.focus();
      return;
    }

    setBusy(true);
    setMsg(null);

    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, trimmed);

      // For security, we show a generic success message.
      setMsg({
        type: "ok",
        text:
          "If an account exists for that email, a password reset link has been sent. Check your inbox (and spam/junk).",
      });
    } catch (err) {
      setMsg({ type: "error", text: normalizeFirebaseError(err) });
    } finally {
      setBusy(false);
    }
  };

  // Optional: show full-page loader while sending
  if (busy && !msg) {
    return (
      <LoadingScreen
        title="Sending reset link"
        message="Please wait…"
        fullscreen
      />
    );
  }

  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center p-6">
      <Card className={`${cardBase} w-full max-w-md p-5`}>
        <div className="text-lg font-semibold text-slate-50">Reset password</div>
        <div className="text-sm text-slate-400 mt-1">
          Enter your email address and we’ll email you a reset link.
        </div>

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="text-xs text-slate-300">Email</label>
            <Input
              ref={emailRef}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@nhs.net"
              className="mt-1 bg-slate-950/40 border-slate-800/70 text-slate-100 placeholder:text-slate-500"
              autoComplete="email"
              inputMode="email"
              disabled={busy}
            />
          </div>

          {msg?.type === "error" && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
              {msg.text}
            </div>
          )}
          {msg?.type === "ok" && (
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              {msg.text}
            </div>
          )}

          <Button
            type="submit"
            disabled={busy || !canSubmit}
            className="w-full rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950"
          >
            Send reset link
          </Button>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <Link to="/login" className="hover:text-slate-200">
              Back to login
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
