"use client";

import { useTransition } from "react";
import { deleteAttempt } from "@/app/admin/actions";

export function DeleteAttemptButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="rounded-lg px-2 py-1 text-xs text-muted hover:text-danger disabled:opacity-50"
      disabled={pending}
      onClick={() => confirm("Delete this attempt?") && start(() => deleteAttempt(id))}
    >
      Delete
    </button>
  );
}
