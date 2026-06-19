# Notepad++ Feature Catalog (Parity Reference)

> Source: extracted from the Notepad++ source tree at `D:\work\poc\notepad-plus-plus`
> (Notepad++ v8.9.x). The authoritative command list lives in
> `PowerEditor/src/menuCmdID.h`; menu structure and labels in
> `PowerEditor/src/Notepad_plus.rc`; command handling in
> `PowerEditor/src/Notepad_plus.cpp`; resource IDs in `PowerEditor/src/resource.h`.

This document is the **parity reference** for Acuvio's evolution from a GB-scale
log viewer into a Notepad++-class editor. Each feature is tagged with its current
Acuvio status so we can track coverage increment by increment.

Status legend:

| Tag | Meaning |
| --- | --- |
| ✅ Done | Implemented and test/build verified in Acuvio |
| 🟡 Partial | Some of the feature exists; gaps remain |
| ⛔ Not yet | Not started |
| ➖ N/A | Out of scope (Windows-only / plugin host / etc.) |

For the per-increment delivery record and the rolled-up parity matrix, see
[DEVELOPMENT.md](DEVELOPMENT.md).

---

## File menu (`IDM_FILE_*`)

| Feature | Acuvio status |
| --- | --- |
| New | ✅ Done |
| Open… | ✅ Done |
| Open Containing Folder → Explorer / cmd / Folder as Workspace | ⛔ Not yet |
| Open in Default Viewer | ⛔ Not yet |
| Open Folder as Workspace… | ⛔ Not yet |
| Reload from Disk | 🟡 Partial (viewer reloads on tail; explicit reload TBD) |
| Save / Save As / Save a Copy As… | 🟡 Partial (Save + Save As done; Save a Copy As TBD) |
| Save All | ⛔ Not yet |
| Rename… | ⛔ Not yet |
| Close / Close All | 🟡 Partial (tab close done; Close All TBD) |
| Close Multiple (but Active / but Pinned / to Left / to Right / Unchanged) | ⛔ Not yet |
| Move to Recycle Bin | ⛔ Not yet |
| Load Session… / Save Session… | ⛔ Not yet |
| Print / Print Now | ⛔ Not yet |
| Recent files list | ⛔ Not yet |
| Exit | ✅ Done (window close) |

## Edit menu (`IDM_EDIT_*`)

| Feature | Acuvio status |
| --- | --- |
| Undo / Redo | ✅ Done (CodeMirror history) |
| Cut / Copy / Paste / Delete | ✅ Done |
| Select All | ✅ Done |
| Begin/End Select (+ column variants) | ⛔ Not yet |
| Insert → Date/Time (short/long/custom) | 🟡 Partial (short/long done; custom format TBD) |
| Copy to Clipboard → full path / filename / dir / all paths | 🟡 Partial (path/name/dir done; all-paths TBD) |
| Indent → increase / decrease | ✅ Done |
| Convert Case → UPPER / lower / Proper / Sentence / iNVERT / raNDom | 🟡 Partial (UPPER/lower/Proper/Sentence/Invert done; Random TBD) |
| Line Ops → Duplicate / Move Up / Move Down | ✅ Done |
| Line Ops → Remove Duplicate Lines (global / consecutive) | ✅ Done |
| Line Ops → Split / Join | 🟡 Partial (Join done; Split TBD) |
| Line Ops → Remove Empty Lines (+ blank-char variant) | ✅ Done |
| Line Ops → Insert Blank Line Above / Below | ✅ Done |
| Line Ops → Sort (lexicographic asc/desc, integer, decimal, length) | 🟡 Partial (lexicographic, ignore-case, integer, length done; decimal comma/dot TBD) |
| Line Ops → Randomize / Reverse | ✅ Done |
| Comment / Uncomment (line toggle + block) | 🟡 Partial (line toggle done; block TBD) |
| Auto-Completion (function / word / path / param hint) | ⛔ Not yet |
| EOL Conversion → Windows (CRLF) / Unix (LF) / Mac (CR) | ✅ Done |
| Blank Ops → Trim leading/trailing/both, EOL→space, Tab↔Space | ✅ Done |
| Paste Special (HTML / RTF / binary) | ⛔ Not yet |
| On Selection (open file / containing folder / redact / search web) | ⛔ Not yet |
| Multi-Select / Multi-Editing (all / next, undo / skip) | 🟡 Partial (CM multi-cursor basics) |
| Column Mode / Column Editor (rect edit + number sequence) | ⛔ Not yet |
| Character Panel (ASCII / Unicode insert) | ⛔ Not yet |
| Clipboard History panel | ⛔ Not yet |
| Read-Only toggle | ⛔ Not yet |

## Search menu (`IDM_SEARCH_*`)

