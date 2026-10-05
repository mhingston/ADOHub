export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="home-shell">
      <section className="hero">
        <span className="eyebrow">Developer interface for Azure DevOps</span>
        <h1>PRs and pipelines, with GitHub-shaped navigation.</h1>
        <p>
          Azure DevOps remains the source of truth. ADOHub provides a focused interaction layer for code,
          pull requests, checks, pipelines and branches.
        </p>
      </section>
      <form className="selector card" action="/open" method="get">
        <h2>Open a repository</h2>
        {error ? <div className="error-banner">{error}</div> : null}
        <label>Organisation<input required name="org" defaultValue={process.env.ADO_ORG ?? ""} placeholder="acme" /></label>
        <label>Project<input required name="project" defaultValue={process.env.ADO_PROJECT ?? ""} placeholder="Sales Platform" /></label>
        <label>Repository<input required name="repo" defaultValue={process.env.ADO_REPO ?? ""} placeholder="call-coach" /></label>
        <button className="button primary" type="submit">Open repository</button>
      </form>
      <p className="muted home-note">ADO_PAT stays on the Next.js server and is never sent to browser JavaScript.</p>
    </main>
  );
}
