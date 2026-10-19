// src/routes/RequireAuth.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import LoadingScreen from "@/components/ui/LoadingScreen";
import MustChangePassword from "@/auth/MustChangePassword";

export default function RequireAuth({ children }) {
  const { user, loading, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <LoadingScreen
        title="Signing you in"
        message="Checking your session and permissions…"
        fullscreen
      />
    );
  }

  if (!user) {
    // ✅ Preserve full path including query params
    const fullPath = location.pathname + location.search;

    return <Navigate to="/login" replace state={{ from: fullPath }} />;
  }

  // signed in with a temporary password: choose their own before anything else
  if (profile?.mustChangePassword === true) return <MustChangePassword />;

  return children;
}

