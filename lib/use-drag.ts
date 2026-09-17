"use client";

/**
 * A horizontal drag that the surface can follow while it happens. See §6.8.
 *
 * `use-swipe.ts` reads the gesture once, on release: nothing moves until the
 * finger lifts. That is right for the day list, where the content changing is
 * its own feedback, and wrong for the week strip, whose seven circles hold their
 * positions while only the numerals change — a week that turned over looks a
 * great deal like one that did not. Following the finger is what makes the
 * gesture visible before it commits, and what makes it abandonable.
 *
 * The thresholds are not restated here. `resolveSwipe` decides the release, and
 * `MAX_OFF_AXIS` decides the axis lock, both imported.
 */

import { useRef, useState } from "react";
import {
  insideHorizontalScroller,
  MAX_OFF_AXIS,
  MIN_DISTANCE,
  resolveSwipe,
  type SwipeDirection,
} from "@/lib/use-swipe";

/**
 * How far the pointer must travel before the drag claims the axis.
 *
 * Under this the gesture is still a tap on whatever it landed on, and still a
 * page scroll waiting to happen. It is deliberately well under `MIN_DISTANCE`:
 * claiming late would mean the row jumps to catch up with the finger.
 */
const AXIS_LOCK = 8;

/** The furthest the row may travel, however far the finger goes. */
const MAX_TRAVEL = 96;

/**
 * One-to-one until the gesture would commit, then asymptotic to `MAX_TRAVEL`.
 *
 * The surface is clipped rather than allowed to reach past whatever sits beside
 * it, so the cap is about feel rather than layout: a row that kept pace with a
 * finger crossing the whole screen would read as something that could be
 * thrown, and this one only ever moves by one step. Far enough to bring a good
 * part of the neighbour into view, and no further.
 */
function resist(dx: number): number {
  const past = Math.abs(dx) - MIN_DISTANCE;
  if (past <= 0) return dx;
  const give = MAX_TRAVEL - MIN_DISTANCE;
  const travel = MIN_DISTANCE + (give * past) / (past + give);
  return Math.sign(dx) * travel;
}

export function useHorizontalDrag(
  onCommit: (direction: SwipeDirection) => void,
) {
  const from = useRef<{ x: number; y: number; id: number } | null>(null);
  const locked = useRef(false);
  const dragged = useRef(false);
  const [dx, setDx] = useState(0);

  function end() {
    from.current = null;
    locked.current = false;
    setDx(0);
  }

  return {
    dx,
    // Read off `dx` rather than the lock ref, which a render is not told about:
    // the axis is claimed and the row moved in the same event, and both end
    // together, so the two are the same fact.
    dragging: dx !== 0,
    handlers: {
      // Unlike `useSwipe` this accepts a mouse. The objection there is that a
      // horizontal mouse drag is a text selection, and the strip holds nothing
      // anyone selects — the circles are buttons and the range line is four
      // words. The `<nav>` turns selection off for the duration either way.
      onPointerDown(event: React.PointerEvent) {
        dragged.current = false;
        if (
          !event.isPrimary ||
          insideHorizontalScroller(event.target, event.currentTarget)
        ) {
          from.current = null;
          return;
        }
        from.current = {
          x: event.clientX,
          y: event.clientY,
          id: event.pointerId,
        };
      },

      onPointerMove(event: React.PointerEvent) {
        const start = from.current;
        if (!start || start.id !== event.pointerId) return;

        const travel = event.clientX - start.x;
        const drift = event.clientY - start.y;

        if (!locked.current) {
          if (Math.abs(travel) < AXIS_LOCK) return;
          if (Math.abs(drift) > Math.abs(travel) * MAX_OFF_AXIS) {
            // Vertical: leave it to the page. A touch is about to be taken away
            // by the scroll anyway, and a mouse has nothing to take it.
            from.current = null;
            return;
          }
          locked.current = true;
          dragged.current = true;
          // Touch pointers are captured implicitly; a mouse is not, and a drag
          // that leaves the row would otherwise stop reporting.
          event.currentTarget.setPointerCapture(event.pointerId);
        }

        setDx(resist(travel));
      },

      onPointerUp(event: React.PointerEvent) {
        const start = from.current;
        if (!start || start.id !== event.pointerId) return;
        const committed = locked.current;
        const travel = event.clientX - start.x;
        const drift = event.clientY - start.y;
        end();
        if (!committed) return;

        const direction = resolveSwipe(travel, drift);
        if (direction) onCommit(direction);
      },

      onPointerCancel: end,

      /**
       * A drag that began on a circle still ends in a click on it. Swallowing
       * that click is what keeps a drag across the strip from also browsing to
       * whichever day it happened to finish over.
       */
      onClickCapture(event: React.MouseEvent) {
        if (!dragged.current) return;
        dragged.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };
}
