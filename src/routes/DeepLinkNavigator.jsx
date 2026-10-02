import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { parseAssetQrPayload } from '@/services/assets/assetLabelService';

const APP_LINK_HOST = 'app.primovex.co.uk';
const SENSE_PATH = /^\/sense\/open\/(space|asset)\/[^/?#]+\/?$/i;

// A kit / anaphylaxis box label opened as a link (the phone's camera hands the
  // label's primovex://asset/... text to the app): go straight to that box's check.
function assetCheckRoute(value) {
  const asset = parseAssetQrPayload(String(value));
  if (!asset) return null;
  const tab = asset.collection === 'emergency_assets' ? 'emergency' : 'anaphylaxis';
  return `/inventory?tab=${tab}&asset=${encodeURIComponent(asset.assetId)}`;
}

function routeFromDeepLink(value) {
  const assetRoute = assetCheckRoute(value);
  if (assetRoute) return assetRoute;
  try {
    const url = new URL(String(value));
    let path = url.pathname;

    if (url.protocol === 'https:' && url.hostname !== APP_LINK_HOST) return null;
    if (url.protocol === 'primovex:') {
      path = `/${url.hostname}${url.pathname}`;
    } else if (url.protocol !== 'https:') {
      return null;
    }

    return SENSE_PATH.test(path) ? `${path}${url.search}` : null;
  } catch {
    return null;
  }
}

export default function DeepLinkNavigator() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return undefined;

    let disposed = false;
    let unlisten;
    const open = (urls = []) => {
      const path = urls.map(routeFromDeepLink).find(Boolean);
      if (path && !disposed) navigateRef.current(path);
    };

    import('@tauri-apps/plugin-deep-link')
      .then(async ({ getCurrent, onOpenUrl }) => {
        open((await getCurrent()) || []);
        unlisten = await onOpenUrl(open);
        if (disposed) unlisten?.();
      })
      .catch((error) => console.error('Unable to initialise Primovex deep links', error));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return null;
}
