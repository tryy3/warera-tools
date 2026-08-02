<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Logging

This project uses [tslog v5](https://tslog.js.org/) for structured logging.

### Factories

- **Server:** dependency-injected via `createLogger` in `src/logging/` (full tslog).
- **Browser:** `src/web/logger.ts` (tslog/lite).

### Structured messages

Prefer structured fields plus a short message:

```ts
logger.info({ jobId, pollId, itemCount }, "price poll complete");
```

Do not default everything to `info`. Pick the level that matches operational severity (see [SRE School — log levels](https://sreschool.com/blog/log-level/)).

| Level | When to use |
| --- | --- |
| `silly` / `trace` | Rare; very verbose tracing only |
| `debug` | Diagnostic detail: HTTP bodies, SQL, retries, heartbeats |
| `info` | Normal lifecycle events (startup, job complete, user-facing actions) |
| `warn` | Recoverable problems (retries succeeded, deprecated paths) |
| `error` | Failures that need attention |
| `fatal` | Process cannot continue |

### Secrets

Respect `LOG_MASK_SECRETS` (default **on** in production). Set `LOG_MASK_SECRETS=false` only for local secret debugging.

### File sink

Optional `LOG_FILE=logs/app.log` enables a JSON file transport. Leave unset in normal development.
