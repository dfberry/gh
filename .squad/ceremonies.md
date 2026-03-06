# Ceremonies

> Team meetings that happen before or after work. Each squad configures their own.

## Design Review

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | before |
| **Condition** | multi-agent task involving 2+ agents modifying shared systems |
| **Facilitator** | lead |
| **Participants** | all-relevant |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Review the task and requirements
2. Agree on interfaces and contracts between components
3. Identify risks and edge cases
4. Assign action items

---

## Code Review Gate

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | after |
| **Condition** | implementation batch completes (any agent writes source code) |
| **Facilitator** | lead |
| **Participants** | lead (reviewer) + original authors (on standby for lockout-routed fixes) |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Lead reviews all new/modified source files (not .squad/ files)
2. Runs tests and build verification
3. Checks: types, DRY, ESM compliance, test coverage, conventions
4. Verdict: APPROVE → ship. REJECT → route fixes per lockout rules, then re-review.
5. Loop until approved. Coordinator drives — user doesn't need to ask.

---

## Retrospective

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | after |
| **Condition** | build failure, test failure, or reviewer rejection |
| **Facilitator** | lead |
| **Participants** | all-involved |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. What happened? (facts only)
2. Root cause analysis
3. What should change?
4. Action items for next iteration
