"use client";

/**
 * Horizontal swipe as day/week navigation. See DESIGN.md §6.8.
 *
 * The decision is split out as a pure function because every hard part of this
 * gesture is a threshold, and thresholds are the part worth testing: a list of
 * habits exists to be scrolled vertically, and a thumb dragging down it drifts
 * sideways by tens of pixels without meaning anything by it.
 */

import { useRef } from "react";

export type SwipeDirection = "left" | "right";

/** Below this the gesture is a tap, and a tap on a habit must still tick it. */
const MIN_DISTANCE = 56;

/** How far off the horizontal a swipe may wander, as a fraction of its length. */
const MAX_OFF_AXIS = 0.6;

/** A slow drag is a scroll that changed its mind, not a flick. */
const MAX_DURATION_MS = 800;

export function resolveSwipe(dx: number, dy: number, dt: number): SwipeDirection | null {
  if (dt > MAX_DURATION_MS) return null;
  if (Math.abs(dx) < MIN_DISTANCE) return null;
  if (Math.abs(dy) > Math.abs(dx) * MAX_OFF_AXIS) return null;
  return dx < 0 ? "left" : "right";
}

/**
 * Is the press inside something that scrolls sideways on its own?
 *
 * The week grid is a table in an `overflow-x-auto` box, and on a phone it does
 * overflow. Dragging it sideways has to scroll it rather than change the week,
 * so the gesture yields to any horizontal scroller between the press and the
 * element the hook is attached to. This is why the hook sets no `touch-action`:
 * `pan-y` on the container would take the horizontal axis away from that
 * scroller, and a descendant cannot give it back.
 */
function insideHorizontalScroller(target: EventTarget | null, container: Element): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== container) {
    if (node.scrollWidth > node.clientWidth) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === "auto" || overflowX === "scroll") return true;
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Spread the result onto the element the gesture applies to.
 *
 * Touch and pen only. On a desktop a horizontal drag is a text selection, and
 * the arrow buttons beside the heading are already the answer there — which is
 * also what keeps the feature reachable from a keyboard and a screen reader,
 * since a swipe is announced to neither.
 */
export function useSwipe(onSwipe: (direction: SwipeDirection) => void) {
  const from = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const swiped = useRef(false);

  return {
    onPointerDown(event: React.PointerEvent) {
      swiped.current = false;
      if (
        event.pointerType === "mouse" ||
        !event.isPrimary ||
        insideHorizontalScroller(event.target, event.currentTarget)
      ) {
        from.current = null;
        return;
      }
      from.current = {
        x: event.clientX,
        y: event.clientY,
        t: event.timeStamp,
        id: event.pointerId,
      };
    },

    // Touch pointers are implicitly captured by the element the press landed
    // on, so the release arrives here by bubbling even if the thumb has left
    // the row it started on.
    onPointerUp(event: React.PointerEvent) {
      const start = from.current;
      from.current = null;
      if (!start || start.id !== event.pointerId) return;

      const direction = resolveSwipe(
        event.clientX - start.x,
        event.clientY - start.y,
        event.timeStamp - start.t,
      );
      if (!direction) return;

      swiped.current = true;
      onSwipe(direction);
    },

    onPointerCancel() {
      from.current = null;
    },

    /**
     * A swipe that began on a tick target still ends in a click. Swallowing
     * that click in the capture phase is the whole reason swiping across the
     * list does not tick a habit off on the way past.
     */
    onClickCapture(event: React.MouseEvent) {
      if (!swiped.current) return;
      swiped.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
