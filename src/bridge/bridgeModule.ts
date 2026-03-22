import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BridgeServer, LogEntry } from './bridgeServer';
import { installBridge, uninstallBridge, isBridgeInstalled } from './bridgeInstaller';
import { BRIDGE_GAME_PORT } from './bridgeProtocol';
import { logger } from '../utils/logger';
import { i18n } from '../i18n/i18n';
import { ProjectModel } from '../model/projectModel';

const CTX = 'BridgeModule';

/**
 * BridgeModule — главный фасад для Phase 8.
 * Создаётся в extension.ts и регистрируется как Disposable.
 * НЕ меняет ничего в оркестраторе или существующих модулях.
 */
const LOG_FLUSH_MS        = 200;    // интервал сброса батча логов в OutputChannel
const LOG_BATCH_MAX       = 500;    // максимум строк в батче до принудительного сброса
const LOG_RATE_WARN_PER_S = 1000;   // предупреждение если игра шлёт > 1000 сообщений/сек

export class BridgeModule implements vscode.Disposable {
  private readonly server   = new BridgeServer();
  private readonly statusItem: vscode.StatusBarItem;
  private readonly logChannel: vscode.OutputChannel;

  private logBatch:     string[]                           = [];
  private logTimer:     ReturnType<typeof setTimeout> | null = null;
  private logRateCount  = 0;
  private logRateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly getProjectRoot: () => string | undefined,
    private readonly getYypPath:     () => string | undefined,
    private readonly getModel:       () => ProjectModel | undefined,
  ) {
    // Отдельный Output Channel для логов из игры
    this.logChannel = vscode.window.createOutputChannel('GMSync: Bridge Logs');

    // Отдельный Status Bar item (правее основного, приоритет 98)
    this.statusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left, 98,
    );
    this.statusItem.command = 'gmsync.bridge.sendCommand';
    this.updateStatus();
    this.statusItem.show();

    // Подписки на события сервера
    this.server.on('started',      () => this.updateStatus());
    this.server.on('stopped',      () => this.updateStatus());
    this.server.on('connected',    () => {
      this.updateStatus();
      vscode.window.showInformationMessage(i18n.s.bridgeConnected);
    });
    this.server.on('disconnected', () => {
      this.updateStatus();
      vscode.window.showWarningMessage(i18n.s.bridgeDisconnected);
    });
    this.server.on('log', (entry: LogEntry) => {
      this.logBatch.push(`[${entry.timestamp}] ${entry.message}`);
      if (this.logBatch.length >= LOG_BATCH_MAX) {
        this.flushLogs();
      } else if (!this.logTimer) {
        this.logTimer = setTimeout(() => this.flushLogs(), LOG_FLUSH_MS);
      }

      // Детектор аномального потока: > LOG_RATE_WARN_PER_S сообщений/сек
      this.logRateCount++;
      if (!this.logRateTimer) {
        this.logRateTimer = setTimeout(() => {
          if (this.logRateCount > LOG_RATE_WARN_PER_S) {
            vscode.window.showWarningMessage(i18n.s.bridgeLogRateWarning(this.logRateCount));
          }
          this.logRateCount = 0;
          this.logRateTimer = null;
        }, 1000);
      }
    });
  }

  // ── Команды (регистрируются в extension.ts) ──────────────────────────────

  async startBridge(): Promise<void> {
    if (this.server.isRunning) {
      vscode.window.showInformationMessage(i18n.s.bridgeAlreadyRunning(BRIDGE_GAME_PORT));
      return;
    }
    try {
      await this.server.start();
      this.logChannel.appendLine(`[GMSync] Bridge server started on port ${BRIDGE_GAME_PORT}`);
      this.logChannel.appendLine(`[GMSync] ${i18n.s.bridgeStartLogLine}`);
      this.logChannel.show(true);
      vscode.window.showInformationMessage(i18n.s.bridgeStarted(BRIDGE_GAME_PORT));
    } catch (e) {
      const msg = (e as Error).message;
      logger.error(CTX, 'Failed to start bridge', { error: msg });
      vscode.window.showErrorMessage(i18n.s.bridgeFailedStart(msg));
    }
  }

  stopBridge(): void {
    if (!this.server.isRunning) {
      vscode.window.showInformationMessage(i18n.s.bridgeNotRunning);
      return;
    }
    this.server.stop();
    this.logChannel.appendLine('[GMSync] Bridge server stopped');
    vscode.window.showInformationMessage(i18n.s.bridgeStopped);
  }

  async installBridgeAssets(): Promise<void> {
    const root = this.getProjectRoot();
    const yyp  = this.getYypPath();
    if (!root || !yyp) {
      vscode.window.showErrorMessage(i18n.s.bridgeProjectNotLoaded);
      return;
    }

    if (isBridgeInstalled(root)) {
      const reinstallOpt = i18n.s.bridgeReinstall;
      const choice = await vscode.window.showQuickPick(
        [reinstallOpt, i18n.s.bridgeCancel],
        { placeHolder: i18n.s.bridgeAlreadyInstalled },
      );
      if (choice !== reinstallOpt) return;
      // Сначала удаляем старые файлы, иначе installBridge вернётся без изменений
      await uninstallBridge(root, yyp);
    }

    const ok = await installBridge(root, yyp);
    if (ok) {
      vscode.window.showInformationMessage(i18n.s.bridgeInstalled);
    } else {
      vscode.window.showErrorMessage(i18n.s.bridgeInstallFailed);
    }
  }

  async uninstallBridgeAssets(): Promise<void> {
    const root = this.getProjectRoot();
    const yyp  = this.getYypPath();
    if (!root || !yyp) {
      vscode.window.showErrorMessage(i18n.s.bridgeProjectNotLoaded);
      return;
    }

    const uninstallOpt = i18n.s.bridgeUninstallConfirm;
    const choice = await vscode.window.showQuickPick(
      [uninstallOpt, i18n.s.bridgeCancel],
      { placeHolder: i18n.s.bridgeUninstallPlaceholder },
    );
    if (choice !== uninstallOpt) return;

    const ok = await uninstallBridge(root, yyp);
    if (ok) {
      vscode.window.showInformationMessage(i18n.s.bridgeUninstalled);
    } else {
      vscode.window.showErrorMessage(i18n.s.bridgeUninstallFailed);
    }
  }

  async sendCommandPicker(): Promise<void> {
    if (!this.server.isConnected) {
      vscode.window.showWarningMessage(i18n.s.bridgeGameNotConnected);
      return;
    }

    const model = this.getModel();
    const s = i18n.s;

    // ── Шаг 1: Выбор категории ────────────────────────────────────────────────
    const CATEGORIES = [
      { label: s.bridgePickerCatDiag,    detail: s.bridgePickerCatDiagDetail,    idx: 0 },
      { label: s.bridgePickerCatRoom,    detail: model ? s.bridgePickerCatRoomDetail(Object.keys(model.rooms).length) : s.bridgePickerCatRoomNoRooms, idx: 1 },
      { label: s.bridgePickerCatObjects, detail: s.bridgePickerCatObjectsDetail,  idx: 2 },
      { label: s.bridgePickerCatGlobals, detail: s.bridgePickerCatGlobalsDetail,  idx: 3 },
      { label: s.bridgePickerCatAudio,   detail: model && Object.keys(model.sounds).length ? s.bridgePickerCatAudioDetail(Object.keys(model.sounds).length) : s.bridgePickerCatAudioNoSounds, idx: 4 },
      { label: s.bridgePickerCatGame,    detail: s.bridgePickerCatGameDetail,     idx: 5 },
      { label: s.bridgePickerCatManual,    detail: s.bridgePickerCatManualDetail,   idx: 6 },
      { label: s.bridgePickerCatInstVars,  detail: s.bridgePickerCatInstVarsDetail, idx: 7 },
    ];

    const catPick = await vscode.window.showQuickPick(CATEGORIES, {
      placeHolder: s.bridgePickerCatPlaceholder,
      matchOnDetail: true,
    });
    if (!catPick) return;

    let command: string | undefined;

    // ── Диагностика (idx=0) ───────────────────────────────────────────────────
    if (catPick.idx === 0) {
      const diag = await vscode.window.showQuickPick([
        { label: 'ping',                        detail: s.bridgePickerDiagPingDetail },
        { label: 'get_fps',                     detail: s.bridgePickerDiagFpsDetail },
        { label: 'room_info',                   detail: s.bridgePickerDiagRoomInfoDetail },
        { label: 'gml_eval fps',                detail: s.bridgePickerDiagFpsValDetail },
        { label: 'gml_eval fps_real',           detail: s.bridgePickerDiagFpsRealDetail },
        { label: 'gml_eval room',               detail: s.bridgePickerDiagRoomValDetail },
        { label: 'gml_eval room_width',         detail: s.bridgePickerDiagRoomWDetail },
        { label: 'gml_eval room_height',        detail: s.bridgePickerDiagRoomHDetail },
        { label: 'gml_eval current_time',       detail: s.bridgePickerDiagTimeDetail },
        { label: 'gml_eval game_id',            detail: s.bridgePickerDiagGameIdDetail },
        { label: 'gml_eval os_type',            detail: s.bridgePickerDiagOsDetail },
        { label: 'gml_eval instance_count_all', detail: s.bridgePickerDiagInstCountDetail },
        { label: 'hud_toggle', detail: s.bridgePickerHudToggleDetail },
        { label: 'hud_clear',  detail: s.bridgePickerHudClearDetail },
      ], { placeHolder: s.bridgePickerDiagPlaceholder, matchOnDetail: true });
      command = diag?.label;
    }

    // ── Перейти в комнату (idx=1) ─────────────────────────────────────────────
    else if (catPick.idx === 1) {
      const roomNames = model ? Object.keys(model.rooms) : [];
      if (!roomNames.length) {
        vscode.window.showWarningMessage(s.bridgePickerNoRooms);
        return;
      }
      const roomPick = await vscode.window.showQuickPick(
        roomNames.map(r => ({ label: r, detail: `goto_room ${r}` })),
        { placeHolder: s.bridgePickerRoomPlaceholder, matchOnDetail: true },
      );
      if (!roomPick) return;
      command = `goto_room ${roomPick.label}`;
    }

    // ── Объекты в комнате (idx=2) ─────────────────────────────────────────────
    else if (catPick.idx === 2) {
      const [roomObjRes, roomInfoRes] = await Promise.all([
        this.server.sendCommand('room_objects'),
        this.server.sendCommand('room_info'),
      ]);

      type RoomObj = { name: string; count: number };
      let liveObjects: RoomObj[] = [];
      if (roomObjRes.success && roomObjRes.result && !roomObjRes.result.startsWith('error:')) {
        liveObjects = roomObjRes.result.split(',')
          .filter(str => str.includes(':'))
          .map(str => { const [n, c] = str.split(':'); return { name: n.trim(), count: parseInt(c, 10) || 0 }; });
      }

      const currentRoom = (roomInfoRes.success && roomInfoRes.result && !roomInfoRes.result.startsWith('error:'))
        ? roomInfoRes.result.split('|')[0]
        : undefined;

      const action = await vscode.window.showQuickPick([
        { label: s.bridgePickerObjCount,   detail: s.bridgePickerObjCountDetail,   idx: 0 },
        { label: s.bridgePickerObjCreate,  detail: s.bridgePickerObjCreateDetail,  idx: 1 },
        { label: s.bridgePickerObjDestroy, detail: s.bridgePickerObjDestroyDetail, idx: 2 },
      ], {
        placeHolder: s.bridgePickerObjPlaceholder(currentRoom),
        matchOnDetail: true,
      });
      if (!action) return;

      const projectObjNames = model ? Object.keys(model.objects) : [];
      const allObjItems = liveObjects.length
        ? [
            ...liveObjects.map(o => ({ label: o.name, description: s.bridgePickerObjInstCount(o.count), detail: s.bridgePickerObjInRoom })),
            { label: s.bridgePickerObjAllSeparator, description: '', detail: '' },
            ...projectObjNames
              .filter(n => !liveObjects.find(o => o.name === n))
              .map(n => ({ label: n, description: '', detail: s.bridgePickerObjNotInRoom })),
          ]
        : projectObjNames.map(n => ({ label: n, description: '', detail: '' }));

      if (action.idx === 0) {
        const obj = await vscode.window.showQuickPick(
          allObjItems.filter(o => o.label !== s.bridgePickerObjAllSeparator),
          { placeHolder: s.bridgePickerObjSelectPlaceholder, matchOnDetail: true },
        );
        if (!obj) return;
        command = `instance_count ${obj.label}`;
      }

      else if (action.idx === 1) {
        const obj = await vscode.window.showQuickPick(
          allObjItems.filter(o => o.label !== s.bridgePickerObjAllSeparator),
          { placeHolder: s.bridgePickerObjCreatePlaceholder, matchOnDetail: true },
        );
        if (!obj) return;

        const xStr = await vscode.window.showInputBox({ prompt: s.promptXPos, value: '0' });
        if (xStr === undefined) return;
        const yStr = await vscode.window.showInputBox({ prompt: s.promptYPos, value: '0' });
        if (yStr === undefined) return;

        const layerInput = await vscode.window.showInputBox({
          prompt: s.bridgePickerObjLayerPrompt,
          value: 'Instances',
          placeHolder: 'Instances',
        });
        if (layerInput === undefined) return;
        command = `instance_create ${obj.label} ${xStr} ${yStr} ${layerInput || 'Instances'}`;
      }

      else if (action.idx === 2) {
        const idStr = await vscode.window.showInputBox({
          prompt: s.bridgePickerObjDestroyPrompt,
          placeHolder: '100001',
        });
        if (!idStr) return;
        command = `instance_destroy ${idStr}`;
      }
    }

    // ── Глобальные переменные (idx=3) ─────────────────────────────────────────
    else if (catPick.idx === 3) {
      const liveResult = await this.server.sendCommand('list_globals');
      let globalVars: string[] = [];

      const isLiveData = liveResult.success && liveResult.result && !liveResult.result.startsWith('error:');

      if (isLiveData) {
        globalVars = liveResult.result!.split(',')
          .map(v => v.trim())
          .filter(v =>
            v.length > 0 &&
            !v.startsWith('__') &&
            !v.startsWith('_gsb_') &&
            !v.startsWith('___') &&
            !v.includes('@@'),
          )
          .sort();
      } else {
        globalVars = model ? _scanGlobalVars(model) : [];
      }

      const action = await vscode.window.showQuickPick([
        { label: s.bridgePickerGlobRead,  detail: s.bridgePickerGlobReadDetail,  idx: 0 },
        { label: s.bridgePickerGlobWrite, detail: s.bridgePickerGlobWriteDetail, idx: 1 },
      ], { placeHolder: s.bridgePickerGlobActionPlaceholder, matchOnDetail: true });
      if (!action) return;

      let varName: string | undefined;
      if (globalVars.length) {
        let varItems: { label: string; description: string; detail: string }[];
        if (isLiveData && globalVars.length <= 20) {
          const valueResults = await Promise.all(
            globalVars.map(v => this.server.sendCommand(`gml_eval global.${v}`)),
          );
          varItems = globalVars.map((v, i) => {
            const raw = valueResults[i].result ?? '';
            const isFunc = raw.startsWith('function ');
            return {
              label: v,
              description: isFunc ? s.bridgePickerGlobFuncDesc : raw.slice(0, 40),
              detail: isFunc ? s.bridgePickerGlobFuncDetail : s.bridgePickerGlobCurrentValue,
            };
          });
        } else {
          varItems = globalVars.map(v => ({ label: v, description: '', detail: s.bridgePickerGlobFromGame }));
        }

        const varPick = await vscode.window.showQuickPick(
          [
            ...varItems,
            { label: s.bridgePickerCatManual, description: '', detail: s.bridgePickerGlobManualDetail },
          ],
          {
            placeHolder: s.bridgePickerGlobCountPlaceholder(globalVars.length),
            matchOnDetail: true,
          },
        );
        if (!varPick) return;
        varName = varPick.label === s.bridgePickerCatManual
          ? await vscode.window.showInputBox({ prompt: s.bridgePickerGlobNamePrompt, placeHolder: 'score' })
          : varPick.label;
      } else {
        varName = await vscode.window.showInputBox({
          prompt: s.bridgePickerGlobNoVarsPrompt,
          placeHolder: 'score',
        });
      }
      if (!varName) return;

      if (action.idx === 0) {
        command = `gml_eval global.${varName}`;
      } else {
        const val = await vscode.window.showInputBox({
          prompt: s.bridgePickerGlobNewValue(varName),
          placeHolder: '9999',
        });
        if (val === undefined) return;
        command = `gml_eval global.${varName}=${val}`;
      }
    }

    // ── Аудио (idx=4) ─────────────────────────────────────────────────────────
    else if (catPick.idx === 4) {
      const soundNames = model ? Object.keys(model.sounds) : [];

      const action = await vscode.window.showQuickPick([
        { label: s.bridgePickerAudioPlay, detail: soundNames.length ? s.bridgePickerCatAudioDetail(soundNames.length) : s.bridgePickerCatAudioNoSounds, idx: 0 },
        { label: s.bridgePickerAudioStop, detail: 'audio_stop_all', idx: 1 },
      ], { placeHolder: s.bridgePickerAudioPlaceholder, matchOnDetail: true });
      if (!action) return;

      if (action.idx === 1) {
        command = 'audio_stop_all';
      } else {
        let soundName: string | undefined;
        if (soundNames.length) {
          const sndPick = await vscode.window.showQuickPick(
            [
              ...soundNames.map(snd => ({ label: snd })),
              { label: s.bridgePickerCatManual },
            ],
            { placeHolder: s.bridgePickerAudioSelectPlaceholder },
          );
          if (!sndPick) return;
          soundName = sndPick.label === s.bridgePickerCatManual
            ? await vscode.window.showInputBox({ prompt: s.bridgePickerAudioNamePrompt, placeHolder: 'snd_jump' })
            : sndPick.label;
        } else {
          soundName = await vscode.window.showInputBox({ prompt: s.bridgePickerAudioNamePrompt, placeHolder: 'snd_jump' });
        }
        if (!soundName) return;
        command = `audio_play ${soundName}`;
      }
    }

    // ── Игра (idx=5) ──────────────────────────────────────────────────────────
    else if (catPick.idx === 5) {
      const act = await vscode.window.showQuickPick([
        { label: s.bridgePickerGameRestart, detail: 'game_restart', idx: 0 },
        { label: s.bridgePickerGameEnd,     detail: 'game_end',     idx: 1 },
      ], { placeHolder: s.bridgePickerGamePlaceholder, matchOnDetail: true });
      if (!act) return;
      command = act.idx === 0 ? 'game_restart' : 'game_end';
    }

    // ── Ввести вручную (idx=6) ────────────────────────────────────────────────
    else if (catPick.idx === 6) {
      command = await vscode.window.showInputBox({
        prompt: s.bridgePickerManualPrompt,
        placeHolder: 'gml_eval global.hp=100',
      });
    }

    // ── Переменные инстанса (idx=7) ───────────────────────────────────────────
    else if (catPick.idx === 7) {
      // Шаг 1: живые объекты в комнате
      const roomObjRes = await this.server.sendCommand('room_objects');
      type RoomObj = { name: string; count: number };
      let liveObjects: RoomObj[] = [];
      if (roomObjRes.success && roomObjRes.result && !roomObjRes.result.startsWith('error:')) {
        liveObjects = roomObjRes.result.split(',')
          .filter(str => str.includes(':'))
          .map(str => { const [n, c] = str.split(':'); return { name: n.trim(), count: parseInt(c, 10) || 0 }; });
      }
      if (!liveObjects.length) {
        vscode.window.showWarningMessage(s.bridgePickerInstNoInsts);
        return;
      }

      // Шаг 2: выбор объекта
      const objPick = await vscode.window.showQuickPick(
        liveObjects.map(o => ({ label: o.name, description: s.bridgePickerObjInstCount(o.count) })),
        { placeHolder: s.bridgePickerInstSelectObj },
      );
      if (!objPick) return;

      // Шаг 3: список инстансов объекта
      const instRes = await this.server.sendCommand(`list_instances ${objPick.label}`);
      const instIds = (instRes.success && instRes.result && !instRes.result.startsWith('error:'))
        ? instRes.result.split(',').filter(x => x.trim())
        : [];
      if (!instIds.length) {
        vscode.window.showWarningMessage(s.bridgePickerInstNoInsts);
        return;
      }

      // Шаг 4: выбор конкретного инстанса
      const instPick = await vscode.window.showQuickPick(
        instIds.map(id => ({ label: id, description: objPick.label })),
        { placeHolder: s.bridgePickerInstSelectInst(objPick.label, instIds.length) },
      );
      if (!instPick) return;

      // Шаг 5: действие (читать / задать)
      const varAction = await vscode.window.showQuickPick([
        { label: s.bridgePickerInstVarRead,  detail: s.bridgePickerInstVarReadDetail,  idx: 0 },
        { label: s.bridgePickerInstVarWrite, detail: s.bridgePickerInstVarWriteDetail, idx: 1 },
      ], { placeHolder: s.bridgePickerInstVarAction, matchOnDetail: true });
      if (!varAction) return;

      // Шаг 6: список переменных инстанса
      const varListRes = await this.server.sendCommand(`var_instance_list ${instPick.label}`);
      const instVars = (varListRes.success && varListRes.result && !varListRes.result.startsWith('error:'))
        ? varListRes.result.split(',').filter(v => v.trim() && !v.startsWith('__')).sort()
        : [];

      let varName: string | undefined;
      if (instVars.length) {
        const varPick = await vscode.window.showQuickPick(
          [
            ...instVars.map(v => ({ label: v })),
            { label: s.bridgePickerCatManual },
          ],
          { placeHolder: s.bridgePickerInstVarSelect(instVars.length) },
        );
        if (!varPick) return;
        varName = varPick.label === s.bridgePickerCatManual
          ? await vscode.window.showInputBox({ prompt: s.bridgePickerGlobNamePrompt, placeHolder: 'hp' })
          : varPick.label;
      } else {
        varName = await vscode.window.showInputBox({ prompt: s.bridgePickerGlobNamePrompt, placeHolder: 'hp' });
      }
      if (!varName) return;

      if (varAction.idx === 0) {
        command = `var_instance_get ${instPick.label} ${varName}`;
      } else {
        const val = await vscode.window.showInputBox({
          prompt: s.bridgePickerInstVarNewValue(varName, instPick.label),
          placeHolder: '100',
        });
        if (val === undefined) return;
        command = `var_instance_set ${instPick.label} ${varName} ${val}`;
      }
    }

    if (!command) return;

    const result = await this.server.sendCommand(command);
    this.logChannel.appendLine(`> ${command}`);
    if (result.success) {
      this.logChannel.appendLine(`< ${result.result}`);
    } else {
      this.logChannel.appendLine(`! error: ${result.error}`);
    }
    this.logChannel.show(true);
  }

  showLogs(): void {
    this.logChannel.show();
  }

  // ── Log batching ──────────────────────────────────────────────────────────

  private flushLogs(): void {
    if (this.logTimer) { clearTimeout(this.logTimer); this.logTimer = null; }
    if (this.logBatch.length === 0) return;
    this.logChannel.append(this.logBatch.join('\n') + '\n');
    this.logBatch = [];
  }

  // ── Status Bar ────────────────────────────────────────────────────────────

  private updateStatus(): void {
    const running   = this.server.isRunning;
    const connected = this.server.isConnected;

    vscode.commands.executeCommand('setContext', 'gmsync.bridge.running', running);

    if (!running) {
      this.statusItem.text    = '$(debug-disconnect) Bridge: off';
      this.statusItem.tooltip = i18n.s.bridgeStatusOffTooltip;
      this.statusItem.backgroundColor = undefined;
    } else if (!connected) {
      this.statusItem.text    = '$(plug) Bridge: waiting…';
      this.statusItem.tooltip = i18n.s.bridgeStatusWaitingTooltip(BRIDGE_GAME_PORT);
      this.statusItem.backgroundColor = undefined;
    } else {
      this.statusItem.text    = '$(circle-filled) Bridge: connected';
      this.statusItem.tooltip = i18n.s.bridgeStatusConnectedTooltip;
      this.statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    }
  }

  dispose(): void {
    this.flushLogs();
    if (this.logRateTimer) { clearTimeout(this.logRateTimer); this.logRateTimer = null; }
    this.server.stop();
    this.statusItem.dispose();
    this.logChannel.dispose();
  }
}

// ── Хелперы ───────────────────────────────────────────────────────────────────

/**
 * Сканирует .gml файлы в ProjectModel и собирает уникальные имена global.xxx.
 * Возвращает отсортированный список имён переменных (без "global." префикса).
 */
function _scanGlobalVars(model: ProjectModel): string[] {
  const found = new Set<string>();
  const GLOBAL_RE = /\bglobal\.([a-zA-Z_]\w*)/g;

  const scanFile = (filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let m: RegExpExecArray | null;
      GLOBAL_RE.lastIndex = 0;
      while ((m = GLOBAL_RE.exec(content)) !== null) {
        found.add(m[1]);
      }
    } catch { /* файл недоступен */ }
  };

  const root = model.projectRoot;

  // Объекты: все .gml файлы событий
  for (const obj of Object.values(model.objects)) {
    for (const ev of obj.events) {
      scanFile(path.join(root, 'objects', obj.name, ev.gmlFile));
    }
  }

  // Скрипты
  for (const scr of Object.values(model.scripts)) {
    const gmlPath = path.join(root, 'scripts', scr.name, `${scr.name}.gml`);
    scanFile(gmlPath);
  }

  return [...found].sort();
}
