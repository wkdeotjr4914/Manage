"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteNote } from "@/server/actions/notes";

export function NoteActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function remove() {
    startTransition(async () => {
      await deleteNote(id);
      router.push("/notes");
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">삭제할까요?</span>
        <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />} 삭제
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          취소
        </Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" onClick={() => setConfirming(true)}>
      <Trash2 className="size-4" /> 삭제
    </Button>
  );
}
