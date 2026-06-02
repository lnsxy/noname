---
name: noname-character-skill-implementation
description: Implement or update noname character skills, especially extension-owned skills under packages/extension/new_standard, by first clarifying the skill text, searching core implementations with rg, reusing exact matches, and adapting existing engine patterns.
---

# Noname Character Skill Implementation

Use this skill when implementing, updating, reviewing, or planning character skill logic for this repository, especially skills in `packages/extension/<name>/src/skill.ts`.

## Workflow

Before implementing any skill, understand the intended effect from the skill description. Decompose the text into:

- timing
- actor
- condition
- cost
- target or card selection
- effect
- limit rule
- cleanup rule

If the description is ambiguous, incomplete, or can map to multiple valid engine timings or behaviors, stop and discuss it with the user until the expected behavior is clear enough to implement.

## Search Existing Skills First

First search the core package with `rg` using the skill pinyin:

```sh
rg -n "<skill_pinyin>" apps/core/character
```

Also check common prefixed variants such as `re`, `ol`, `sb`, `xin`, `new`, `dc`, `mb`, `jd`, and `ty`.

If pinyin search is insufficient, search by the Chinese skill name in core translate files:

```sh
rg -n "<技能中文名>" apps/core/character
```

When a candidate appears, inspect the related `skill.js`, `translate.js`, and `character.js` entries to confirm which character and skill version it belongs to.

## Reuse Policy

- If an existing core skill exactly matches the desired behavior, reuse that skill directly in `character.ts` instead of duplicating or modifying it.
- If the behavior is identical but the extension needs its own skill id, prefer `inherit` or copy the original skill object with only identifier, storage key, prompt, and translation changes.
- If the behavior is nearly identical, use the closest core implementation as the base and change only the necessary effect differences.
- If no useful implementation exists, find a skill with the same implementation shape: triggered skill, active skill, viewAs skill, locked mod skill, limited skill, mark/storage skill, or grouped subskill.

## Implementation Rules

- Keep extension-owned skills prefixed with the extension name, for example `new_standard_`.
- Keep storage keys, temp skill names, subskill names, and translate keys consistent with the skill id.
- Prefer the async style already used in `packages/extension/new_standard/src/skill.ts`.
- Add or update translations in `src/translate.ts` whenever a skill key, subskill prompt, mark, or intro is user-visible.
- Keep edits scoped to the requested extension unless the user explicitly asks for core changes.
- After implementing extension skill logic, build the package, for example:

```sh
pnpm -F @noname-extension/new_standard build
```
