# ADOHub

> A GitHub-like developer interface for Azure DevOps pull requests, pipelines and repository navigation.

ADOHub keeps Azure DevOps as the source of truth and presents the daily developer flow:

```text
PR → checks → failed pipeline → failed step → useful log
PR → review/comment → resolve blockers → complete
```

## Current features

- Organization project and project repository browsing through the breadcrumb hierarchy.
- Repository root, default branch and branch browsing.
- Paginated pull request lists, reviewers, discussion and merge state.
- Current policy, status and PR-build checks, with old status history collapsed by context.
- Text file diffs with all changed-file metadata retained; inline diffs are bounded.
- Pipeline runs, timeline, failed-step-first logs, incremental log polling, cancel and re-run.
- PR comments, current-user votes, complete, abandon and reactivate actions.
- A thin Next.js BFF; raw Azure payloads stay in `lib/ado`, and UI components use `lib/domain`.

## Azure DevOps assumptions observed in live data

The read workflow has been exercised against a real Azure DevOps Git repository with REST API 7.1 responses. Sanitized samples live under `tests/fixtures/ado/`.

- PR states are `active`, `completed` and `abandoned`; draft state is a separate `isDraft` flag. PR detail may omit both `updatedDate` and `_links.web`, so ADOHub does not invent an update timestamp and derives a web link from the repository URL when needed.
- Reviewer votes use ADO values: `10` approve, `5` approve with suggestions, `0` no vote, `-5` wait for author and `-10` reject/request changes.
- Iteration changes use `changeEntries` (some captured responses wrap these under `changes`), not a `value` array. A deletion may omit `item.path` and put the removed path in `originalPath`.
- Policy evaluations are scoped to the project-level PR artifact. Repeated PR status contexts are history; ADOHub keeps the newest timestamp per context. Distinct policy configurations/scopes remain visible.
- PR-associated builds were observed with both `refs/pull/{id}/merge` and `triggerInfo` values such as `pr.number`. Timeline data has Stage, Phase, Job, Task and Checkpoint records; Phase is folded into Stage → Job → Task, and approval checkpoints remain visible.
- Build log responses are text and `startLine` is one-based. A trailing newline does not add an extra log line. A queued or approval-blocked run may have no active task log yet.
- Organization breadcrumbs list projects accessible to the authenticated user; project breadcrumbs list repositories in that project using Azure DevOps REST API 7.1.

Policy evaluations and PR statuses use preview REST versions; those versions are isolated in `lib/ado` and normalized into stable domain types.

Relevant Microsoft REST references: [project listing](https://learn.microsoft.com/en-us/rest/api/azure/devops/core/projects/list?view=azure-devops-rest-7.1), [iteration changes](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iteration-changes/get?view=azure-devops-rest-7.1), [PR thread creation](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1), [reviewer votes](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-reviewers/create-pull-request-reviewer?view=azure-devops-rest-7.1), [PR update/completion](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/update?view=azure-devops-rest-7.1), [policy evaluations](https://learn.microsoft.com/en-us/rest/api/azure/devops/policy/evaluations?view=azure-devops-rest-7.1) and [build listing](https://learn.microsoft.com/en-us/rest/api/azure/devops/build/builds/list?view=azure-devops-rest-7.1).

## Setup

Requirements: Node.js 24 or later and an Azure DevOps PAT with the scopes and resource permissions needed for the features you enable.

Set these server-side environment variables (for example, in a local `.env.local`):

```text
ADO_PAT=...
ADO_ORG=your-organization
```

`ADO_PROJECT` and `ADO_REPO` are optional defaults for the repository selector. Writes are enabled by default when `ADO_PAT` and `ADO_ORG` are set. To disable every write, set `ADO_MUTATIONS_ENABLED=false`.

Never use `NEXT_PUBLIC_*` for the PAT. The browser receives only ADOHub API responses; it does not call Azure DevOps directly.

Suggested minimum PAT scopes:

- Read only: **Code (Read)**, **Build (Read)**, **Project and Team (Read)** and **Profile (Read)** for project resolution and identifying the authenticated reviewer.
- PR writes: **Code (Read & write)** for comments, votes, completion and PR lifecycle actions.
- Pipeline cancel/re-run: **Build (Read & execute)**.

Azure DevOps permissions and organization policies can require additional access. Keep PAT scopes and Azure DevOps permissions as narrow as possible.

When writes are enabled, `ADO_ORG` is the organization boundary. Each write resolves the project and repository from the requested ADOHub route, then verifies through Azure DevOps that the target PR or build belongs to that repository before sending the mutation. Requests for a different organization are rejected. Project and repository environment variables are not required for authorization. This allows writes to any repository in `ADO_ORG` that the PAT identity has permission to change; the browser cannot supply or override the PAT.

PAT mode is intended for local, single-user or internal development. Because writes are enabled by default, scope the PAT and the account's Azure DevOps permissions to the repositories and actions that should be available. A shared deployment requires application authentication and authorization. Entra delegated authentication is not included in this slice.

Install and run:

```bash
npm ci
npm run dev
```

Validation:

```bash
npm run typecheck
npm test
npm run build
```

## PR operations

- Add a normal discussion comment.
- Vote: approve (`10`), approve with suggestions (`5`), wait for author (`-5`), request changes/reject (`-10`) or reset (`0`). The current user's review is marked separately.
- Complete with squash or merge commit. Deleting the source branch is optional and defaults off; linked work items are not transitioned.
- Abandon or reactivate a pull request after a browser confirmation.
- Azure remains final authority for policy and merge eligibility. ADOHub shows known blockers and the Azure error returned for a failed completion.

## URL structure

```text
/:org
/:org/:project
/:org/:project/:repo
/:org/:project/:repo/pulls
/:org/:project/:repo/pull/:id
/:org/:project/:repo/pull/:id/files
/:org/:project/:repo/actions
/:org/:project/:repo/actions/runs/:runId
/:org/:project/:repo/branches
```

## Limitations

- Inline unified diffs are generated for at most 30 files and 400 KB of combined text per file. Every file remains listed. Binary files are not diffed.
- A true rename was not present in the captured live sample; when ADO supplies both `originalPath` and the new item path, ADOHub preserves both.
- Pipeline definitions, run parameters, inline diff review threads, viewed-file state, service hooks and Boards/Wiki/Test Plans are out of scope.
- Polling is used for visible PR/build state; no service hooks are required.

When ADOHub cannot represent an Azure DevOps feature clearly, it links back to Azure DevOps instead of displaying a misleading approximation.
