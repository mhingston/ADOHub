# ADOHub

> A GitHub-like developer interface for Azure DevOps, focused on pull requests, pipelines and repository navigation.

ADOHub treats Azure DevOps as a backend implementation detail. It keeps Azure DevOps as the source of truth while presenting the developer workflows used every day with GitHub-like information architecture:

```text
Repository
├── Code
├── Pull requests
├── Actions
└── Branches
```

The first milestone is deliberately centred on one benchmark:

```text
PR → checks → failed pipeline → failed step → useful logs
```

If that flow is not materially easier than Azure DevOps, ADOHub should improve it before broadening scope.

## What is implemented

- Next.js frontend + BFF in one deployment; no separate .NET service.
- Server-only PAT authentication.
- GitHub-like repository shell and shareable repository URLs.
- Repository root browsing and branch listing.
- Pull request list, PR metadata, reviewers, discussion and merge state.
- Normalized PR checks from branch policy evaluations, PR statuses and pull-request builds.
- Files-changed view with bounded server-side unified diff generation for text files.
- Actions-style recent pipeline run list.
- Failure-first pipeline run view with stages/jobs/steps collapsed into one timeline.
- Running pipeline polling plus incremental log polling.
- Cancel and re-run actions where the Azure Build API supports them.
- Unit coverage for the normalization layer.

## Architecture

```text
Browser
  ↓
Next.js
├── React UI
├── Route Handlers / BFF
└── lib/ado adapter
      ↓
Azure DevOps REST API
```

Raw Azure DevOps response types stay under `lib/ado`. UI code consumes the application types under `lib/domain`.

The BFF is intentionally thin. It owns credentials, Azure API calls, retry/backoff, error normalization, aggregation and polling-oriented endpoints. It does not blindly mirror Azure DevOps REST URLs.

## Setup

Requirements:

- Node.js 24+
- Azure DevOps PAT with the minimum permissions needed for the features you use

Create `.env.local`:

```bash
cp .env.example .env.local
```

Then set:

```text
ADO_PAT=...
ADO_ORG=optional-default-org
ADO_PROJECT=optional-default-project
ADO_REPO=optional-default-repo
```

`ADO_PAT` is only read inside the server-side Azure DevOps adapter. It is never exposed through a `NEXT_PUBLIC_` variable or stored in browser storage.

For read-only use, grant Code read and Build read. To cancel or queue builds, grant the corresponding Build execute permission. Keep PAT scope as narrow as possible.

Install and run:

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm test
npm run build
```

## URLs

```text
/:org/:project/:repo
/:org/:project/:repo/pulls
/:org/:project/:repo/pull/:id
/:org/:project/:repo/pull/:id/files
/:org/:project/:repo/actions
/:org/:project/:repo/actions/runs/:runId
/:org/:project/:repo/branches
```

## Design constraints

ADOHub does **not** aim to recreate the whole Azure DevOps product. The MVP intentionally excludes Boards, Wiki, Test Plans, Artifacts, organisation administration, service connections, agent pools, classic Releases and full pipeline authoring.

No Azure DevOps Service Hooks are required. Live run state and logs use polling so the application can work in environments where webhook/service-hook configuration is unavailable.

## Current limitations / next slices

The current foundation proves the primary read/troubleshoot flow. The next useful increments are:

1. PR mutations: comment, approve, request changes, complete and abandon.
2. Better PR-list check summaries without issuing per-PR policy/status fan-out.
3. Inline diff review threads and viewed-file state.
4. Pipeline definition list + GitHub-style “Run workflow” parameters.
5. Retry failed stage/job where the backing Azure API exposes a clean operation.
6. Entra delegated authentication as an alternative to PAT configuration.
7. Richer branch metadata such as associated PR, policy summary and ahead/behind.

When an Azure feature cannot be represented cleanly, prefer a direct link back to Azure DevOps over a misleading partial clone.
