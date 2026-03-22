import * as vscode from 'vscode';
import { GML_THEMES, GmlTheme, applyGmlTheme } from './gmlThemes';
import { i18n } from '../i18n/i18n';

const STORAGE_KEY = 'gmlHighlightTheme';

// ── Палитра цветов темы в виде кружков ────────────────────────────────────────

function buildPaletteStrip(t: GmlTheme): string {
  const p = t.preview;
  const colors = [p.keyword, p.storage, p.string, p.number, p.funcDef, p.funcCall, p.comment, p.bg];
  return colors.map(c =>
    `<span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:${c};flex-shrink:0;border:1px solid rgba(255,255,255,0.08);box-shadow:0 1px 4px rgba(0,0,0,0.5);"></span>`
  ).join('');
}

// ── Фрагмент GML кода для preview ────────────────────────────────────────────

function buildPreviewHtml(t: GmlTheme): string {
  const p = t.preview;
  const s = (color: string, text: string) =>
    `<span style="color:${color}">${text}</span>`;

  return [
    s(p.comment,  '/// @desc Player update'),
    `\n`,
    s(p.storage,  'var') + ` hp = ` + s(p.number, '100') + `;`,
    `\n`,
    s(p.keyword,  'if') + ` (hp &lt;= ` + s(p.number, '0') + `) {`,
    `\n  ` + s(p.funcCall, 'show_debug_message') + `(` + s(p.string, '"OVER"') + `);`,
    `\n  ` + s(p.funcCall, 'game_restart') + `();`,
    `\n}`,
    `\n`,
    s(p.storage,  'function') + ` ` + s(p.funcDef, 'heal') + `(n) {`,
    `\n  hp += ` + s(p.funcCall, 'min') + `(hp+n, ` + s(p.number, '100') + `);`,
    `\n}`,
  ].join('');
}

// ── HTML-билдер панели ────────────────────────────────────────────────────────

