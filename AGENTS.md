# AGENTS.md

This file defines the working agreement for coding agents in this repository. It applies to the entire repository unless a more specific `AGENTS.md` exists in a subdirectory.

## Project status

This repository contains a zero-dependency static Web game built with HTML, CSS, and modern JavaScript modules. Node.js is used for the local development server and built-in test runner.

## Instruction precedence

Follow instructions in this order:

1. The user's explicit request.
2. The closest applicable `AGENTS.md` file.
3. Repository documentation and checked-in configuration.
4. Existing code conventions.
5. The defaults in this file.

If instructions conflict or a choice would materially affect product behavior, security, compatibility, or architecture, explain the conflict and ask before proceeding.

## Working principles

- Inspect the repository before making changes. Read relevant manifests, configuration, documentation, and nearby code first.
- Keep changes focused on the requested outcome. Avoid unrelated cleanup, broad rewrites, dependency upgrades, or speculative abstractions.
- Preserve existing behavior unless the task explicitly changes it.
- Prefer simple, readable implementations over clever ones.
- Reuse established project patterns before introducing new tools or conventions.
- Do not edit generated files directly when a documented generation workflow exists.
- Do not overwrite or discard user changes. Treat a dirty working tree as intentional unless proven otherwise.
- Never commit secrets, credentials, tokens, private keys, production data, or sensitive personal information.

## Repository layout

- `src/content/`: structured story records, profiles, locations, aliases, and answers.
- `src/engine/`: pure search, unlock, fact, and persistence logic.
- `src/ui/`: presentation styles.
- `test/`: Node built-in test suite.
- `scripts/`: development server and content validation.
- `docs/`: game design, canonical story facts, and puzzle dependency documentation.

## Commands and dependencies

```text
Install:    none (zero dependencies)
Develop:    npm run dev
Lint:       not configured
Type-check: not configured
Test:       npm test
Build:      not required (static source is deployable as-is)
Check:      npm run check
```

## Implementation standards

- Match the formatting, naming, module boundaries, and error-handling style of adjacent code.
- Keep functions and modules cohesive; extract helpers only when they clarify behavior or enable meaningful reuse.
- Validate data at system boundaries. Handle failures explicitly and provide actionable error messages without leaking sensitive details.
- Avoid hidden global state and unnecessary side effects.
- Maintain backward compatibility for public interfaces unless a breaking change is explicitly requested and documented.
- Add comments for rationale, invariants, or non-obvious constraints—not to restate straightforward code.
- Keep documentation and examples synchronized with behavior.

## Testing and verification

- Add or update tests for every behavior change where the project has a test framework.
- Cover the main success path, relevant edge cases, and failure behavior.
- Prefer deterministic tests. Do not rely on real external services, wall-clock timing, or shared mutable state when a controlled substitute is practical.
- For bug fixes, add a regression test that fails before the fix when feasible.
- Run the narrowest relevant checks during development, then the broader applicable suite before handoff.
- If no test framework exists, do not introduce one solely for a trivial change; perform the best available verification and state what remains unverified.
- Never claim a command passed unless it was actually run successfully.

## Git and change hygiene

- Review `git status` and the relevant diff before and after editing.
- Keep commits logically scoped when the user asks for commits.
- Follow the repository's configured commit convention: `type(scope): summary`, using an imperative summary and an appropriate type such as `feat`, `fix`, `docs`, `style`, `refactor`, `test`, or `chore`.
- Do not amend, rebase, force-push, reset, delete branches, or otherwise rewrite history unless the user explicitly requests it.
- Do not commit build artifacts, caches, local environment files, or editor metadata unless the project intentionally tracks them.

## Security and configuration

- Store environment-specific values outside source control and provide safe example configuration when needed.
- Apply least privilege to filesystem, network, and service access.
- Sanitize untrusted input and avoid unsafe command construction, dynamic evaluation, and insecure deserialization.
- Do not weaken authentication, authorization, validation, or transport security merely to make tests pass.
- Flag security-sensitive assumptions and unresolved risks in the handoff.

## Completion criteria

A task is complete when:

- The requested behavior is implemented with focused changes.
- Relevant tests and checks pass, or any inability to run them is clearly reported.
- Documentation and configuration are updated when behavior or setup changed.
- The final diff contains no accidental debug code, secrets, unrelated formatting churn, or generated noise.
- The handoff summarizes what changed, how it was verified, and any remaining risks or follow-up work.

## Maintaining this file

Update `AGENTS.md` whenever the repository adopts or changes its technology stack, directory structure, development commands, code conventions, test strategy, CI requirements, or release process. Replace generic guidance with concrete, repository-specific instructions as soon as those conventions exist.
