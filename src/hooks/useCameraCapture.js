import { useEffect, useRef, useState } from "react";

// Shared getUserMedia camera lifecycle, used by both the desktop photo
// capture dialog and the mobile one so the camera-handling logic (starting
// it, tearing it down, and what to do when permission is refused) only
// exists once. Starts the moment `active` becomes true, stops on close or
// unmount so the camera light never stays on in the background.
export default function useCameraCapture(active) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return undefined;
    }
    let cancelled = false;
    setError("");
    setReady(false);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (!cancelled) setReady(true);
        }
      } catch (err) {
        console.error("Camera error", err);
        if (!cancelled) {
          setError(
            err?.name === "NotAllowedError"
              ? "Camera access was refused. Check the camera permission for Primovex and try again."
              : err?.message || "Could not access the camera."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [active]);

  function captureFrame(quality = 0.9) {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  }

  return { videoRef, error, ready, captureFrame };
}
