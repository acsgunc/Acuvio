# Feature 03 — Syntax Highlighting & Language Registry

**Phase:** 5 (Syntax Highlighting)
**Status:** ✅ Delivered

Per-language syntax highlighting for editable documents, built on a pluggable,
lazily-loaded language registry so new languages can be added without touching
the editor.

---

## 1. Overview

Editable documents now highlight syntax based on the file's extension (or a
manual override). The design goal from the roadmap was explicit:

> Design the syntax highlighting engine so additional languages can be added
> easily.

This is realized as a **`LanguageRegistry`** service: a table of
`LanguageDefinition`s, each with a **lazy loader** that dynamically imports its
grammar only when first needed. Adding a language is one registry entry — the
editor component is never modified.

### Supported languages (built-in)

JavaScript, TypeScript, Python, Rust, HTML, XML, JSON, YAML, SQL, CSS,
Markdown, C/C++, Java, Go, PHP (dedicated `lang-*` packages), plus C#,
PowerShell, and Shell/Bash via `@codemirror/legacy-modes` stream parsers.

---

## 2. Architecture

```
 file path ──> LanguageRegistry.detect(path) ──> LanguageDefinition (id)
                                                       │
 status-bar picker ──(manual override)───────────────┤
                                                       ▼
                       TextEditorComponent.languageId (@Input)
                                                       │
                            LanguageRegistry.resolve(id)  ── lazy import() ──┐
                                                       │                      │
                            languageCompartment.reconfigure(extension) <──────┘
                                                       ▼
                                        CodeMirror highlights the document
```

### Lazy loading

Each definition's `load()` is a `() => import('@codemirror/lang-x')` thunk.
The Angular build code-splits these into separate chunks (verified in the build
output), so the initial bundle stays small and a grammar is fetched only when a
matching file is opened. Resolved extensions are cached by id in the registry.

### Concurrency safety

`TextEditorComponent.applyLanguage(id)` re-checks that `id` is still the active
language after the async load completes, discarding stale results when the user
switches languages/tabs mid-load.

---

## 3. Files

| File | Role |
| --- | --- |
| [`src/app/services/language-registry.service.ts`](../../src/app/services/language-registry.service.ts) | Registry: definitions, detection by extension/filename, lazy resolve + cache. |
| [`src/app/components/text-editor/text-editor.component.ts`](../../src/app/components/text-editor/text-editor.component.ts) | `languageId` input → resolves via registry → language compartment. |
| [`src/app/components/status-bar/status-bar.component.ts`](../../src/app/components/status-bar/status-bar.component.ts) | Language picker (edit mode only) + `languageChange` output. |
| [`src/app/app.component.ts`](../../src/app/app.component.ts) | Per-tab `languageId`, auto-detect on open/save-as, picker handler. |
| [`src/app/app.component.html`](../../src/app/app.component.html) | Binds `languageId` and the status-bar picker. |

---

## 4. Public API

### `LanguageDefinition`

```ts
interface LanguageDefinition {
  id: string;                       // "typescript"
  label: string;                    // "TypeScript"
  extensions: readonly string[];    // ["ts","tsx",...]
  filenames?: readonly string[];    // exact names, e.g. ".bashrc"
  load: () => Promise<Extension>;   // lazy grammar loader
}
```

### `LanguageRegistry`

```ts
register(def: LanguageDefinition): void;            // add/override (extensibility seam)
list(): LanguageDefinition[];                        // sorted by label
getById(id: string): LanguageDefinition | undefined;
detect(path: string): LanguageDefinition | undefined;       // by filename then extension
resolve(id: string): Promise<ResolvedLanguage | undefined>; // lazy-load + cache
resolveForPath(path: string): Promise<ResolvedLanguage | undefined>;
```

### Adding a new language

```ts
registry.register({
  id: 'toml',
  label: 'TOML',
  extensions: ['toml'],
  load: async () => (await import('@codemirror/lang-toml')).toml(),
});
```

No change to `TextEditorComponent` or `AppComponent` is required — the new
language appears in the picker and auto-detection immediately.

---

## 5. Key Decisions & Trade-offs

- **Registry + lazy loaders** over a static `switch`: matches the roadmap's
  extensibility requirement, keeps the initial bundle small (grammars are
  code-split), and lets future plugins contribute languages via `register()`.
- **Detection precedence**: exact filename first (`Dockerfile`, `.bashrc`), then
  extension — handles extension-less, well-known files.
- **Compartment-based application**: switching language never rebuilds the
  document or loses editor state.
- **Highlighting is edit-mode only**: the GB-log viewer keeps its bespoke
  severity highlighter (`log-highlight.ts`), which is tuned for log semantics,
  not source grammar.
- **Legacy modes** for C#/PowerShell/Bash: these lack dedicated `lang-*`
  packages, so `StreamLanguage.define(...)` from `@codemirror/legacy-modes`
  bridges them behind the same `LanguageDefinition` contract.

---

## 6. Testing

- `npm run build` confirms the registry, dynamic imports, and bindings compile;
  the build log shows per-language **lazy chunks** (e.g. `clike`, language
  `index` chunks), proving code-splitting works.
- Manual: open files of varying extensions and confirm highlighting; use the
  status-bar picker to override and confirm live re-highlight.

---

## 7. Future Work

- Persist a per-file-extension → language association in settings.
- Language-aware features that build on the grammar: auto-completion sources,
  folding-by-syntax in the viewer, outline/symbol view (Phase 6).
- Detect language from shebang (`#!/bin/bash`) for extension-less scripts.
- Allow plugins to contribute `LanguageDefinition`s once the plugin host
  exists (Phase 8).
