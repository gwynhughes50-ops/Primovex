// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import Layout from "./layout/Layout";

import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Alerts from "./pages/Alerts";
import TemperatureLog from "./pages/TemperatureLog";
import AdminDashboard from "./pages/AdminDashboard";
import Reports from "./pages/Reports";
import Compliance from "./pages/Compliance";
import Notifications from "./pages/Notifications";
import ReorderCentre from "@/pages/ReorderCentre";
import SupplierDirectory from "@/pages/SupplierDirectory";
import Purchasing from "@/pages/Purchasing";
import PracticeAdministration from "@/pages/PracticeAdministration";
import GovernanceSARs from "@/pages/GovernanceSARs";
import GovernanceConcerns from "@/pages/GovernanceConcerns";
import Connect from "@/pages/Connect";
import ThemeLab from "@/pages/ThemeLab";
import DemoMode from "@/pages/DemoMode";
import SecurityCentre from "@/pages/SecurityCentre";
import Facilities from "@/pages/Facilities";
import MobileLayout from "./mobile/MobileLayout";

import Help from "./pages/Help";
import LoadingPage from "./pages/LoadingPage";

import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";

import { AuthProvider } from "./contexts/AuthContext.jsx";
import RequireAuth from "./routes/RequireAuth.jsx";
import { MedTrakThemeProvider } from "./components/theme/MedTrakThemeProvider";
import PermissionGate from "@/components/security/PermissionGate";
import { PrimovexAIProvider } from "@/ai/context/PrimovexAIContext";

function AppRouter() {
  return (
    <Routes>
      {/* PUBLIC */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/demo" element={<DemoMode />} />
      <Route path="/loading" element={<LoadingPage />} />

      {/* PRIVATE MOBILE APP */}
      <Route
        path="/mobile"
        element={
          <RequireAuth>
            <MobileLayout />
          </RequireAuth>
        }
      />

      {/* PRIVATE DESKTOP APP */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="reorder-centre" element={<ReorderCentre />} />
        <Route path="purchasing" element={<Purchasing />} />
        <Route path="suppliers" element={<SupplierDirectory />} />
        <Route path="practice-admin" element={<PermissionGate capability="practiceAdmin.read"><PracticeAdministration /></PermissionGate>} />
        <Route path="governance/concerns" element={<GovernanceConcerns />} />
        <Route path="governance/sars" element={<GovernanceSARs />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="connect" element={<Connect />} />
        <Route path="theme-lab" element={<ThemeLab />} />
        <Route path="security-centre" element={<SecurityCentre />} />
        <Route path="facilities" element={<Facilities />} />
        <Route path="temperature" element={<TemperatureLog />} />
        <Route path="compliance" element={<Compliance />} />
        <Route path="admin/*" element={<AdminDashboard />} />
        <Route path="reports" element={<Reports />} />
        <Route path="help" element={<Help />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      {/* FALLBACK */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MedTrakThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <PrimovexAIProvider>
            <AppRouter />
          </PrimovexAIProvider>
        </AuthProvider>
      </BrowserRouter>
    </MedTrakThemeProvider>
  </React.StrictMode>
);