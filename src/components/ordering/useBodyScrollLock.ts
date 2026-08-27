'use client';

import { useEffect } from 'react';

/**
 * Freeze the page behind an open sheet.
 *
 * Without this, a flick inside the modal chains through to the document once the sheet
 * has scrolled to its end, and the guest comes back from picking a syrup to find they
 * have lost their place in a 53-item menu. It is the same effect SiteHeader already
 * uses for the mobile nav (SiteChrome.tsx) — the sheets never had it.
 *
 * Restoring `''` rather than a remembered value is deliberate: nothing else in the app
 * sets body overflow, and two overlapping locks (nav open, then a sheet) should both
 * resolve to unlocked when the last one closes.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
