// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ If RequireAuth redirected here, it stores the original path in state.from
  const redirectTo = location.state?.from || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim();

    if (!cleanEmail) return setError("Please enter your email.");
    if (!password) return setError("Please enter your password.");

    setSaving(true);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);

      // ✅ Go back to the page they originally requested
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err?.message || "Sign in failed.");
      console.error("Login error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <Card className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription className="text-slate-300/80">
            Use your email and password.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div className="text-xs text-slate-300 mb-1">Email</div>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@nhs.uk"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="text-xs text-slate-300 mb-1">Password</div>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••••"
                autoComplete="current-password"
              />

              <div className="mt-2 flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={saving}
              className="w-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30"
            >
              {saving ? "Signing in…" : "Sign in"}
            </Button>

            <div className="text-xs text-slate-400 text-center">
              Need an invite?{" "}
              <Link className="text-teal-300 hover:underline" to="/register">
                Register
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
