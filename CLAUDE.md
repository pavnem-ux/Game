# CLAUDE.md

All shared project rules live in [AGENTS.md](AGENTS.md) and apply to Claude Code without exception.
Do not duplicate or override them here.

@AGENTS.md

## Claude Code specifics

- Claude Code is the primary developer; OpenAI Codex reviews PRs; the project owner approves
  gameplay and merges. Never merge, self-approve or start an unrequested task (e.g. Task 07).
- Workflow details: [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md).
- In cloud sessions the browser tests need `CHROMIUM_PATH` pointing to the pre-installed Chromium
  (for example `/opt/pw-browsers/chromium-*/chrome-linux64/chrome`).
- When addressing review findings, fix only what the finding requires, add a regression test where
  applicable, reply on the review thread with what changed, and re-run the checks from AGENTS.md §6.
