import { Injectable, signal } from '@angular/core';

export type ThemeName = 'dark' | 'light';

/** Persisted user settings. A first slice of the Phase 12 configuration system. */
export interface AcuvioSettings {
  theme: ThemeName;
  wordWrap: boolean;
  fontSize: number;
}

const STORAGE_KEY = 'acuvio.settings.v1';
const DEFAULTS: AcuvioSettings = { theme: 'dark', wordWrap: false, fontSize: 13 };
const MIN_FONT = 8;
const MAX_FONT = 32;

/**
 * Lightweight settings store backed by `localStorage`.
 *
 * Exposes reactive signals for the view and applies the active theme to the
 * document root (`data-theme`). This is intentionally framework-only — no
 * backend round-trip — so view preferences survive reloads without blocking on
 * the Rust side.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly theme = signal<ThemeName>(DEFAULTS.theme);
  readonly wordWrap = signal<boolean>(DEFAULTS.wordWrap);
  readonly fontSize = signal<number>(DEFAULTS.fontSize);

  constructor() {
    this.load();
    this.applyTheme(this.theme());
  }

  toggleTheme(): void {
    const next: ThemeName = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.applyTheme(next);
    this.save();
  }

  toggleWordWrap(): void {
    this.wordWrap.update((v) => !v);
    this.save();
  }

  zoomIn(): void {
    this.setFontSize(this.fontSize() + 1);
  }

  zoomOut(): void {
    this.setFontSize(this.fontSize() - 1);
  }

  resetZoom(): void {
    this.setFontSize(DEFAULTS.fontSize);
  }

  private setFontSize(px: number): void {
    this.fontSize.set(Math.max(MIN_FONT, Math.min(MAX_FONT, Math.round(px))));
    this.save();
  }

  private applyTheme(theme: ThemeName): void {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AcuvioSettings>;
      if (parsed.theme === 'dark' || parsed.theme === 'light') this.theme.set(parsed.theme);
      if (typeof parsed.wordWrap === 'boolean') this.wordWrap.set(parsed.wordWrap);
      if (typeof parsed.fontSize === 'number') {
        this.fontSize.set(Math.max(MIN_FONT, Math.min(MAX_FONT, parsed.fontSize)));
      }
    } catch {
      /* corrupt or unavailable storage — fall back to defaults */
    }
  }

  private save(): void {
    try {
      const value: AcuvioSettings = {
        theme: this.theme(),
        wordWrap: this.wordWrap(),
        fontSize: this.fontSize(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* ignore storage failures */
    }
  }
}
