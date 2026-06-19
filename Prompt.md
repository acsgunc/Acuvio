# AI Development Prompt: Upgrade My Existing Application to Match Notepad++ Features

You are an experienced software architect and senior software engineer.

## Objective

I will provide the complete source code.
complete source code D:\work\poc\notepad-plus-plus

Your task is to evolve this application into a modern text/code editor that provides feature parity with Notepad++ while preserving the existing architecture whenever possible.

Do **not** rewrite the application from scratch unless absolutely necessary. Instead, extend, refactor, and improve the existing codebase.

---

## Development Guidelines

1. Analyze the entire codebase before making changes.
2. Understand the current architecture.
3. Reuse existing components whenever practical.
4. Follow the project's coding conventions.
5. Keep the application modular and maintainable.
6. Avoid introducing unnecessary breaking changes.
7. Implement features incrementally.
8. Ensure every feature is production-ready.
9. Write clean, well-documented code.
10. Add unit tests where appropriate.

---

## Phase 1 – Codebase Analysis

Before writing code:

* Analyze the project structure.
* Identify reusable components.
* Document:

  * Current architecture
  * Strengths
  * Weaknesses
  * Technical debt
  * Missing functionality
* Produce a development roadmap.

Do not start implementing features until the analysis is complete.

---

## Phase 2 – Core Editor Features

Implement all standard editor capabilities including:

* Multiple document interface (tabs)
* Open/Save/Save As
* Auto Save
* Session restore
* Recent files
* Drag & Drop
* File change detection
* Read-only mode
* File encoding detection
* UTF-8
* UTF-16
* ANSI
* Line endings

  * Windows (CRLF)
  * Unix (LF)
  * Mac (CR)
* Zoom
* Word Wrap
* Minimap
* Line numbers
* Code folding
* Bookmark lines
* Goto line
* Goto symbol
* Split editor
* Horizontal/Vertical split views

---

## Phase 3 – Editing Features

Implement:

* Undo/Redo
* Multi-level undo history
* Multi-cursor editing
* Column selection
* Rectangular selection
* Multiple selections
* Duplicate line
* Move line up/down
* Join lines
* Split lines
* Delete line
* Trim whitespace
* Convert tabs/spaces
* Auto indentation
* Smart indentation
* Auto closing brackets
* Auto closing quotes
* Smart Home/End
* Smart Backspace
* Incremental search

---

## Phase 4 – Search

Implement powerful search features:

* Find
* Replace
* Find in files
* Replace in files
* Regular Expressions
* Whole word
* Match case
* Mark matches
* Highlight all
* Search history
* Search across project
* Search results panel

---

## Phase 5 – Syntax Highlighting

Support syntax highlighting for major languages including:

* C
* C++
* C#
* Java
* JavaScript
* TypeScript
* Python
* Go
* Rust
* HTML
* XML
* JSON
* YAML
* SQL
* CSS
* Markdown
* PowerShell
* Bash

Design the syntax highlighting engine so additional languages can be added easily.

---

## Phase 6 – Code Editing Features

Implement:

* Bracket matching
* Brace highlighting
* Auto completion
* IntelliSense-ready architecture
* Snippets
* Parameter hints
* Code navigation
* Symbol navigation
* Folding by syntax
* Outline view

---

## Phase 7 – File Explorer

Create a sidebar with:

* Folder tree
* Workspace support
* Multiple folders
* File filtering
* File search
* Rename
* Delete
* Move
* New File
* New Folder
* Refresh
* Drag & Drop

---

## Phase 8 – Plugin Architecture

Design a plugin system supporting:

* Plugin discovery
* Plugin loading
* Plugin unloading
* Commands
* Menus
* Tool windows
* Event subscriptions
* APIs for editor interaction

The architecture should allow third-party plugins without modifying the core application.

---

## Phase 9 – UI Improvements

Modernize the UI with:

* Dockable panels
* Dark mode
* Light mode
* Custom themes
* Icon themes
* Configurable toolbar
* Status bar
* Command palette
* Keyboard shortcut customization
* Context menus
* Responsive layout

---

## Phase 10 – Productivity Features

Implement:

* Macro recording
* Macro playback
* Session management
* Workspace management
* Favorites
* Recent projects
* Clipboard history
* Compare documents
* Diff viewer

---

## Phase 11 – Advanced Features

Implement:

* Large file support
* Async file loading
* Background indexing
* Incremental rendering
* High-performance scrolling
* Memory optimization
* Crash recovery
* Backup files
* Auto recovery

---

## Phase 12 – Configuration

Create a flexible settings system supporting:

* JSON configuration
* Import/Export settings
* User settings
* Workspace settings
* Theme settings
* Font settings
* Keyboard settings

---

## Phase 13 – Architecture Improvements

Refactor where needed to improve:

* Separation of concerns
* Testability
* Extensibility
* Performance
* Maintainability
* Dependency injection
* Modular services

---

## Deliverables

For every development phase:

1. Explain the implementation plan.
2. Explain architectural decisions.
3. Implement the code.
4. Update affected files.
5. Add tests where applicable.
6. Provide a summary of changes.
7. List remaining work.

Do not skip steps.

If a feature requires significant architectural changes, explain the trade-offs before implementing it.

Always preserve existing functionality while adding new capabilities.

The final application should feel comparable to Notepad++ in terms of usability, performance, extensibility, and overall feature set.
