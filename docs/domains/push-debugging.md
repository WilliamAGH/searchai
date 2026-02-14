# Git Push Debugging

Use this guide when `git push` fails and the terminal output is ambiguous.
Follow this sequence to separate hook failures from remote push failures.

Related rules: [GT1a], [GT1c], [GT1i], [CS1a], [ZA1d].

## 1) Capture environment context first

From repo root:

```bash
env | rg "^(PLAYWRIGHT_BROWSERS_PATH|CI|FORCE_COLOR|NO_COLOR|PREK)"
git status -sb
git remote -v
git branch -vv
```

If `PLAYWRIGHT_BROWSERS_PATH` points to a Cursor sandbox path, keep the
`env -u PLAYWRIGHT_BROWSERS_PATH` prefix in `config/prek.toml` for the
`smoke-test` hook.

## 2) Debug hooks independently from push

Run pre-push hooks directly:

```bash
TERM=dumb FORCE_COLOR=0 NO_COLOR=1 \
prek -c config/prek.toml run --stage pre-push --all-files --verbose 2>&1
```

Interpretation:

- If this command fails, fix the failing hook first.
- If this command passes, hook execution is not the root cause.

## 3) Debug the remote push handshake separately

Run traced push:

```bash
GIT_TRACE=1 GIT_TRACE_PACKET=1 git push --verbose --porcelain 2>&1
```

Look for:

- `unpack ok` and `ok refs/heads/<branch>` -> remote accepted update.
- `rejected` or `remote rejected` -> branch protection/permissions/policy issue.
- Auth or transport errors -> credential/SSH/network issue.

## 4) Confirm actual remote state

Never assume push outcome from one terminal line. Verify:

```bash
git status -sb
git ls-remote --heads origin dev
git log --oneline -3
```

Success means:

- `git status -sb` shows no `ahead` marker.
- `git ls-remote` for the branch shows the commit currently at local `HEAD`.

## 5) Known Cursor + Playwright pitfall

`config/prek.toml` intentionally includes:

```toml
entry = "env -u PLAYWRIGHT_BROWSERS_PATH npx playwright test --config config/playwright.config.ts -g smoke --reporter=line"
```

Do not remove this. In Cursor integrated terminal sessions, sandboxed
`PLAYWRIGHT_BROWSERS_PATH` values can point at browser binaries that do not
exist, causing smoke-test failures that look unrelated to push.

## 6) Fast triage order

Use this order every time:

1. Run direct pre-push hooks.
2. Run traced `git push`.
3. Verify remote branch SHA.
4. Only then change config or credentials.
