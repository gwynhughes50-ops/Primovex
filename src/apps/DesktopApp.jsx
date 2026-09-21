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
import ForgotPassword from "@/pages/ForgotPassword";
import RequireAuth from "@/routes/RequireAuth";
import PermissionGate from "@/components/security/PermissionGate";
import FirstRunSetupGate from "@/setup/FirstRunSetupGate";
import DesktopSessionShell from "@/desktop/DesktopSessionShell";
import DesktopAlertsHost from "@/desktop/alerts/DesktopAlertsHost";

export default function DesktopApp() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
              <DesktopSessionShell>
                <Layout />
                <DesktopAlertsHost />
              </DesktopSessionShell>
            </FirstRunSetupGate>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="inventory" element={<PermissionGate capability="inventory.read"><Inventory /></PermissionGate>} />
        <Route path="reorder-centre" element={<ReorderCentre />} />
        <Route path="purchasing" element={<Purchasing />} />
        <Route path="suppliers" element={<SupplierDirectory />} />
        <Route path="practice-admin" element={<PermissionGate capability="practiceAdmin.read"><PracticeAdministration /></PermissionGate>} />
        <Route path="governance/concerns" element={<PermissionGate capability="governance.read"><GovernanceConcerns /></PermissionGate>} />
        <Route path="governance/sars" element={<PermissionGate capability="governance.read"><GovernanceSARs /></PermissionGate>} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="connect" element={<PermissionGate capability="connect.view"><Connect /></PermissionGate>} />
        <Route path="theme-lab" element={<ThemeLab />} />
        <Route path="security-centre" element={<SecurityCentre />} />
        <Route path="facilities" element={<PermissionGate capability="operations.read"><Facilities /></PermissionGate>} />
        <Route path="spaces" element={<PermissionGate capability="operations.read"><Spaces /></PermissionGate>} />
        <Route path="temperature" element={<PermissionGate capability="temperature.read"><TemperatureLog /></PermissionGate>} />
        <Route path="compliance" element={<PermissionGate capability="compliance.read"><Compliance /></PermissionGate>} />
        <Route path="admin/*" element={<PermissionGate capability="admin.access"><AdminDashboard /></PermissionGate>} />
        <Route path="reports" element={<PermissionGate capability="reports.read"><Reports /></PermissionGate>} />
        <Route path="clinflow" element={<PermissionGate capability="clinflow.read"><ClinFlowWorkspace /></PermissionGate>} />
        <Route path="help" element={<Help />} />
        <Route path="developer-centre" element={<DeveloperCentre />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
