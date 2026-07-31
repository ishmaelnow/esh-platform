# Project Context Recovery

Use this procedure after an interrupted or replacement Codex session.

## Recovery sources

Recover context in this order:

1. `AGENTS.md` for permanent repository and collaboration rules.
2. `docs/session-handoff.md` for the current objective and checkpoint.
3. `docs/roadmap.md` for product direction.
4. Architecture and operations documents referenced by the handoff.
5. Git status, recent commits, migrations, and tests as implementation evidence.

Never trust the handoff blindly. Reconcile it with the current worktree and history, preserve
uncommitted work, and update stale checkpoint details.

## Reusable resume prompt

```text
Resume this project from the repository state.

Before taking action:
1. Read every applicable AGENTS.md completely.
2. Read docs/session-handoff.md completely.
3. Read the roadmap and every document referenced by the handoff.
4. Inspect git status, recent history, the current branch, and pending migrations.
5. Preserve existing uncommitted work.
6. Reconcile documentation with repository evidence.
7. Report the recovered objective, current checkpoint, open issues, and exact next action.
8. Continue from the checkpoint without repeating completed work.

Do not make substantive changes until context recovery is complete.
```

## Updating the handoff

Before a planned interruption, or after a material test result, use:

```text
Update docs/session-handoff.md with the current objective, repository/deployment state, last
confirmed result, exact checkpoint, open issues, temporary production settings, cleanup, required
reading, and exact next action. Replace stale checkpoint information; do not create a diary.
```

Do not record credentials, tokens, magic links, private customer data, or populated environment
values in the handoff.
