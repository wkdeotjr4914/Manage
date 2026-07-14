import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { requireUser } from "@/server/auth";

// Chrome (sidebar + top bar) for the authenticated app. `requireUser` gates the
// whole group — anonymous requests get redirected to /login (the proxy also
// blocks them, but this is the real per-route guard).
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={user.role === "ADMIN"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={{ name: user.name, email: user.email, role: user.role }} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
