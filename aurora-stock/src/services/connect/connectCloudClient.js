import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

function friendlyFunctionError(error, fallback = "MedTrak Connect Cloud is not available yet.") {
  const message = error?.message || fallback;
  if (message.includes("not-found") || message.includes("NOT_FOUND")) {
    return "Connect Cloud functions are not deployed yet. Simulator mode remains available.";
  }
  if (message.includes("unauthenticated")) {
    return "Sign in is required before Connect Cloud can be used.";
  }
  return message;
}

export async function getConnectCloudHealth({ providerId = "simulator", settings = {} } = {}) {
  try {
    const callable = httpsCallable(functions, "connectCloudHealth");
    const response = await callable({ providerId, settings });
    return {
      ok: true,
      data: response.data,
      message: response.data?.providerHealth?.message || "Connect Cloud healthy.",
    };
  } catch (error) {
    return {
      ok: false,
      error,
      message: friendlyFunctionError(error),
      data: {
        status: "not-deployed",
        service: "MedTrak Connect Cloud",
        provider: providerId,
      },
    };
  }
}

export async function syncConnectProvider({ providerId = "simulator", settings = {} } = {}) {
  try {
    const callable = httpsCallable(functions, "syncConnectProvider");
    const response = await callable({ providerId, settings });
    return {
      ok: true,
      data: response.data,
      message: `${response.data?.deviceCount || 0} device${response.data?.deviceCount === 1 ? "" : "s"} synced.`,
    };
  } catch (error) {
    return {
      ok: false,
      error,
      message: friendlyFunctionError(error, "Unable to sync Connect provider."),
    };
  }
}

export async function ingestConnectReading({ reading } = {}) {
  try {
    const callable = httpsCallable(functions, "ingestConnectReading");
    const response = await callable({ reading });
    return { ok: true, data: response.data };
  } catch (error) {
    return { ok: false, error, message: friendlyFunctionError(error, "Unable to ingest reading.") };
  }
}

export function buildConnectCloudDeploymentNotes() {
  return [
    "Install dependencies in /functions with npm install.",
    "Store provider secrets in Firebase Functions environment or Secret Manager, never in React.",
    "Deploy with firebase deploy --only functions.",
    "Use the simulator provider first, then enable Tuya/ESP32 once credentials and hardware are ready.",
  ];
}
