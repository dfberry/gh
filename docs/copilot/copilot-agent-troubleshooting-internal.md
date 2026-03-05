# Copilot Coding Agent – Internal Ops Guide

Audience: Repo admins, org owners, enterprise admins

---

## Architecture Note

Copilot Coding Agent executes as a **GitHub Actions workflow**. Required permissions:

- Repository write access
- PR creation and update
- PR review approval (optional but recommended)

---

## Enterprise Failure Modes

Copilot may be blocked even when repo settings are correct:

- Organization-level Copilot policy disables coding agent
- Enterprise-level policy opts out repository
- Actions restricted to selected workflows

---

## Org-Level UI Path

**Organization → Settings → Copilot → Coding agent**

- Ensure coding agent is enabled
- Ensure repository is not excluded

---

## Enterprise-Level UI Path

**Enterprise → Settings → Copilot → Policies**

- Ensure coding agent is allowed
- Ensure repo is not opted out

> Repo admins cannot override enterprise policy

---

## Standard Fix Order

1. Enterprise policy
2. Org policy
3. Repo Copilot toggle
4. Repo Actions permissions

---

## Automation

Use the provided GitHub CLI verification script to enforce repo-level settings.
