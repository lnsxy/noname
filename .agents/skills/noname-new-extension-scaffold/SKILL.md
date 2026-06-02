---
name: noname-new-extension-scaffold
description: Scaffold a new noname extension package from an existing extension template, starting with package metadata and build files, so later work can focus on character data and skill code.
---

# Noname New Extension Scaffold

Use this skill when creating a brand-new extension package under `packages/extension/<name>` for this repository.

## Required Inputs

Before scaffolding, ensure the user has provided:

- Source folder: directory containing the source card JSON files and usually the image/material files. Read all `.json` files recursively under it, and use it as the default image/material search folder.
- Core package name: base package id used to form `new_<core_package_name>`, for example `standard`.
- Chinese package display name: used to form labels like `新-标包`.
- Character sort ordering: explicit user-provided ordering for `sort.ts`; any clear format is acceptable.

If any required input is missing, ask the user for the missing input before generating files. Keep the question narrow and ask only for the missing fields.

The extension naming convention is:

- Extension directory and in-game package name: `new_<core_package_name>`, for example `new_standard`.
- pnpm package name: `@noname-extension/new_<core_package_name>`.
- Display translation: `新-<中文包名>`, for example `新-标包`.

After this phase, the package should have the same build shape as existing extensions such as `packages/extension/new_standard` and `packages/extension/new_shenhua`.

Read all `.json` files under the specified source folder recursively. Do not broaden the search outside the specified folder. Process JSON files that contain usable `baseInfo`; report skipped JSON files that do not look like card exports.

## Package Metadata Scaffold

Prefer copying package-level files from an existing extension template, usually `packages/extension/new_standard`, then replace only the package-specific metadata.

Before creating the target package, check whether `packages/extension/<extension_name>` already exists. If it exists, stop and ask whether to merge into it or choose a different package name; do not overwrite an existing package silently.

Copy these files directly unless there is a concrete reason to change them:

- `package.json`
- `info.json`
- `vite.config.ts`
- `tsconfig.json`
- `LICENSE`
- `src/noname-shim.d.ts`

Do not copy generated or local-install artifacts from the template package:

- `node_modules/`
- package-local `pnpm-lock.yaml`
- built output under `apps/core/extension/<template_name>`

### `package.json`

Change only the package name by default:

```json
{
  "name": "@noname-extension/new_<core_package_name>"
}
```

Keep the existing scripts and dependencies unless the repository pattern changes:

```json
{
  "scripts": {
    "build": "vite build",
    "build:watch": "vite build --watch --mode development"
  },
  "dependencies": {
    "noname": "workspace:*"
  }
}
```

### `info.json`

Use the existing `info.json` schema from the template package. Do not invent new field names.

At minimum, update fields that identify the extension, typically:

- `name`: `new_<core_package_name>`
- display name or translation field, if present
- `version`, if the new package should start at a specific version
- `author`, only if it differs from the template

The `name` field is important because `vite.config.ts` uses it to choose the build output directory:

```ts
outDir: `../../../apps/core/extension/${info.name}`,
```

### `vite.config.ts`

Copy this file unchanged by default. It already handles:

- copying `info.json`
- copying `LICENSE`
- copying `image/` when present
- copying `audio/` when present
- outputting to `apps/core/extension/${info.name}`
- externalizing `noname`

Only edit this file if the new extension requires a different build layout.

### `tsconfig.json` and `LICENSE`

Copy these unchanged by default.

Copy `src/noname-shim.d.ts` unchanged when the template package has it. It is part of the TypeScript build scaffold, not character data.

## Extension Entrypoint

Copy `src/index.ts` from an existing extension template, usually `packages/extension/new_standard/src/index.ts`, and keep the module shape unchanged by default.

The entrypoint should keep these imports and package wiring:

```ts
import { lib, game, ui, get, ai, _status } from "noname";
import characters from "./character";
import characterTitles from "./characterTitle";
import characterSort from "./sort";
import skills from "./skill";
import { characterTranslates, skillTranslates } from "./translate";

export const type = "extension";
```

Keep these sections unless the new package has real card content or custom extension behavior:

- `editable: false`
- `connect: false`
- empty `content`, `precontent`, `config`, and `help`
- `character` package wiring from `characters`, `characterTitles`, `characterSort`, and `characterTranslates`
- empty `card` package
- `skill` package wiring from `skills` and `skillTranslates`
- `files: { character: [], card: [], skill: [], audio: [] }`

Change only package-specific identity fields by default:

```ts
name: "new_<core_package_name>",
package: {
  translation: "新-<中文包名>",
  intro: "由<来源包中文名或资料来源> JSON 资料整理出的新<中文包名>武将骨架。",
  author: "无名玩家",
  version: "1.0",
}
```

For example, `new_standard` uses:

