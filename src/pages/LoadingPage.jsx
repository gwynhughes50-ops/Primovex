import React from "react";
import LoadingScreen from "@/components/ui/LoadingScreen";

export default function LoadingPage() {
  return (
    <LoadingScreen
      title="Preparing Aurora Stock Control"
      message="Starting up and syncing live data…"
      fullscreen
    />
  );
}
