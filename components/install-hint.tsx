"use client";

import { useSyncExternalStore } from "react";

/**
 * We deliberately do not intercept `beforeinstallprompt`.
 *
 * It does not exist on iOS Safari, so hand-rolling a custom install button
 * produces a two-tier experience: a real button on Chrome and nothing on the
 * platform that most needs the hint. Browsers that support installation show
 * their own prompt once the manifest and HTTPS criteria are met; iOS gets the
 * only thing that actually helps there, which is instructions.
 * See DESIGN.md §8.4.
 */

const DISPLAY_MODE = "(display-mode: standalone)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(DISPLAY_MODE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function isStandalone(): boolean {
  return (
    window.matchMedia(DISPLAY_MODE).matches ||
    // iOS Safari's own flag, which predates the media query.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function InstallHint() {
  // The server snapshot claims "already installed" so the hint is absent from
  // the prerendered HTML and only ever appears, never disappears.
  const standalone = useSyncExternalStore(subscribe, isStandalone, () => true);

  if (standalone) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="rounded-card border border-border bg-surface-2 p-4">
      <p className="text-[13px] font-medium">Add hapi to your home screen</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        {isIOS ? (
          <>
            Tap the share button <span aria-label="share icon">⎋</span> in Safari,
            then <strong className="font-medium">Add to Home Screen</strong>{" "}
            <span aria-label="plus icon">➕</span>.
          </>
        ) : (
          <>
            Use your browser&rsquo;s <strong className="font-medium">Install</strong> or{" "}
            <strong className="font-medium">Add to Home screen</strong> option. It
            opens full screen and works offline.
          </>
        )}
      </p>
    </div>
  );
}
