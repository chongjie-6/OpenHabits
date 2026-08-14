"use client";

import { useState } from "react";
import { HabitForm } from "@/components/habit-form";
import { addHabit } from "@/lib/store";

export function AddHabit() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-dashed border-border text-[14px] font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          +
        </span>
        New habit
      </button>
    );
  }

  return (
    <div className="mt-3">
      <HabitForm
        submitLabel="Add habit"
        onCancel={() => setOpen(false)}
        onSubmit={(values) => {
          addHabit(values);
          setOpen(false);
        }}
      />
    </div>
  );
}
