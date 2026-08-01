import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";

import DesktopApp from "@/apps/DesktopApp";
import MobileApp from "@/apps/MobileApp";
import { AuthProvider } from "@/contexts/AuthContext";
import { MedTrakThemeProvider } from "@/components/theme/MedTrakThemeProvider";
import { PrimovexAIProvider } from "@/ai/context/PrimovexAIContext";
import { SessionProvider } from "@/contexts/SessionContext";
import { SenseSessionProvider } from "@/contexts/SenseSessionContext";
import SpaceRegistrySync from "@/modules/sense/components/SpaceRegistrySync";
import DeepLinkNavigator from "@/routes/DeepLinkNavigator";

const isAndroidRuntime = /Android/i.test(navigator.userAgent) && Boolean(window.__TAURI_INTERNALS__);
const isAndroidBuild = import.meta.env.MODE === "android";
const isSenseDeepLink = /^\/sense\/open\/(?:space|asset)\//i.test(window.location.pathname);
const isMobileBrowser =
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || window.matchMedia("(max-width: 767px), (pointer: coarse) and (max-width: 1024px)").matches;
// A physical NFC/QR link is always an operational mobile journey. Force the
// mobile shell even when the browser has "Desktop site" enabled or presents a
// desktop user agent.
const useMobileApplication = isAndroidBuild || isAndroidRuntime || isMobileBrowser || isSenseDeepLink;
const Application = useMobileApplication ? MobileApp : DesktopApp;

document.documentElement.dataset.primovexClient = isAndroidBuild || isAndroidRuntime
  ? "android"
  : isMobileBrowser || isSenseDeepLink
    ? "mobile-web"
    : "desktop";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <DeepLinkNavigator />
      <AuthProvider>
        <SpaceRegistrySync />
        <SessionProvider>
          <SenseSessionProvider>
            <MedTrakThemeProvider>
              <PrimovexAIProvider>
                <Application />
              </PrimovexAIProvider>
            </MedTrakThemeProvider>
          </SenseSessionProvider>
        </SessionProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
