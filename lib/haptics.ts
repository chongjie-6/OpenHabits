"use client";

/**
 * Haptic confirmation for a tick. See DESIGN.md §6.4.
 *
 * The counterpart to the 180ms checkbox pop in §6.3: on a phone the thumb is
 * over the target it just pressed, so the visual confirmation is the thing most
 * likely to be covered up. A buzz confirms it without asking the user to look.
 *
 * Two rules the patterns follow. They are **short** — a tick is an
 * acknowledgement, not an alert, and anything long enough to notice as a buzz
 * is long enough to be irritating on the fifth habit of the morning. And
 * completion is *structurally* different from a step towards it, not merely
 * longer: a pattern with a gap in it is distinguishable through a pocket, where
 * 12ms against 20ms is not.
 *
 * Nothing here is gated on `prefers-reduced-motion`. That setting is about
 * visual motion and the vestibular symptoms it triggers; a vibration causes
 * none of them, and silently overriding an explicit "haptics: on" from a
 * setting the user made for a different reason is the kind of helpfulness that
 * reads as a bug. `settings.haptics` is the only authority.
 */

/** One step towards the target. */
export const HAPTIC_TICK = 12;

/** Target reached. The gap is what makes it recognisable, not the length. */
export const HAPTIC_DONE = [12, 45, 26];

/**
 * Vibrate, if this device can and the browser is willing.
 *
 * Unsupported everywhere on iOS and inside any browser without a vibration
 * motor, which is why every caller treats it as decoration: the tick is already
 * recorded by the time this runs, and a device that cannot buzz loses nothing
 * else. The try/catch covers browsers that expose the method but reject the
 * call — no user activation, or a permissions policy denying `vibrate`.
 */
export function vibrate(pattern: VibratePattern): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;

  try {
    navigator.vibrate(pattern);
  } catch {
    // A tick is not worth an exception.
  }
}
