import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="text-center">
        <p className="font-mono text-sm text-helper">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Spot couldn&apos;t find that waypoint</h1>
        <p className="mt-2 text-sm text-muted-foreground">The page you asked for isn&apos;t on this route.</p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring">
          Back to Today
        </Link>
      </div>
    </main>
  );
}
