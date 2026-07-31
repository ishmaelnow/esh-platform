# ESH Platform Repository Instructions

These instructions apply to the entire repository.

## Start-of-session recovery

Before making changes:

1. Read `docs/session-handoff.md` completely.
2. Read `docs/roadmap.md` and every architecture or operations document linked by the handoff.
3. Inspect `git status --short --branch`, recent Git history, and pending Supabase migrations.
4. Preserve all existing uncommitted work. Never assume an unfamiliar change is disposable.
5. Reconcile the handoff against Git and the filesystem; repository evidence wins when the handoff
   is stale.
6. State the recovered objective, checkpoint, open issues, and next action before substantial work.
7. Continue from the checkpoint without repeating completed work.

## Collaboration agreement

- The project owner runs all Git mutation and deployment commands.
- Codex may inspect Git state and history but must not stage, commit, push, pull, rebase, reset, or
  change branches unless the owner explicitly changes this agreement.
- When several files must be staged, provide one explicit `git add <file>` command per line.
- Never suggest `git add -A`, `git add .`, or a broad staging command.
- Do not ask routine implementation questions when repository evidence and established product
  direction provide a safe answer. Complete the agreed feature, validate it, then hand it over.
- Preserve the project's existing architecture and working style unless a documented decision
  deliberately changes it.

## Production workflow

- `main` is pushed directly to production by the project owner.
- The project owner performs production deployment and database mutation commands.
- For every Supabase migration, first run:

  ```bash
  pnpm exec supabase db push --dry-run
  ```

- Confirm that the dry run lists only the intended migration before providing the real command:

  ```bash
  pnpm exec supabase db push
  ```

- Never expose, print, or commit populated environment files, access tokens, API keys, service-role
  keys, test passwords, or magic links.
- Production tests must use clearly identifiable data and restore temporary settings, Driver
  availability, and unfinished bookings afterward.

## Engineering completion standard

A feature is complete only when its relevant layers are handled:

- tenant isolation, authorization, RLS, and audit;
- schema migration and generated/manual client types;
- Admin, Rider, or Driver experience as applicable;
- lifecycle behavior and notification contracts;
- tests, lint, type checks, and production builds proportional to risk;
- roadmap, architecture, environment, and operations documentation;
- a current `docs/session-handoff.md` checkpoint.

Use `rg`/`rg --files` for repository discovery. Use `apply_patch` for deliberate file edits. Avoid
destructive Git or filesystem operations.

## Context documentation roles

- `docs/roadmap.md`: product direction and milestone status.
- `docs/architecture/`: durable design and privacy/security decisions.
- `docs/operations/`: production procedures and operational contracts.
- `docs/session-handoff.md`: current work position, test checkpoint, open issues, and next action.
- Git history and migrations: implementation evidence.

Update the handoff whenever the objective, deployment state, manual-test checkpoint, temporary
settings, blocker, or next action changes materially. Do not turn it into a chronological diary;
replace stale checkpoint information with the current truth.
