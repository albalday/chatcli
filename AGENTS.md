# Codex instructions for ZeroChat

Read and follow `AGENT_GUIDELINES.md` before modifying this repository.

## Automatic model routing

Optimize for the lowest-cost model that can complete the task reliably. Do not
ask the user to choose a model for routine work.

The main session defaults to `gpt-5.6-terra` with medium reasoning. When the
runtime supports model-specific subagents, route independent, bounded work as
follows:

- Use `gpt-5.6-luna` with low reasoning for repository searches, summaries,
  documentation, mechanical edits, test execution, and clearly scoped changes
  with an obvious expected result.
- Use `gpt-5.6-terra` with medium reasoning for normal planning,
  implementation, debugging, tool use, and changes spanning a small number of
  modules.
- Use `gpt-5.6-terra` with high reasoning for multi-module bugs or plans with
  meaningful tradeoffs before escalating to Sol.
- Use `gpt-5.6-sol` with high reasoning for ambiguous architecture work,
  security-sensitive changes, major refactors, difficult cross-cutting bugs,
  or final review of high-risk changes.

Keep work in the current session when delegation would require repeating a
large amount of context or cost more than completing the task directly.

Escalate one tier when any of these conditions applies:

- Two well-founded attempts have failed.
- The change can cause data loss, expose credentials, or weaken sandboxing.
- The task crosses the agent loop, provider streaming, tool dispatch, and RAG
  persistence boundaries.
- Requirements remain materially ambiguous after inspecting the repository.

After escalation, return to the cheapest suitable tier for mechanical fixes,
tests, bundling, and documentation. Reserve `xhigh` for exceptional difficult
work and do not use `max`, pro, or ultra modes unless the user requests them or
measured results justify their additional cost.

If model-specific delegation is unavailable, continue with the active model
and apply the closest corresponding reasoning effort. Never claim that the
main session model changed when the runtime did not change it.
