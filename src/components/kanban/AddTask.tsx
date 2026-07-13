"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { createTask } from "@/server/actions/tasks";

export function AddTask({
  projectId,
  status,
}: {
  projectId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const busyRef = useRef(false);

  function submit() {
    if (busyRef.current) return; // guard Enter + onBlur double-submit
    const value = title.trim();
    if (!value) {
      setOpen(false);
      return;
    }
    busyRef.current = true;
    startTransition(async () => {
      await createTask({ projectId, status, title: value });
      setTitle("");
      busyRef.current = false;
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Plus className="size-3.5" /> 태스크 추가
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-2">
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={submit}
        placeholder="할 일을 입력하고 Enter"
        className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-2 focus:outline-none"
        rows={2}
      />
      <div className="flex items-center justify-end">
        {pending && <Loader2 className="size-3.5 animate-spin text-muted-2" />}
      </div>
    </div>
  );
}
