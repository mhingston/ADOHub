# Sanitized Azure DevOps fixtures

These fixtures were captured from Azure DevOps REST responses during a read-only smoke test on 2026-10-05. They preserve the response structure and relevant state values while replacing identities, organization/project/repository names, internal links, branch names, file paths, commit hashes, discussion text, build names, and log content.

| Fixture | Live response shape |
|---|---|
| `pull-request.json` | Git pull request detail, REST API 7.1 |
| `pull-request-reviewers.json` | Reviewer arrays from PRs with one to four reviewers; observed votes include 0, 5, 10, and -10 |
| `pull-request-threads.json` | Pull request thread list, REST API 7.1 |
| `policy-evaluations.json` | Policy evaluation list, REST API 7.1-preview.1 |
| `pull-request-statuses.json` | PR status list, REST API 7.1-preview.1; includes repeated contexts from successive runs |
| `build.json` | A completed failed build, REST API 7.1 |
| `build-pr.json` | A real PR-validation build with a sanitized pull/merge ref and `triggerInfo.pr.number`, REST API 7.1 |
| `build-timeline.json` | Build timeline with Stage, Phase, Job, Task, and Checkpoint records, REST API 7.1 |
| `build-timeline-approval.json` | Sanitized Stage → Checkpoint → Checkpoint.Approval fragment from a running build timeline, REST API 7.1 |
| `build-log-metadata.json` | Log metadata collection and selected stage/job/task log records, REST API 7.1 |
| `failed-step-log.txt` | Sanitized text/plain task log retaining line count and trailing newline |
| `pull-request-iteration-changes.json` | 29 iteration changes in `changeEntries` |
| `pull-request-iteration-changes-deletes.json` | Iteration changes with deleted-file paths carried by `originalPath` |
| `pull-request-many-files.json` | 61 iteration changes, including all file metadata |

The iteration-change response uses `changeEntries` and may provide `nextSkip`/`nextTop`; it is not a `value` collection. The captured iteration snapshot wraps these entries as `changes.changeEntries`, and the adapter accepts that shape and the direct `changeEntries` response. The sampled deleted-file entries omit `item.path` and carry that path in `originalPath`; tests assert that deleted files remain visible. A true rename with both old and new paths was not observed in the live sample. The live build timeline includes a `Phase` layer between Stage and Job plus `Checkpoint.Approval` records, and the live PR detail does not include `updatedDate` or a `_links.web` entry. Tests assert those observed shapes directly.

No access token, authorization header, real identity, source code, user-written comment, raw log line, or internal ADO URL is stored here.
