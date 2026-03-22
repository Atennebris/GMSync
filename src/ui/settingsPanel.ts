import * as vscode from 'vscode';
import { i18n, Lang } from '../i18n/i18n';
import { ThemePickerPanel } from './themePickerPanel';
import { GML_THEMES } from './gmlThemes';

// ── HTML ───────────────────────────────────────────────────────────────────────

function buildHtml(lang: Lang, currentThemeId: number): string {
  const s = i18n.s;
  const langLabels: Record<string, string> = {
    en: 'English', ru: 'Русский', 'zh-CN': '简体中文 (大陆)', 'zh-TW': '繁體中文 (台灣)',
    ja: '日本語', ro: 'Română', de: 'Deutsch', fr: 'Français', es: 'Español', pt: 'Português', hi: 'हिन्दी',
    it: 'Italiano', uk: 'Українська',
  };
  const langShort: Record<string, string> = {
    en: 'EN', ru: 'RU', 'zh-CN': '简', 'zh-TW': '繁',
    ja: '日', ro: 'RO', de: 'DE', fr: 'FR', es: 'ES', pt: 'PT', hi: 'हि',
    it: 'IT', uk: 'UK',
  };

  const currentTheme = GML_THEMES.find(t => t.id === currentThemeId) ?? GML_THEMES[0];
  const p = currentTheme.preview;
  const paletteColors = [p.keyword, p.funcDef, p.string, p.number, p.funcCall, p.storage, p.comment];
  const paletteDots = paletteColors.map(c =>
    `<span class="pdot" style="background:${c};"></span>`
  ).join('');

  const langs = ['en', 'ru', 'zh-CN', 'zh-TW', 'ja', 'ro', 'de', 'fr', 'es', 'pt', 'hi', 'it', 'uk'];
  const langButtons = langs.map(l =>
    `<button class="lang-btn ${l === lang ? 'active' : ''}" onclick="setLang('${l}')" title="${langLabels[l] ?? l}">${langShort[l] ?? l}</button>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${s.settingsTitle}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0d1117;
    color: #c9d1d9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    min-height: 100vh;
  }

  /* ── Радужная полоса сверху ── */
  .rainbow-bar {
    height: 3px;
    background: linear-gradient(90deg,
      #58a6ff 0%, #a371f7 25%, #f78166 55%, #ffa657 75%, #3fb950 100%);
  }

  /* ── Шапка ── */
  .header {
    padding: 14px 18px 13px;
    background: #161b22;
    border-bottom: 1px solid #21262d;
    display: flex;
    align-items: center;
    gap: 11px;
  }
  .header-logo {
    width: 30px;
    height: 30px;
    background: linear-gradient(135deg, #1c3d6e 0%, #2d1b69 100%);
    border: 1px solid #30363d;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .header-text { flex: 1; min-width: 0; }
  .header-title {
    font-size: 14px;
    font-weight: 700;
    color: #e6edf3;
    letter-spacing: 0.2px;
  }
  .header-sub {
    font-size: 11px;
    color: #7d8590;
    margin-top: 2px;
    letter-spacing: 0.1px;
  }

  /* ── Контент ── */
  .content {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }

  /* ── Карточки-секции ── */
  .card {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 10px;
    overflow: hidden;
    transition: border-color 0.2s ease;
  }
  .card:hover { border-color: #30363d; }

  .card-header {
    padding: 9px 14px;
    background: #1c2128;
    border-bottom: 1px solid #21262d;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .card-icon { font-size: 12px; opacity: 0.65; }
  .card-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #7d8590;
  }
  .card-body { padding: 13px 14px; }

  /* ── Кнопки языков ── */
  .lang-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 5px;
  }
  .lang-btn {
    padding: 7px 2px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid #30363d;
    border-radius: 7px;
    background: #21262d;
    color: #8b949e;
    text-align: center;
    transition: all 0.15s ease;
    user-select: none;
    letter-spacing: 0.3px;
    outline: none;
  }
  .lang-btn:hover {
    border-color: #58a6ff;
    color: #58a6ff;
    background: #1a2840;
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(0,0,0,0.3);
  }
  .lang-btn.active {
    background: linear-gradient(135deg, #1c3d6e 0%, #1a2d5a 100%);
    color: #58a6ff;
    border-color: #388bfd;
    box-shadow: 0 0 0 1px rgba(56,139,253,0.25), 0 0 10px rgba(56,139,253,0.15);
  }
  .lang-current {
    margin-top: 10px;
    font-size: 11px;
    color: #58a6ff;
    display: flex;
    align-items: center;
    gap: 6px;
    opacity: 0.85;
  }
  .lang-dot {
    width: 6px; height: 6px;
    background: #58a6ff;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 6px rgba(88,166,255,0.6);
  }

  /* ── Превью темы ── */
  .theme-preview-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: #1c2128;
    border: 1px solid #21262d;
    border-radius: 8px;
    margin-bottom: 11px;
    transition: border-color 0.15s;
  }
  .theme-preview-card:hover { border-color: #30363d; }
  .theme-swatch {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    flex-shrink: 0;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    background: ${p.bg};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-family: monospace;
  }
  .theme-info-wrap { flex: 1; min-width: 0; }
  .theme-name-big {
    font-size: 13px;
    font-weight: 700;
    color: #e6edf3;
    letter-spacing: 0.2px;
  }
  .theme-palette-row {
    display: flex;
    gap: 3px;
    margin-top: 5px;
    align-items: center;
  }
  .pdot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.07);
  }

  /* ── Кнопка открытия тем ── */
  .open-btn {
    width: 100%;
    padding: 9px 16px;
    background: linear-gradient(135deg, #1c3d6e 0%, #1a2d5a 100%);
    color: #58a6ff;
    border: 1px solid #388bfd;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
    letter-spacing: 0.3px;
    text-align: center;
    outline: none;
  }
  .open-btn:hover {
    background: linear-gradient(135deg, #1f4a80 0%, #1c3870 100%);
    box-shadow: 0 0 16px rgba(56,139,253,0.25), 0 3px 10px rgba(0,0,0,0.3);
    transform: translateY(-1px);
  }
  .open-btn:active { transform: scale(0.98); }
  .open-btn-icon { margin-right: 6px; opacity: 0.85; }

  /* ── Версия ── */
  .version-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .version-name {
    color: #7d8590;
    font-size: 12px;
    font-weight: 500;
  }
  .version-badge {
    background: #1c2840;
    color: #58a6ff;
    border: 1px solid #30363d;
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 700;
    font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
    letter-spacing: 0.5px;
  }

  /* ── Разделитель ── */
  .divider {
    height: 1px;
    background: #21262d;
    margin: 10px 0;
  }

  /* ── Футер-инфо ── */
  .footer-links {
    display: flex;
    gap: 12px;
    margin-top: 4px;
  }
  .footer-link {
    font-size: 11px;
    color: #7d8590;
    cursor: default;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .footer-link-dot {
    width: 5px; height: 5px;
    background: #3fb950;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 5px rgba(63,185,80,0.5);
  }

  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #484f58; }
</style>
</head>
<body>

<div class="rainbow-bar"></div>

<div class="header">
  <div class="header-logo">⚡</div>
  <div class="header-text">
    <div class="header-title">GMSync</div>
    <div class="header-sub">${s.settingsTitle}</div>
  </div>
</div>

<div class="content">

  <!-- Язык -->
  <div class="card">
    <div class="card-header">
      <span class="card-icon">🌐</span>
      <span class="card-title">${s.settingsLanguageLabel}</span>
    </div>
    <div class="card-body">
      <div class="lang-grid">${langButtons}</div>
      <div class="lang-current">
        <span class="lang-dot"></span>
        ${langLabels[lang] ?? 'English'}
      </div>
    </div>
  </div>

  <!-- GML Тема -->
  <div class="card">
    <div class="card-header">
      <span class="card-icon">🎨</span>
      <span class="card-title">${s.settingsThemeLabel}</span>
    </div>
    <div class="card-body">
      <div class="theme-preview-card">
        <div class="theme-swatch">${currentTheme.emoji}</div>
        <div class="theme-info-wrap">
          <div class="theme-name-big">${currentTheme.name}</div>
          <div class="theme-palette-row">${paletteDots}</div>
        </div>
      </div>
      <button class="open-btn" onclick="openThemes()">
        <span class="open-btn-icon">◐</span>${s.settingsOpenTheme}
      </button>
    </div>
  </div>

  <!-- Версия -->
  <div class="card">
    <div class="card-header">
      <span class="card-icon">ℹ</span>
      <span class="card-title">${s.settingsVersion}</span>
    </div>
    <div class="card-body">
      <div class="version-row">
        <span class="version-name">GMSync: AI Edition</span>
        <span class="version-badge">v0.1.0</span>
      </div>
      <div class="divider"></div>
      <div class="footer-links">
        <span class="footer-link">
          <span class="footer-link-dot"></span>
          GMS2 Live-Edit Tool
        </span>
      </div>
    </div>
  </div>

</div>

<script>
  const vscode = acquireVsCodeApi();
  function setLang(lang) { vscode.postMessage({ command: 'setLanguage', lang }); }
  function openThemes() { vscode.postMessage({ command: 'openThemes' }); }
</script>
</body>
</html>`;
}

// ── Singleton Panel ────────────────────────────────────────────────────────────

const THEME_KEY = 'gmlHighlightTheme';

export class SettingsPanel {
  private static _current: SettingsPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _ctx: vscode.ExtensionContext,
    private readonly _onLangChange: (lang: Lang) => void,
  ) {
    this._panel = panel;
    this._refresh();

    panel.webview.onDidReceiveMessage(
      (msg: { command: string; lang?: Lang }) => this._onMessage(msg),
      undefined,
      _ctx.subscriptions,
    );

    panel.onDidDispose(() => {
      SettingsPanel._current = undefined;
    });
  }

  static open(
    ctx: vscode.ExtensionContext,
    onLangChange: (lang: Lang) => void,
  ): void {
    if (SettingsPanel._current) {
      SettingsPanel._current._panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gmsyncSettings',
      i18n.s.settingsTitle,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );

    SettingsPanel._current = new SettingsPanel(panel, ctx, onLangChange);
  }

  /** Обновить HTML (вызывать после смены языка) */
  static refreshCurrent(): void {
    SettingsPanel._current?._refresh();
  }

  private async _onMessage(msg: { command: string; lang?: Lang }): Promise<void> {
    if (msg.command === 'setLanguage' && msg.lang) {
      await i18n.set(msg.lang, this._ctx);
      this._onLangChange(msg.lang);
      this._refresh();
      this._panel.title = i18n.s.settingsTitle;
      vscode.window.showInformationMessage(i18n.s.settingsLangApplied);
      return;
    }

    if (msg.command === 'openThemes') {
      ThemePickerPanel.open(this._ctx);
    }
  }

  private _refresh(): void {
    const themeId = this._ctx.globalState.get<number>(THEME_KEY, 0);
    this._panel.webview.html = buildHtml(i18n.getLang(), themeId);
  }
}
