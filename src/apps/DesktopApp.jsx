import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "@/layout/Layout";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import Alerts from "@/pages/Alerts";
import TemperatureLog from "@/pages/TemperatureLog";
import AdminDashboard from "@/pages/AdminDashboard";
import Reports from "@/pages/Reports";
import Compliance from "@/pages/Compliance";
import Notifications from "@/pages/Notifications";
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
import Spaces from "@/pages/Spaces";
import SenseNfcOpen from "@/pages/SenseNfcOpen";
import Help from "@/pages/Help";
import DeveloperCentre from "@/pages/DeveloperCentre";
import DeveloperMobilePreview from "@/developer/DeveloperMobilePreview";
import LoadingPage from "@/pages/LoadingPage";
import ClinFlowWorkspace from "@/modules/clinflow/ClinFlowWorkspace";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import RequireAuth from "@/routes/RequireAuth";
import PermissionGate from "@/components/security/PermissionGate";
import FirstRunSetupGate from "@/setup/FirstRunSetupGate";

export default function DesktopApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/demo" element={<DemoMode />} />
      <Route path="/loading" element={<LoadingPage />} />

      <Route
        path="/sense/open/:entityType/:entityId"
        element={
          <RequireAuth>
            <SenseNfcOpen />
          </RequireAuth>
        }
      />

      <Route path="/setup" element={<RequireAuth><FirstRunSetupGate forceOpen><div /></FirstRunSetupGate></RequireAuth>} />

      <Route path="/developer-mobile-preview" element={<RequireAuth><DeveloperMobilePreview /></RequireAuth>} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <FirstRunSetupGate>
              <Layout />
            </FirstRunSetupGate>
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
        <Route path="spaces" element={<Spaces />} />
        <Route path="temperature" element={<TemperatureLog />} />
        <Route path="compliance" element={<Compliance />} />
        <Route path="admin/*" element={<AdminDashboard />} />
        <Route path="reports" element={<Reports />} />
        <Route path="clinflow" element={<PermissionGate capability="clinflow.read"><ClinFlowWorkspace /></PermissionGate>} />
        <Route path="help" element={<Help />} />
        <Route path="developer-centre" element={<DeveloperCentre />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
