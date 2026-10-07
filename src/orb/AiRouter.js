import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { AiRouter } from "./aiRouting";

// The app's connection to the orbRoute Cloud Function (the Orb's language
// assistant). The behaviour lives in aiRouting.js; this only supplies the call.
let shared;
export function getAiRouter() {
  if (!shared) {
    shared = new AiRouter({
      call: (payload) => httpsCallable(functions, "orbRoute", { timeout: 15000 })(payload).then((r) => r.data),
      callPhrase: (payload) => httpsCallable(functions, "orbPhrase", { timeout: 15000 })(payload).then((r) => r.data),
    });
  }
  return shared;
}
