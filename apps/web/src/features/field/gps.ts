export type Fix = { lat: number | null; lng: number | null; accuracyM: number | null };

const NO_FIX: Fix = { lat: null, lng: null, accuracyM: null };

/**
 * The officer's position, or nothing. Never blocks logging: a denied permission
 * or weak signal must not lose the event; managers see "no GPS" instead.
 */
export function currentFix(timeoutMs = 4000): Promise<Fix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(NO_FIX);
  return new Promise((resolve) => {
    const giveUp = setTimeout(() => resolve(NO_FIX), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(giveUp);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy });
      },
      () => {
        clearTimeout(giveUp);
        resolve(NO_FIX);
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120_000 },
    );
  });
}
