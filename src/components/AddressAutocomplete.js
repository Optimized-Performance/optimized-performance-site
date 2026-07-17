import { useEffect, useRef, useState } from 'react';

// Google Places address autocomplete — a "start typing your address" search
// box that populates the real street/city/state/zip fields below it, so a
// customer can't submit a partial address (the "just the town" problem).
//
// GATED on NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: with no key this renders NOTHING
// and the manual fields are used as-is — so checkout is never blocked by a
// missing key or a Google outage. Fully fail-safe: any error just falls back
// to manual entry.
//
// Mount is SELF-HEALING (retry loop): the first instance on a page mounts
// during checkout's initial render churn, where a single fire-once async
// effect can lose the race (host ref churn / transient remount) and silently
// never append the Google element — which is exactly why the SHIPPING box
// came up empty while BILLING (mounted later, on a click) worked. The loop
// re-attempts every 500ms until the element is in the DOM (idempotent — it
// no-ops once the host has a child), capped so it can't spin forever.

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
let mapsLoader = null; // shared promise so the script loads once per page

function loadMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
  if (mapsLoader) return mapsLoader;
  mapsLoader = new Promise((resolve, reject) => {
    const existing = document.getElementById('gmaps-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.id = 'gmaps-js';
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&libraries=places&loading=async`;
    s.onload = () => resolve(window.google);
    s.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(s);
  });
  return mapsLoader;
}

// Pull the fields we need out of a Place's addressComponents array.
function parseComponents(components = []) {
  const get = (type, prop = 'longText') => {
    const c = components.find((x) => (x.types || []).includes(type));
    return c ? (c[prop] || c.longText || c.shortText || '') : '';
  };
  const streetNumber = get('street_number');
  const route = get('route');
  const city = get('locality') || get('postal_town') || get('sublocality') || get('sublocality_level_1');
  const state = get('administrative_area_level_1', 'shortText');
  const zip = get('postal_code');
  const country = get('country', 'shortText');
  return {
    line1: [streetNumber, route].filter(Boolean).join(' ').trim(),
    city,
    state,
    zip,
    country,
  };
}

export default function AddressAutocomplete({ country = 'US', onPick, label = 'Find your address' }) {
  const hostRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!MAPS_KEY) return undefined; // no key → render nothing (manual entry)
    let cancelled = false;
    let el = null;
    let attempts = 0;

    const onSelect = async (event) => {
      try {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({ fields: ['addressComponents'] });
        const parsed = parseComponents(place.addressComponents || []);
        if (parsed.line1 && typeof onPick === 'function') onPick(parsed);
      } catch {
        /* selection parse failed — customer can still type manually */
      }
    };

    // Idempotent, self-healing mount. Retries until the element is attached or
    // the attempt cap is hit; no-ops once the host already has a child.
    const tryMount = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const host = hostRef.current;
        if (host && host.childElementCount > 0) { setReady(true); return; } // already mounted
        if (host) {
          await loadMaps();
          if (cancelled) return;
          const { PlaceAutocompleteElement } = await window.google.maps.importLibrary('places');
          if (cancelled || !hostRef.current || hostRef.current.childElementCount > 0) return;
          el = new PlaceAutocompleteElement();
          try { el.includedRegionCodes = [String(country || 'US').toLowerCase()]; } catch { /* option optional */ }
          el.style.width = '100%';
          hostRef.current.appendChild(el);
          el.addEventListener('gmp-select', onSelect);
          setReady(true);
          return; // mounted — stop retrying
        }
      } catch {
        /* fall through to retry */
      }
      if (!cancelled && attempts < 20) setTimeout(tryMount, 500); // ~10s of retries
    };

    tryMount();

    return () => {
      cancelled = true;
      try { if (el && el.remove) el.remove(); } catch { /* already gone */ }
    };
  }, [country, onPick]);

  if (!MAPS_KEY) return null;

  return (
    <label className="block mb-4">
      <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-ink-mute">{label}</span>
      <div ref={hostRef} className="mt-1.5 gmaps-ac" />
      {ready && (
        <span className="opp-meta-mono block mt-1 text-ink-mute">
          Start typing and pick your address — it fills the fields below. Or enter them manually.
        </span>
      )}
    </label>
  );
}
