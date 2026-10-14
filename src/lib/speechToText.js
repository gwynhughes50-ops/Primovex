import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

// A recording (base64 WAV, 16 kHz mono) turned into words by the server. Returns { text, confidence }.
export async function transcribeSpeech(base64, phrases = []) {
  const call = httpsCallable(functions, "transcribeSpeech");
  const response = await call({ audio: base64, phrases });
  return response.data;
}