| Feature | Acuvio status |
| --- | --- |
| Find / Replace (edit buffer) | ✅ Done (Increment 5) |
| Find in Files | ⛔ Not yet |
| Find Next / Previous | ✅ Done |
| Select and Find Next / Previous | ⛔ Not yet |
| Incremental Search | 🟡 Partial (viewer search bar) |
| Search Results window | 🟡 Partial (viewer result list) |
| Go to… (line / offset) | ✅ Done (Go to line) |
| Bookmark: cut / copy / remove bookmarked lines | ✅ Done |
| Bookmark: remove unbookmarked lines / inverse | ✅ Done |
| Brace matching (go to / select between) | ✅ Done |
| Mark (persistent highlight of matches) | 🟡 Partial (single-style mark all + clear done; 1st–5th multi-color styles & jump pending) |
| Change History (jump to modified lines) | ⛔ Not yet |
| Smart Highlighting / Styling (1st–5th style, jump, copy styled) | ⛔ Not yet |
| Bookmarks (toggle / next / prev / cut / copy / remove / inverse) | 🟡 Partial (toggle/next/prev/clear done; cut/copy/remove/inverse pending) |
| Find characters in range | ⛔ Not yet |
| Regex (PCRE) + Extended (`\n \r \t`) search | ✅ Done (JS regex in Replace) |

## View menu (`IDM_VIEW_*`)

| Feature | Acuvio status |
| --- | --- |
| Always on Top / Full Screen / Post-It / Distraction Free | ⛔ Not yet |
| View in Browser (FF / Chrome / Edge / IE) | ➖ N/A |
| Show Symbol → spaces/tabs, EOL, non-printing, ctrl chars | 🟡 Partial (spaces/tabs + trailing whitespace done; EOL/non-printing/ctrl pending) |
| Show Symbol → indent guide / wrap symbol | ⛔ Not yet |
| Zoom in / out / restore | ✅ Done (font-size controls) |
| Multi-View (move/clone to other view; new instance) | ⛔ Not yet |
| Tab navigation (1st–9th, next/prev, move, tab color) | 🟡 Partial (basic tab strip) |
| Word Wrap | ✅ Done |
| Hide Lines | ⛔ Not yet |
| Folding (fold all / unfold all / by level) | 🟡 Partial (CM fold gutter for code langs) |
| Document Map | ⛔ Not yet |
| Folder as Workspace panel | ⛔ Not yet |
| Document List | ⛔ Not yet |
| Function List | ⛔ Not yet |
| Project Panels (1–3) | ⛔ Not yet |
| Synchronize vertical / horizontal scroll | ⛔ Not yet |
| Text direction (RTL / LTR) | ⛔ Not yet |
| Monitoring (tail -f) | ✅ Done (Follow mode, viewer) |

## Encoding menu (`IDM_FORMAT_*`)

| Feature | Acuvio status |
| --- | --- |
| Detect & display current encoding (ANSI / UTF-8 / UTF-8-BOM / UTF-16) | 🟡 Partial (detection done; UI indicator TBD) |
| Character-set submenus (Cyrillic, Greek, CJK, etc.) | ⛔ Not yet |
| Convert to ANSI / UTF-8 (±BOM) / UTF-16 (BE/LE) | ⛔ Not yet |

## Language menu (`IDM_LANG_*`)

| Feature | Acuvio status |
| --- | --- |
| Built-in syntax highlighting (~80 languages) | 🟡 Partial (18 languages, Increment 3) |
| Manual language selection | ✅ Done (status-bar picker) |
| Auto-detect language by extension | ✅ Done |
| User Defined Language (UDL) builder | ⛔ Not yet |

## Settings menu (`IDM_SETTING_*`)

| Feature | Acuvio status |
| --- | --- |
| Preferences (tabs, backup, auto-complete, dark mode…) | 🟡 Partial (theme/wrap/font persisted) |
| Style Configurator (themes + per-language colors) | 🟡 Partial (dark/light themes) |
| Shortcut Mapper | ⛔ Not yet |
| Import plugin / theme | ➖ N/A |
| Context-menu customization | ⛔ Not yet |

## Tools menu (`IDM_TOOL_*`)

| Feature | Acuvio status |
| --- | --- |
| MD5 / SHA-1 / SHA-256 / SHA-512 (selection / file / clipboard) | ⛔ Not yet |

## Macro menu (`IDM_MACRO_*`)

| Feature | Acuvio status |
| --- | --- |
| Record / Playback | ⛔ Not yet |
| Save current recorded macro | ⛔ Not yet |
| Run a macro multiple times | ⛔ Not yet |

## Run & Plugins (`IDM_EXECUTE`, `ID_PLUGINS_CMD`)

| Feature | Acuvio status |
| --- | --- |
| Run external command with variables | ⛔ Not yet |
| Plugins (DLL host) / Plugins Admin | ➖ N/A |

## Window menu (`IDR_WINDOWS_MENU`)

| Feature | Acuvio status |
| --- | --- |
| Sort by name / path / type / length / modified | ⛔ Not yet |
| Windows… management dialog | ⛔ Not yet |

## Cross-cutting features

| Feature | Acuvio status |
| --- | --- |
| Dark Mode (whole UI) | ✅ Done |
| Session management (restore open files) | ⛔ Not yet |
| Backup / auto-recovery snapshots | ⛔ Not yet |
| Theme engine (global stylers + lexers) | 🟡 Partial |
| Regex engine (PCRE) | 🟡 Partial (JS regex) |
| Multiple instances / portable mode | ➖ N/A |

---

## How this maps to Acuvio's roadmap

The Notepad++ menus above are folded into Acuvio's 13-phase plan in
[DEVELOPMENT.md](DEVELOPMENT.md) §2 (Feature Matrix) and §7 (Parity Matrix).
When picking the next increment, prefer the highest-value ⛔/🟡 rows that build on
already-delivered infrastructure (editable model, language registry, edit
commands, find/replace).
