import { Injectable } from '@angular/core';
import type { Extension } from '@codemirror/state';
import type { LanguageSupport } from '@codemirror/language';

/**
 * A lazily-loadable language definition.
 *
 * The {@link load} function is a dynamic `import()` thunk so that a language's
 * grammar is only fetched from the network/bundle when a file of that type is
 * actually opened. This keeps the initial application bundle small while still
 * supporting many languages.
 */
export interface LanguageDefinition {
  /** Stable identifier, e.g. `"typescript"`. */
  readonly id: string;
  /** Human-readable label shown in the UI, e.g. `"TypeScript"`. */
  readonly label: string;
  /** File extensions (without the dot), lower-case, that map to this language. */
  readonly extensions: readonly string[];
  /** Exact file names (lower-case) that map to this language, e.g. `dockerfile`. */
  readonly filenames?: readonly string[];
  /** Lazy loader returning the CodeMirror language extension(s). */
  readonly load: () => Promise<Extension>;
}

/** A resolved language ready to be applied to an editor. */
export interface ResolvedLanguage {
  readonly id: string;
  readonly label: string;
  readonly extension: Extension;
}

/**
 * Central registry mapping file types to CodeMirror language support.
 *
 * Adding a new language is a single {@link register} call (or an entry in the
 * built-in table) — no edits to the editor component are required. This is the
 * extensibility seam described in the Phase 5 roadmap: third-party packages can
 * contribute languages by registering their own definitions at startup.
 */
@Injectable({ providedIn: 'root' })
export class LanguageRegistry {
  private readonly byId = new Map<string, LanguageDefinition>();
  private readonly byExtension = new Map<string, LanguageDefinition>();
  private readonly byFilename = new Map<string, LanguageDefinition>();
  /** Cache of already-loaded extensions, keyed by language id. */
  private readonly loaded = new Map<string, Extension>();

  constructor() {
    for (const def of BUILT_IN_LANGUAGES) {
      this.register(def);
    }
  }

  /** Register (or override) a language definition. */
  register(def: LanguageDefinition): void {
    this.byId.set(def.id, def);
    for (const ext of def.extensions) {
      this.byExtension.set(ext.toLowerCase(), def);
    }
    for (const name of def.filenames ?? []) {
      this.byFilename.set(name.toLowerCase(), def);
    }
  }

