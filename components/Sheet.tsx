"use client";

import { useEffect, useRef } from "react";

/**
 * A bottom sheet, built on the platform's modal dialog — DESIGN.md §6.7.
 *
 * `showModal()` is what buys the focus trap, Escape-to-dismiss, the inert
 * background and the top layer. A div with a fixed-position backdrop has to
 * reimplement all four, and the version that gets shipped is usually missing
 * the ones a screen reader depends on. Everything here is shape and motion on
 * top of that; the animation itself lives in `globals.css`.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const dismiss = useRef<HTMLButtonElement>(null);
  const startedOnBackdrop = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    if (open && !element.open) {
      element.showModal();
      // The dialog's own focusing steps land on the first focusable descendant,
      // which for a form is a text field. On touch that raises the keyboard
      // over a sheet pinned to the bottom edge, covering the thing that just
      // opened, so focus starts on the close button instead.
      dismiss.current?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      data-slot="sheet"
      aria-label={title}
      // Fires for Escape as well as our own close(), so it is the only place
      // the parent's state has to be put back.
      onClose={onClose}
      // A press on the backdrop targets the dialog element; one on the content
      // targets the content. Both ends have to be on the backdrop: a drag that
      // starts on one of the form's range sliders and finishes past the edge of
      // the sheet delivers a click whose target is the dialog, and dismissing
      // there throws the form away for setting a slider to its maximum.
      onPointerDown={(event) => {
        startedOnBackdrop.current = event.target === dialog.current;
      }}
      onClick={(event) => {
        if (startedOnBackdrop.current && event.target === dialog.current) onClose();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto flex max-h-[85dvh] min-h-[33dvh] w-full max-w-[32rem] flex-col overflow-hidden bg-surface p-0 text-foreground surface-sheet"
    >
      <div className="flex items-start justify-between gap-4 px-4 pt-4">
        <h2 className="display-type text-[15px]">{title}</h2>
        <button
          ref={dismiss}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:text-foreground"
        >
          &#x2715;
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-safe">
        {children}
      </div>
    </dialog>
  );
}
