import { Brand } from "@/ui/Brand";

export default function UnavailablePreview() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 py-20">
      <Brand linked={false} />
      <h1 className="text-3xl font-bold">This viewing link is unavailable.</h1>
      <p className="text-base text-muted">The link may have been turned off or copied incorrectly. Ask whoever shared it for a new viewing link.</p>
    </main>
  );
}