  /** All registered languages, sorted by label (for pickers). */
  list(): LanguageDefinition[] {
    return [...this.byId.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Look up a definition by language id. */
  getById(id: string): LanguageDefinition | undefined {
    return this.byId.get(id);
  }

  /**
   * Resolve a language definition from a file path using its extension, then
   * its exact file name. Returns `undefined` for unknown/plain-text files.
   */
  detect(path: string): LanguageDefinition | undefined {
    const name = (path.split(/[\\/]/).pop() ?? '').toLowerCase();
    if (this.byFilename.has(name)) return this.byFilename.get(name);
    const dot = name.lastIndexOf('.');
    if (dot >= 0 && dot < name.length - 1) {
      const ext = name.slice(dot + 1);
      return this.byExtension.get(ext);
    }
    return undefined;
  }

  /** Load (and cache) the CodeMirror extension for a language id. */
  async resolve(id: string): Promise<ResolvedLanguage | undefined> {
    const def = this.byId.get(id);
    if (!def) return undefined;
    let extension = this.loaded.get(id);
    if (!extension) {
      extension = await def.load();
      this.loaded.set(id, extension);
    }
    return { id: def.id, label: def.label, extension };
  }

  /** Convenience: detect the language for a path and resolve it in one step. */
  async resolveForPath(path: string): Promise<ResolvedLanguage | undefined> {
    const def = this.detect(path);
    return def ? this.resolve(def.id) : undefined;
  }
}

/** Wrap a `LanguageSupport` promise as an `Extension` promise. */
function lang(loader: () => Promise<LanguageSupport>): () => Promise<Extension> {
  return () => loader();
}

/** Wrap a `@codemirror/legacy-modes` StreamParser into a language extension. */
function legacy(loader: () => Promise<Extension>): () => Promise<Extension> {
  return loader;
}

/**
 * Built-in language table. Each loader dynamically imports its grammar so the
 * code is only downloaded on first use.
 */
const BUILT_IN_LANGUAGES: readonly LanguageDefinition[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs', 'jsx'],
    load: lang(async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true })),
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    extensions: ['ts', 'tsx', 'mts', 'cts'],
    load: lang(async () =>
      (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true }),
    ),
  },
  {
    id: 'python',
    label: 'Python',
    extensions: ['py', 'pyw', 'pyi'],
    load: lang(async () => (await import('@codemirror/lang-python')).python()),
  },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['rs'],
    load: lang(async () => (await import('@codemirror/lang-rust')).rust()),
  },
  {
    id: 'html',
    label: 'HTML',
    extensions: ['html', 'htm', 'xhtml'],
    load: lang(async () => (await import('@codemirror/lang-html')).html()),
  },
  {
    id: 'xml',
    label: 'XML',
    extensions: ['xml', 'svg', 'xsl', 'xsd', 'rss', 'plist'],
    load: lang(async () => (await import('@codemirror/lang-xml')).xml()),
  },
  {
    id: 'json',
    label: 'JSON',
    extensions: ['json', 'jsonc', 'json5', 'ndjson'],
    load: lang(async () => (await import('@codemirror/lang-json')).json()),
  },
  {
    id: 'yaml',
    label: 'YAML',
    extensions: ['yaml', 'yml'],
    load: lang(async () => (await import('@codemirror/lang-yaml')).yaml()),
  },
  {
    id: 'sql',
    label: 'SQL',
    extensions: ['sql'],
    load: lang(async () => (await import('@codemirror/lang-sql')).sql()),
  },
  {
    id: 'css',
    label: 'CSS',
    extensions: ['css', 'scss', 'less'],
    load: lang(async () => (await import('@codemirror/lang-css')).css()),
  },
  {
    id: 'markdown',
    label: 'Markdown',
    extensions: ['md', 'markdown', 'mdx'],
    load: lang(async () => (await import('@codemirror/lang-markdown')).markdown()),
  },
  {
    id: 'cpp',
    label: 'C / C++',
    extensions: ['c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
    load: lang(async () => (await import('@codemirror/lang-cpp')).cpp()),
  },
  {
    id: 'java',
    label: 'Java',
    extensions: ['java'],
    load: lang(async () => (await import('@codemirror/lang-java')).java()),
  },
  {
    id: 'go',
    label: 'Go',
    extensions: ['go'],
    load: lang(async () => (await import('@codemirror/lang-go')).go()),
  },
  {
    id: 'php',
    label: 'PHP',
    extensions: ['php', 'phtml'],
    load: lang(async () => (await import('@codemirror/lang-php')).php()),
  },
  // ---- legacy stream-parser modes (no dedicated lang-* package) ----
  {
    id: 'csharp',
    label: 'C#',
    extensions: ['cs', 'csx'],
    load: legacy(async () => {
      const [{ StreamLanguage }, { csharp }] = await Promise.all([
        import('@codemirror/language'),
        import('@codemirror/legacy-modes/mode/clike'),
      ]);
      return StreamLanguage.define(csharp);
    }),
  },
  {
    id: 'powershell',
    label: 'PowerShell',
    extensions: ['ps1', 'psm1', 'psd1'],
    load: legacy(async () => {
      const [{ StreamLanguage }, { powerShell }] = await Promise.all([
        import('@codemirror/language'),
        import('@codemirror/legacy-modes/mode/powershell'),
      ]);
      return StreamLanguage.define(powerShell);
    }),
  },
  {
    id: 'shell',
    label: 'Shell / Bash',
    extensions: ['sh', 'bash', 'zsh', 'ksh'],
    filenames: ['.bashrc', '.zshrc', '.profile'],
    load: legacy(async () => {
      const [{ StreamLanguage }, { shell }] = await Promise.all([
        import('@codemirror/language'),
        import('@codemirror/legacy-modes/mode/shell'),
      ]);
      return StreamLanguage.define(shell);
    }),
  },
] as const;
