import { redirect } from "next/navigation";
import { Brain } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "@/components/auth/LoginForm";

// Outside the (app) route group, so it renders without the sidebar/top bar.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  // Already signed in → straight to the intended destination.
  const user = await getCurrentUser();
  if (user) redirect(safeNext);

  return (
    <div className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_20px_-6px_var(--primary)]">
            <Brain className="size-6" />
          </span>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-foreground">Second Brain</h1>
            <p className="text-sm text-muted-2">계속하려면 로그인하세요.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface-2 p-6 shadow-sm">
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