```ts
name: "new_standard",
translation: "新-标包",
intro: "由标包 JSON 资料整理出的新标包武将骨架。",
```

Do not implement skill logic, card logic, or custom lifecycle behavior in `src/index.ts` during scaffold creation.

## Character Definition Extraction

When given a card JSON file, treat `baseInfo` as the authoritative source for character data. Treat `materialList` and rendering-related sections as card-making metadata only; use them only as fallback evidence for images or visible text.

Do not trust `materialList` over `baseInfo`. These exports can contain stale or duplicated visual layers. For example, a `SKILLS_NAME` layer may contain unrelated text and must not override `baseInfo.skills`.

Generate `src/character.ts` entries in object form:

```ts
const characters: importCharacterConfig["character"] = {
  new_package_character_code: {
    sex: "male",
    group: "wei",
    hp: 3,
    maxHp: 3,
    skills: ["new_package_skill_a", "new_package_skill_b"],
    img: "extension/new_package/image/character/new_package_character_code.png",
  },
};
```

### Character Id

Use this id shape:

```text
<extension_name>_<character_code>
```

For example:

```text
new_standard_zhangliao
```

Generate `character_code` from the original Chinese character name pinyin by default.

Do not use `baseInfo.eName`; it can be unrelated to the actual character. For example, a card for `曹植` may contain `eName: "Yunchang"`, which must not become `new_package_yunchang`.

Use the historical figure's conventional Chinese pronunciation for pinyin conversion. Do not add a pinyin conversion script or dependency just for scaffolding.

Before writing files, check for duplicate generated character ids within the batch. If two Chinese character names generate the same code, report the conflict and require a manual code override for at least one of them.

### Field Mapping

Map JSON fields to `character.ts` like this:

- `baseInfo.name` -> character translation source, not the id by itself.
- `baseInfo.title` -> `characterTitle.ts` later.
- `baseInfo.kingdom` -> `group`, lowercased and mapped to noname group ids such as `wei`, `shu`, `wu`, `qun`, `jin`, `shen`, or `ye`.
- `baseInfo.hp` -> `hp`.
- `baseInfo.maxHp` -> `maxHp`.
- `baseInfo.masterFlag` -> `isZhugong: true` when true.
- `baseInfo.skills[].name` -> skill translation source and skill id generation source.
- `baseInfo.skills[].desc` -> skill info translation source and implementation comment source.
- `baseInfo.pic` -> preferred image source URL.

If `baseInfo.doubleKingdomFlag` is true and `baseInfo.doubleKingdom` is non-empty:

- Keep `group` as the primary `baseInfo.kingdom` group.
- Add `doubleGroup: [...]` using the lowercased mapped `doubleKingdom` values.

If `shield`, `nationHp`, `nationSubHp`, `relation`, `legendId`, `quality`, `copyright`, or printing/layout data are present, do not put them into `character.ts` unless there is an established local field for that data. Preserve them only in notes if needed.

### Missing Or Conflicting Data

Handle missing data conservatively:

- If sex is absent from the JSON, resolve it from an existing trusted character source by matching the Chinese name. If no trusted source exists, report the missing sex instead of guessing.
- If `baseInfo.kingdom`, `otherConfig.frame.src`, and visual `KINGDOM` layers disagree, prefer `baseInfo.kingdom` and report the conflict.
- If `baseInfo.skills` and visual `SKILLS_NAME` / `SKILLS_DESC` layers disagree, prefer `baseInfo.skills` and report the conflict.
- If `baseInfo.pic` and `LEGEND_IMAGE` disagree, prefer `baseInfo.pic` and report the conflict.
- If `hp` and `maxHp` are missing, report the character as incomplete.

### Example Mapping

Given a JSON whose `baseInfo` contains:

```json
{
  "name": "曹植",
  "title": "八斗之才",
  "masterFlag": false,
  "hp": 3,
  "maxHp": 3,
  "kingdom": "WEI",
  "skills": [
    { "name": "落英", "desc": "..." },
    { "name": "酒诗", "desc": "..." }
  ]
}
```

And given an explicit character code `caozhi` for extension `new_example`, generate:

```ts
new_example_caozhi: {
  sex: "male",
  group: "wei",
  hp: 3,
  maxHp: 3,
  skills: ["new_example_luoying", "new_example_jiushi"],
  img: "extension/new_example/image/character/new_example_caozhi.png",
}
```

Only include `sex: "male"` if it was resolved from trusted data; the shown value is not inferred from the JSON alone.

## JSON-Derived Source Files

After receiving the character JSON files, generate these files from the same parsed `baseInfo` records:

- `src/character.ts`
- `src/characterTitle.ts`
- `src/translate.ts`
- `src/skill.ts`

Do this as one coherent pass so character ids, skill ids, translations, and comments stay aligned.

### `characterTitle.ts`

Generate `characterTitle.ts` from `baseInfo.title`.

