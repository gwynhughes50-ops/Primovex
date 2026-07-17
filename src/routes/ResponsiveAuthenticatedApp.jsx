import { useEffect, useState } from "react";
import { platform } from "@tauri-apps/plugin-os";

import Layout from "@/layout/Layout";
import MobileLayout from "@/mobile/MobileLayout";

const MOBILE_QUERY =
  "(max-width: 767px), (pointer: coarse) and (max-width: 1024px)";

function detectMobileMode() {
  const userAgentMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const responsiveMobile =
    window.matchMedia(MOBILE_QUERY).matches;

  let nativeMobile = false;

  try {
    const currentPlatform = platform();

    nativeMobile =
      currentPlatform === "android" ||
      currentPlatform === "ios";

    console.log("Primovex native platform:", currentPlatform);
  } catch (error) {
    console.warn("Could not detect native platform:", error);
  }

  console.log("Primovex mobile detection:", {
    nativeMobile,
    userAgentMobile,
    responsiveMobile,
    userAgent: navigator.userAgent,
  });

  return nativeMobile || userAgentMobile || responsiveMobile;
}

export default function ResponsiveAuthenticatedApp() {
  const [mobile, setMobile] = useState(() => detectMobileMode());

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);

    const updateMode = () => {
      setMobile(detectMobileMode());
    };

    media.addEventListener?.("change", updateMode);
    window.addEventListener("resize", updateMode);

    return () => {
      media.removeEventListener?.("change", updateMode);
      window.removeEventListener("resize", updateMode);
    };
  }, []);

  return mobile ? <MobileLayout /> : <Layout />;
}