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

const isAndroidBuild = import.meta.env.MODE === "android";
const Application = isAndroidBuild ? MobileApp : DesktopApp;

document.documentElement.dataset.primovexClient = isAndroidBuild ? "android" : "desktop";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
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
