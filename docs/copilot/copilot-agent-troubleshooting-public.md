# GitHub Copilot Coding Agent – Troubleshooting Guide

This document helps contributors diagnose why **GitHub Copilot Coding Agent** may not respond to issue comments or stop updating pull requests.

---

## Most Common Cause

Copilot Coding Agent runs **via GitHub Actions**. If Actions cannot write to the repository, Copilot will appear to "stall".

---

## Quick Checklist

- ✅ GitHub Actions enabled
- ✅ Workflow permissions set to **Read and write**
- ✅ GitHub Actions allowed to approve PR reviews
- ✅ Copilot Coding Agent enabled for this repo

---

## UI Click Path (Repo Admins)

**Repository → Settings → Actions → General**

- Enable Actions
- Allow all actions (or org-approved)

**Workflow permissions**

- ✅ Read and write permissions
- ✅ Allow Actions to approve pull requests

**Repository → Settings → Copilot**

- ✅ Enable Copilot Coding Agent

---

## Retrying Copilot

After fixing settings:

1. Add a **new issue comment** with a concrete instruction, or
2. Unassign and reassign Copilot to the issue

Copilot does not always re-read older comments.
