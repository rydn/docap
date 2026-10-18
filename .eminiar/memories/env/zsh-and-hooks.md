---
name: env/zsh-and-hooks
kind: fact
tags: []
related: []
created: 2026-10-18T13:45:12.762Z
updated: 2026-10-18T13:45:12.762Z
---

Dev environment gotchas: the shell is zsh — an unquoted $var does NOT word-split (use ${=var} or arrays), and globs with '?' must be quoted (e.g. gh api 'repos/...?recursive=1'). The eminiar PreToolUse hook blocks Bash commands it predicts are verbose (tests, git show, multi-step heredocs + runs) — the whole command is rejected and nothing runs; write files with Write/Edit and run noisy commands via em_execute.