function buildHtml(currentThemeId: number): string {
  const isHacker = currentThemeId === 7;
  const isRetro  = currentThemeId === 8;

  // ─── Цветовые схемы UI ───────────────────────────────────────────────────
  const ui = isHacker
    ? {
        panelBg:         '#000000',
        headerBg:        '#000000',
        headerBorder:    '#00ff41',
        headerText:      '#00ff41',
        subtext:         '#007700',
        cardBg:          '#000d00',
        cardBorder:      '#003300',
        cardHover:       '#001800',
        cardActiveBorder:'#00ff41',
        cardActiveBg:    '#001500',
        cardActiveShadow:'0 0 20px rgba(0,255,65,0.35), 0 0 0 1px #00ff41',
        text:            '#00ff41',
        previewBorder:   '#002200',
        btnBg:           '#001a00',
        btnBorder:       '#00ff41',
        btnText:         '#00ff41',
        accentGlow:      '0 0 20px rgba(0,255,65,0.5)',
        scrollThumb:     '#003300',
        font:            `'Courier New', monospace`,
        matrixRain:      true,
        scanlines:       true,
      }
    : isRetro
    ? {
        panelBg:         '#0a0600',
        headerBg:        '#0d0700',
        headerBorder:    '#ff8c00',
        headerText:      '#ffb000',
        subtext:         '#664400',
        cardBg:          '#110800',
        cardBorder:      '#2a1500',
        cardHover:       '#1a0d00',
        cardActiveBorder:'#ffd700',
        cardActiveBg:    '#1a0f00',
        cardActiveShadow:'0 0 16px rgba(255,215,0,0.3), 0 0 0 1px #ffd700',
        text:            '#ffb000',
        previewBorder:   '#2a1500',
        btnBg:           '#1a0800',
        btnBorder:       '#ff8c00',
        btnText:         '#ffd700',
        accentGlow:      '0 0 12px rgba(255,140,0,0.4)',
        scrollThumb:     '#331a00',
        font:            `'Courier New', monospace`,
        matrixRain:      false,
        scanlines:       true,
      }
    : {
        panelBg:         '#0d1117',
        headerBg:        '#161b22',
        headerBorder:    '#21262d',
        headerText:      '#e6edf3',
        subtext:         '#7d8590',
        cardBg:          '#161b22',
        cardBorder:      '#21262d',
        cardHover:       '#1c2128',
        cardActiveBorder:'#388bfd',
        cardActiveBg:    '#1c2840',
        cardActiveShadow:'0 0 0 1px rgba(56,139,253,0.5), 0 4px 20px rgba(56,139,253,0.2)',
        text:            '#c9d1d9',
        previewBorder:   '#21262d',
        btnBg:           '#21262d',
        btnBorder:       '#30363d',
        btnText:         '#c9d1d9',
        accentGlow:      '0 0 12px rgba(56,139,253,0.3)',
        scrollThumb:     '#30363d',
        font:            `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
        matrixRain:      false,
        scanlines:       false,
      };

  // ─── Карточки тем ────────────────────────────────────────────────────────
  const currentTheme = GML_THEMES.find(t => t.id === currentThemeId)!;
  const cards = GML_THEMES.map(theme => {
    const isActive  = theme.id === currentThemeId;
    const preview   = buildPreviewHtml(theme);
    const palette   = buildPaletteStrip(theme);

    const borderStyle = isActive
      ? `border:2px solid ${ui.cardActiveBorder};background:${ui.cardActiveBg};box-shadow:${ui.cardActiveShadow};`
      : `border:1px solid ${ui.cardBorder};background:${ui.cardBg};`;

    const checkBadge = isActive
      ? `<span style="position:absolute;top:-1px;left:-1px;background:${ui.cardActiveBorder};color:${isHacker ? '#000' : '#fff'};font-size:9px;font-weight:700;padding:3px 7px;border-radius:8px 0 8px 0;letter-spacing:0.5px;">✓ ACTIVE</span>`
      : '';

    const hackerBadge = theme.isHacker
      ? `<span style="position:absolute;top:7px;right:7px;font-size:9px;padding:2px 6px;background:#001500;color:#00ff41;border:1px solid #00ff41;border-radius:3px;letter-spacing:1.5px;font-family:monospace;">HACKER</span>`
      : '';

    return `
<div class="card" data-id="${theme.id}" style="${borderStyle}position:relative;cursor:pointer;border-radius:10px;padding:14px;transition:all 0.18s ease;overflow:hidden;">
  ${checkBadge}
  ${hackerBadge}
  <!-- Заголовок карточки -->
  <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px;${isActive ? '' : ''}">
    <span style="font-size:18px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5));">${theme.emoji}</span>
    <div style="flex:1;min-width:0;">
      <div style="font-weight:700;font-size:13px;color:${ui.text};letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${theme.name}</div>
      <div style="font-size:10px;color:${ui.subtext};margin-top:1px;">Theme #${theme.id}</div>
    </div>
  </div>
  <!-- Цветовая палитра -->
  <div style="display:flex;gap:3px;align-items:center;margin-bottom:8px;padding:6px 8px;background:rgba(0,0,0,0.25);border-radius:6px;border:1px solid ${ui.previewBorder};">
    ${palette}
  </div>
  <!-- Описание -->
  <div style="font-size:10px;color:${ui.subtext};margin-bottom:9px;line-height:1.4;min-height:28px;">${i18n.s.themeDescriptions[theme.id] ?? theme.description}</div>
  <!-- Код preview -->
  <pre style="margin:0;padding:9px 10px;border-radius:7px;font-size:10.5px;line-height:1.55;background:${theme.preview.bg};font-family:'Cascadia Code','Fira Code','Consolas',monospace;overflow:hidden;border:1px solid ${ui.previewBorder};">${preview}</pre>
</div>`;
  }).join('');

  // ─── Matrix rain (только HACKER) ─────────────────────────────────────────
  const matrixScript = ui.matrixRain ? `
<canvas id="matrix" style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0.07;z-index:0;"></canvas>
<script>
(function(){
  const c = document.getElementById('matrix');
  const ctx = c.getContext('2d');
  c.width = window.innerWidth; c.height = window.innerHeight;
  const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop0123456789$#@{}[]()<>/\\\\|*&^%!?~';
  const cols = Math.floor(c.width / 14);
  const drops = Array.from({length:cols}, () => Math.random() * -50);
  function rain() {
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#00ff41'; ctx.font = '13px monospace';
    drops.forEach((y, i) => {
      ctx.fillText(CH[Math.floor(Math.random()*CH.length)], i*14, y*14);
      if (y*14 > c.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    });
  }
  setInterval(rain, 50);
  window.addEventListener('resize', () => { c.width = window.innerWidth; c.height = window.innerHeight; });
})();
</script>` : '';

  // ─── Scanlines overlay ───────────────────────────────────────────────────
  const scanlinesDiv = ui.scanlines
    ? `<div style="position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.04) 2px,rgba(0,0,0,0.04) 4px);"></div>`
    : '';

  // ─── Специальный заголовок HACKER ────────────────────────────────────────
  const hackerAscii = isHacker ? `
<div style="font-family:'Courier New',monospace;font-size:10px;color:#003300;line-height:1.4;margin-bottom:10px;letter-spacing:1px;white-space:pre;">
╔══════════════════════════════════════╗
║  G M S Y N C  //  S Y N T A X  M O D ║
╚══════════════════════════════════════╝</div>
<div style="font-size:10px;color:#005500;font-family:monospace;margin-bottom:6px;letter-spacing:2px;">
  &gt; INITIALIZING SYNTAX ENGINE...<span style="animation:blink 0.7s step-end infinite;">_</span>
</div>` : '';

  // ─── Заголовок панели ────────────────────────────────────────────────────
  const titleText = isHacker
    ? `<span style="font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:${ui.headerText};text-shadow:0 0 20px #00ff41,0 0 40px #00ff41;letter-spacing:3px;">&gt;_ GML SYNTAX MODE</span>`
    : isRetro
    ? `<span style="font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:${ui.headerText};text-shadow:0 0 10px #ff8c00;">[ GML HIGHLIGHT THEME ]</span>`
    : `<div style="display:flex;align-items:center;gap:10px;">
        <div style="width:28px;height:28px;background:linear-gradient(135deg,#1c3d6e,#2d1b69);border:1px solid #30363d;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">🎨</div>
        <span style="font-size:15px;font-weight:700;color:${ui.headerText};letter-spacing:0.2px;">GML Highlight Theme</span>
      </div>`;

  const activeLabel = isHacker
    ? `<span style="font-size:10px;font-family:monospace;color:#007700;letter-spacing:1px;">&gt; ACTIVE: [${currentThemeId}] ${currentTheme.name.toUpperCase()}</span>`
    : `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:${ui.subtext};">
        <span style="color:${ui.cardActiveBorder};">●</span>
        <span>Active: <b style="color:${ui.text};">${currentTheme.name}</b></span>
      </div>`;

  const instructionText = isHacker
    ? `<span style="font-size:10px;font-family:monospace;color:#004400;letter-spacing:1.5px;">&gt; SELECT SYNTAX PROFILE // CLICK TO APPLY //</span>`
    : `<span style="font-size:11px;color:${ui.subtext};">${i18n.s.themePickerInstruction}</span>`;

  // ─── Нижний декоративный текст HACKER ───────────────────────────────────
  const hackerFooter = isHacker
    ? `<div style="margin-top:20px;font-size:9px;color:#002200;font-family:monospace;letter-spacing:1.5px;text-align:center;padding-bottom:16px;">[ GMSYNC SYNTAX ENGINE v7.7 // ALL SYSTEMS OPERATIONAL ]</div>`
    : '';

  // ─── Rainbow accent bar (только обычный режим) ───────────────────────────
  const rainbowBar = (!isHacker && !isRetro)
    ? `<div style="height:3px;background:linear-gradient(90deg,#58a6ff 0%,#a371f7 25%,#f78166 55%,#ffa657 75%,#3fb950 100%);"></div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GML Theme Picker</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${ui.panelBg};
    color: ${ui.text};
    font-family: ${ui.font};
    font-size: 13px;
    min-height: 100vh;
    overflow-x: hidden;
  }
  .header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: ${ui.headerBg};
    border-bottom: 1px solid ${ui.headerBorder};
    padding: 14px 18px 12px;
  }
  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
  }
  .content {
    position: relative;
    z-index: 2;
    padding: 16px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 12px;
  }
  .card:hover {
    border-color: ${ui.cardActiveBorder} !important;
    background: ${ui.cardHover} !important;
    transform: translateY(-2px) !important;
    box-shadow: ${ui.accentGlow}, 0 6px 20px rgba(0,0,0,0.4) !important;
  }
  .card:active { transform: translateY(0) !important; transition: transform 0.05s !important; }
  ${isHacker ? `
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    .card { font-family: 'Courier New', monospace !important; }
    .card:hover { text-shadow: 0 0 8px rgba(0,255,65,0.3); }
  ` : ''}
  ${isRetro ? `
    @keyframes flicker { 0%,100%{opacity:1} 92%{opacity:0.97} 95%{opacity:0.93} }
    body { animation: flicker 0.15s infinite; }
    .card { font-family: 'Courier New', monospace !important; }
  ` : ''}
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: ${ui.panelBg}; }
  ::-webkit-scrollbar-thumb { background: ${ui.scrollThumb}; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: ${ui.subtext}; }
</style>
</head>
<body>

${rainbowBar}
${matrixScript}
${scanlinesDiv}

<div class="header">
  ${hackerAscii}
  <div class="header-top">
    ${titleText}
    ${activeLabel}
  </div>
  <div>${instructionText}</div>
</div>

<div class="content">
  <div class="grid">
    ${cards}
  </div>
  ${hackerFooter}
</div>

<script>
  const vscode = acquireVsCodeApi();
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.getAttribute('data-id'), 10);
      vscode.postMessage({ command: 'selectTheme', themeId: id });
    });
  });
</script>
</body>
</html>`;
}

// ── Singleton Panel ───────────────────────────────────────────────────────────

export class ThemePickerPanel {
  private static _current: ThemePickerPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _currentThemeId: number;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _ctx: vscode.ExtensionContext,
  ) {
    this._panel = panel;
    this._currentThemeId = _ctx.globalState.get<number>(STORAGE_KEY, 0);
    this._refresh();

    panel.webview.onDidReceiveMessage(
      (msg: { command: string; themeId?: number }) => this._onMessage(msg),
      undefined,
      _ctx.subscriptions,
    );

    panel.onDidDispose(() => {
      ThemePickerPanel._current = undefined;
    });
  }

  // ── Открыть / показать панель ─────────────────────────────────────────────

  static open(ctx: vscode.ExtensionContext): void {
    if (ThemePickerPanel._current) {
      ThemePickerPanel._current._panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'gmlThemePicker',
      'GML Theme Picker',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true },
    );

    ThemePickerPanel._current = new ThemePickerPanel(panel, ctx);
  }

  // ── Обновить HTML если панель открыта (например, при смене языка) ─────────

  static refreshCurrent(): void {
    ThemePickerPanel._current?._refresh();
  }

  // ── Восстановить тему при старте расширения ───────────────────────────────

  static async restoreTheme(ctx: vscode.ExtensionContext): Promise<void> {
    const savedId = ctx.globalState.get<number>(STORAGE_KEY, 0);
    if (savedId !== 0) {
      await applyGmlTheme(savedId);
    }
  }

  // ── Текущий id темы ───────────────────────────────────────────────────────

  static getCurrentThemeId(ctx: vscode.ExtensionContext): number {
    return ctx.globalState.get<number>(STORAGE_KEY, 0);
  }

  // ── Обработка сообщений из webview ───────────────────────────────────────

  private async _onMessage(msg: { command: string; themeId?: number }): Promise<void> {
    if (msg.command !== 'selectTheme' || msg.themeId === undefined) return;

    const id = msg.themeId;
    await applyGmlTheme(id);
    this._currentThemeId = id;
    await this._ctx.globalState.update(STORAGE_KEY, id);

    const theme = GML_THEMES.find(t => t.id === id)!;

    this._panel.title = theme.isHacker ? '>_ MATRIX MODE' : `GML Theme: ${theme.name}`;

    this._refresh();

    vscode.window.showInformationMessage(
      theme.isHacker ? i18n.s.hackerThemeApplied : i18n.s.themeApplied(theme.name),
    );
  }

  private _refresh(): void {
    this._panel.webview.html = buildHtml(this._currentThemeId);
  }
}
