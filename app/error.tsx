"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="repo-shell error-page">
      <h1>ADOHub could not load this view</h1>
      <p>{error.message}</p>
      <button className="button" onClick={reset}>Try again</button>
    </main>
  );
}