Use the final character id as the key:

```ts
const characterTitles: NonNullable<importCharacterConfig["characterTitle"]> = {
  new_example_caozhi: "八斗之才",
};

export default characterTitles;
```

If `baseInfo.title` is empty, omit that character from `characterTitle.ts` instead of inventing a title.

### `translate.ts`

Generate `translate.ts` with separate `characterTranslates` and `skillTranslates` exports, then default-export their merge.

The character translation block should include:

- package translation: `<extension_name>: "新-<中文包名>"`
- group translations that are explicitly used by generated sorting groups, such as `<extension_name>_wei: "新-<中文包名>·魏"`
- character translations from `baseInfo.name`

Example:

```ts
export const characterTranslates = {
  new_example: "新-示例包",
  new_example_wei: "新-示例包·魏",

  new_example_caozhi: "曹植",
};
```

The skill translation block should include one name key and one `_info` key for each skill in `baseInfo.skills`:

```ts
export const skillTranslates = {
  new_example_luoying: "落英",
  new_example_luoying_info: "当其他角色的一张梅花牌因弃置，判定或打出而进入弃牌堆时，你可以获得之。",
  new_example_jiushi: "酒诗",
  new_example_jiushi_info: "当你需要使用【酒】时，若你的武将牌正面向上，你可以翻面，视为使用一张【酒】。当你受到伤害后，若你的武将牌背面向上，你可以翻面。当你使用【酒】后，你本回合使用【杀】次数上限+1。",
};

export default {
  ...characterTranslates,
  ...skillTranslates,
};
```

Prefer `baseInfo.skills[].desc` for `_info`. Use `materialList` skill description layers only to report conflicts or fill a missing description after clearly marking it as a fallback.

### Skill Ids

Skill ids must use this shape:

```text
<extension_name>_<skill_code>
```

Generate `skill_code` from the original Chinese skill name pinyin by default.

Use the conventional pronunciation for pinyin conversion. Do not add a pinyin conversion script or dependency just for scaffolding.

Before writing files, check for duplicate generated skill ids within the batch:

- If the same Chinese skill name appears more than once with the same description, reuse the same generated skill id.
- If the same Chinese skill name appears with different descriptions, report a conflict and require a manual skill code override or clarification.
- If different Chinese skill names generate the same pinyin code, report a conflict and require a manual skill code override for at least one of them.

Do not use visual `SKILLS_NAME` layers or unrelated source fields to generate final skill ids.

### `skill.ts`

Generate `skill.ts` with all skill keys present, but do not implement behavior yet.

Each placeholder must include a concise comment containing the Chinese skill name and original description from `baseInfo.skills[].desc`. This makes the remaining work only the skill implementation.

Example:

```ts
import { _status, game, get, lib, ui } from "noname";

const skills = {
  /**
   * 落英
   * 效果：当其他角色的一张梅花牌因弃置，判定或打出而进入弃牌堆时，你可以获得之。
   * TODO: implement
   */
  new_example_luoying: {
    audio: false,
  },

  /**
   * 酒诗
   * 效果：当你需要使用【酒】时，若你的武将牌正面向上，你可以翻面，视为使用一张【酒】。当你受到伤害后，若你的武将牌背面向上，你可以翻面。当你使用【酒】后，你本回合使用【杀】次数上限+1。
   * TODO: implement
   */
  new_example_jiushi: {
    audio: false,
  },
};

export default skills;
```

Keep placeholder objects minimal. Do not add triggers, filters, AI, subskills, or inherited skills unless they are copied from a confirmed existing implementation as part of an explicit later skill-implementation task.

### `sort.ts`

`sort.ts` is generated from explicit user-provided ordering, not inferred freely from JSON order unless the user says JSON order is authoritative.

The user decides the ordering. Accept any clear user-provided format. One convenient format is Chinese character names grouped by target package group:

```json
{
  "wei": ["曹植", "夏侯惇"],
  "shu": ["关羽"],
  "wu": [],
  "qun": []
}
```

Convert Chinese names to generated character ids when writing `sort.ts`.

If the user gives final character ids, use them directly. If the user gives a prose ordering or a flat list and the intended groups/order are clear, follow it. Ask only when the ordering is ambiguous or references characters that were not generated.

If the user explicitly defers ordering, leave `sort.ts` as a minimal package/group scaffold with empty arrays and report it as pending. Otherwise, ask for ordering before generating files.

Do not guess final character order from file order, kingdom, title, rarity, or `legendId` unless instructed.

## Image Resource Lookup

The image source is the source folder by default, or a separate image/material folder when the user provides one. It is not the remote URL by default.

For each character:

1. Use `baseInfo.name` as the primary search term.
2. Search only within the selected local image/material folder.
3. Use a plain `rg` search with the character name and that folder.
4. Copy the selected image into the extension package as `image/character/<character_id>.<ext>`.
5. Set `character.ts` `img` to `extension/<extension_name>/image/character/<character_id>.<ext>`.

