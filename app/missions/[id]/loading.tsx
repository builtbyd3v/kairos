import { AppHeader } from "@/components/status";

export default function Loading() {
  return (
    <div className="min-h-screen">
      <AppHeader active="missions" />
      <p className="mx-auto max-w-[1440px] px-6 py-5 text-sm text-muted-foreground">Loading mission…</p>
    </div>
  );
}