Use the direct search shape:

```sh
rg "<character Chinese name>" <source-or-image-folder>
```

If multiple candidate images are found, do not choose silently unless one is clearly exact. Report the candidates and require explicit selection.

If no local image is found, report the missing image. Do not download from `baseInfo.pic` unless the user explicitly asks to use remote URLs as a fallback.

The remote `baseInfo.pic` is still useful as provenance and conflict evidence, but local folder search is the normal workflow.

## TODO Tracking

After generating `character.ts`, `characterTitle.ts`, `sort.ts`, `translate.ts`, and `skill.ts`, update the repository-level TODO tracking so later agents can see which generated character skills still need implementation.

Update only the repository root `TODO.md` with a bounded section for the new extension. Do not overwrite unrelated existing TODO content. Prefer markers so the section can be replaced safely on regeneration:

```md
<!-- BEGIN <extension_name> TODO -->
...
<!-- END <extension_name> TODO -->
```

The TODO section is only for generated character skill completion. Do not duplicate completed package metadata, source JSON paths, image paths, build output, or other scaffold details that are already present in the generated package files.

The TODO section should include:

- a short status sentence that the package skeleton, character data, sorting, translations, and images have already been generated
- minimal file pointers for later work: extension source directory, generated character skill implementation file, character binding file, and translation file
- any manual id decisions needed for later skill work, especially duplicate Chinese character names that required manual ids
- character list in the same order as generated `sort.ts`
- for every character: final character id, Chinese name, and title when present
- for every skill: an unchecked checkbox, final skill id, Chinese skill name, and the original `baseInfo.skills[].desc` effect text

Do not create or maintain a separate TODO inside `packages/extension/<extension_name>` or under the extension source tree unless the user explicitly asks for it. The root `TODO.md` is the single tracking document.

## Final Report

At the end of scaffolding, report the outcome and every issue found during the process. Do not try to pre-model every possible edge case in the skill; surface concrete problems encountered while processing the actual input.

The final report should include:

- extension name and source folder
- number of JSON files read
- number of characters generated
- number of skills generated
- missing or unresolved character sex values
- duplicate character id conflicts
- duplicate or conflicting skill id conflicts
- JSON data conflicts, such as `baseInfo` disagreeing with visual layers
- missing images or ambiguous image candidates from `rg`
- whether `sort.ts` was generated from explicit ordering or left pending
- whether root `TODO.md` was created or updated
- any files intentionally left incomplete

If source files are complete enough to build, run:

```sh
pnpm -F @noname-extension/<extension_name> build
```

Then report whether the build passed and whether `apps/core/extension/<extension_name>/extension.js` was produced.

The desired end state is: package scaffolding is complete, and the only expected remaining work is implementing the generated character skills tracked in the root `TODO.md`.

## Validation For This Phase

After copying and editing package metadata and the entrypoint:

1. Confirm `package.json.name` matches `@noname-extension/<extension_name>`.
2. Confirm `info.json.name` matches the extension directory name.
3. Confirm `vite.config.ts` still reads `info.name` for `outDir`.
4. Confirm `src/index.ts` return object `name` matches the extension directory name.
5. Confirm `src/index.ts` still wires `character`, `card`, and `skill` packages in the template shape.
6. Confirm every generated character id starts with `<extension_name>_`.
7. Confirm character ids were generated from original Chinese-name pinyin unless manually overridden.
8. Confirm there are no duplicate generated character ids, or every duplicate is reported.
9. Confirm every generated character has `sex`, `group`, `hp`, `maxHp`, `skills`, and `img`.
10. Confirm double-kingdom characters use `doubleGroup`, not an array-valued `group`.
11. Confirm every `baseInfo.title` value appears in `characterTitle.ts`, unless empty.
12. Confirm every generated character has a `characterTranslates` entry.
13. Confirm every generated skill id starts with `<extension_name>_`.
14. Confirm skill ids were generated from original Chinese skill-name pinyin unless manually overridden.
15. Confirm same-name skills with different descriptions and pinyin-code collisions are reported before writing final files.
16. Confirm every generated skill has a `skillTranslates` name entry and `_info` entry.
17. Confirm every generated skill in `character.ts` exists as a placeholder in `skill.ts`.
18. Confirm `sort.ts` was generated only from explicit ordering or is clearly left pending.
19. Confirm every generated `img` path points at an image found under the selected source or image/material folder, or is reported missing.
20. Confirm root `TODO.md` has a bounded section for the extension, tracks only generated character skill completion, includes each skill effect, and does not remove unrelated TODO content.
21. Confirm no duplicate TODO is created inside the extension package unless the user explicitly requested one.
22. Do not run or require full extension build validation until source files are generated.
