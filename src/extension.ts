import * as vscode from 'vscode';
import * as path from 'path';
import { GmsOrchestrator } from './orchestrator';
import { initLogger, logger } from './utils/logger';
import { addRoomInstance, getRoomYyPath } from './writer/roomWriter';
import {
  addLayer, removeLayer, setBackgroundColour, setBackgroundSprite,
  getRoomLayers, parseColourInput, type LayerType,
} from './writer/roomLayerManager';
import { modifyEvent, writeGmlFile } from './writer/gmlWriter';
import { createScript } from './writer/scriptCreator';
import { createRoom } from './writer/roomCreator';
import { createShader } from './writer/shaderCreator';
import { createTimeline } from './writer/timelineCreator';
import { createSprite } from './writer/spriteCreator';
import { createFont } from './writer/fontCreator';
import { createPath } from './writer/pathCreator';
import { createSequence } from './writer/sequenceCreator';
import { createNote } from './writer/noteCreator';
import { duplicateObject } from './writer/objectDuplicator';
import { triggerRescan } from './trigger/rescanPing';
import { GMS2_EVENT_LIST } from './model/projectModel';
import { ProjectTreeProvider } from './ui/projectTreeProvider';
import { StatusBarManager } from './ui/statusBarManager';
import { BridgeModule } from './bridge/bridgeModule';
import { ThemePickerPanel } from './ui/themePickerPanel';
import { SettingsPanel } from './ui/settingsPanel';
import { GML_THEMES } from './ui/gmlThemes';
import { i18n } from './i18n/i18n';

const CTX = 'Extension';

let orchestrator: GmsOrchestrator | undefined;

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const channel = vscode.window.createOutputChannel('GMSync: AI Edition');
  ctx.subscriptions.push(channel);
  initLogger(channel);

  logger.info(CTX, 'GMSync: AI Edition activating...');

  // ── Инициализация языка и GML темы ────────────────────────────────────────
  i18n.init(ctx);
  await ThemePickerPanel.restoreTheme(ctx);

  // ── UI: Status Bar + Tree View ────────────────────────────────────────────
  const statusBar = new StatusBarManager();
  ctx.subscriptions.push(statusBar);

  const treeProvider = new ProjectTreeProvider();
  const treeView = vscode.window.createTreeView('gms2LiveEditTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  ctx.subscriptions.push(treeView);
  ctx.subscriptions.push(
    treeView.onDidChangeVisibility(e => {
      if (e.visible) {
        const model = orchestrator?.getModel();
        if (model) treeProvider.refresh(model);
      }
    }),
  );

  // ── Theme Picker — кнопка в Status Bar ───────────────────────────────────
  const themeStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 97);
  themeStatusItem.command = 'gms2-live-edit.pickTheme';
  _updateThemeStatusBar(themeStatusItem, ctx);
  themeStatusItem.show();
  ctx.subscriptions.push(themeStatusItem);

  // Callback при смене языка — обновить status bar + Settings Panel
  const onLangChange = () => {
    _updateThemeStatusBar(themeStatusItem, ctx);
    SettingsPanel.refreshCurrent();
    ThemePickerPanel.refreshCurrent();
  };

  ctx.subscriptions.push(
    vscode.commands.registerCommand('gms2-live-edit.pickTheme', () => {
      ThemePickerPanel.open(ctx);
      _updateThemeStatusBar(themeStatusItem, ctx);
    }),
    vscode.commands.registerCommand('gms2-live-edit.openSettings', () => {
      SettingsPanel.open(ctx, onLangChange);
    }),
  );

  // ── Поиск .yyp ────────────────────────────────────────────────────────────
  const yypUri = await findYypFile();
  if (!yypUri) {
    logger.warn(CTX, 'No .yyp file found in workspace — extension idle');
    statusBar.set('idle');
    return;
  }

  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(yypUri.fsPath);

  orchestrator = new GmsOrchestrator(workspaceRoot, yypUri.fsPath);

  // Подключаем UI callbacks до initialize()
  orchestrator.onModelChange(model => treeProvider.refresh(model));
  orchestrator.onStatusChange((status, detail) => {
    statusBar.set(status, detail);
    treeProvider.setStatus(status, detail);
    // Обновляем описание заголовка панели
    treeView.description = status === 'watching'
      ? `👁 ${detail ?? ''}`
      : status === 'applying' ? '⟳ applying'
      : status === 'error'   ? '✕ error'
      : '';
  });

  ctx.subscriptions.push({ dispose: () => orchestrator?.dispose() });

  ctx.subscriptions.push(
    // ── Утилиты ──────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.openLogs', () => channel.show()),
    vscode.commands.registerCommand('gms2-live-edit.reloadProject', async () => {
      logger.info(CTX, 'Manual project reload requested');
      await orchestrator?.fullCleanupAndReload();
      vscode.window.showInformationMessage(i18n.s.projectReloaded);
    }),
    vscode.commands.registerCommand('gms2-live-edit.refreshTree', () => {
      const model = orchestrator?.getModel();
      if (model) treeProvider.refresh(model);
    }),

    // ── create_object ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createObject', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptObjectName, placeHolder: 'obj_enemy' });
      if (!name) return;

      const ok = await orchestrator!.createObject(name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.objectCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreateObject(name));
      }
    }),

    // ── modify_event ──────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.modifyEvent', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const objNames = Object.keys(model.objects);
      if (!objNames.length) { vscode.window.showErrorMessage(i18n.s.noObjects); return; }

      const objName = await vscode.window.showQuickPick(objNames, { placeHolder: i18n.s.selectObject });
      if (!objName) return;

      const evPick = await vscode.window.showQuickPick(
        GMS2_EVENT_LIST.map(e => e.label),
        { placeHolder: i18n.s.selectEvent },
      );
      if (!evPick) return;
      const evEntry = GMS2_EVENT_LIST.find(e => e.label === evPick)!;

      let collisionObjName: string | undefined;
      if (evEntry.isCollision) {
        collisionObjName = await vscode.window.showQuickPick(objNames, { placeHolder: i18n.s.collisionTarget });
        if (!collisionObjName) return;
      }

      const gmlCode = await vscode.window.showInputBox({
        prompt: i18n.s.promptGmlCode,
        placeHolder: 'show_debug_message("hello");',
      });
      if (gmlCode === undefined) return;

      const code = gmlCode.replace(/\\n/g, '\n');
      const ok = modifyEvent(model.projectRoot, model, objName, evEntry.eventType, evEntry.eventNum, code, collisionObjName);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.eventWritten(objName));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedModifyEvent);
      }
    }),

    // ── write_gml_file ────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.writeGmlFile', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const relPath = await vscode.window.showInputBox({
        prompt: i18n.s.promptRelPath,
        placeHolder: 'objects/obj_player/Create_0.gml',
      });
      if (!relPath) return;

      const content = await vscode.window.showInputBox({
        prompt: i18n.s.promptGmlContent,
        placeHolder: 'hp = 100;',
      });
      if (content === undefined) return;

      const ok = writeGmlFile(model.projectRoot, relPath, content.replace(/\\n/g, '\n'));
      if (ok) {
        vscode.window.showInformationMessage(i18n.s.fileWritten(relPath));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedWriteFile);
      }
    }),

    // ── create_script ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createScript', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptScriptName, placeHolder: 'scr_utils' });
      if (!name) return;

      const ok = await createScript(model.projectRoot, model.yypPath, name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.scriptCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreateScript(name));
      }
    }),

    // ── create_room ───────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createRoom', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptRoomName, placeHolder: 'Room2' });
      if (!name) return;

      const ok = await createRoom(model.projectRoot, model.yypPath, name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.roomCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreateRoom(name));
      }
    }),

    // ── create_shader ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createShader', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptShaderName, placeHolder: 'shd_bloom' });
      if (!name) return;

      const ok = await createShader(model.projectRoot, model.yypPath, name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.shaderCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreateShader(name));
      }
    }),

    // ── create_timeline ───────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createTimeline', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptTimelineName, placeHolder: 'tl_intro' });
      if (!name) return;

      const ok = await createTimeline(model.projectRoot, model.yypPath, name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.timelineCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreateTimeline(name));
      }
    }),

    // ── duplicate_object ──────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.duplicateObject', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const objNames = Object.keys(model.objects);
      if (!objNames.length) { vscode.window.showErrorMessage(i18n.s.noObjectsToDuplicate); return; }

      const srcName = await vscode.window.showQuickPick(objNames, { placeHolder: i18n.s.sourceObject });
      if (!srcName) return;

      const newName = await vscode.window.showInputBox({ prompt: i18n.s.promptNewObjectName, placeHolder: `${srcName}_copy` });
      if (!newName) return;

      const ok = await duplicateObject(model.projectRoot, model.yypPath, model, srcName, newName);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.duplicated(srcName, newName));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedDuplicate(srcName));
      }
    }),

    // ── create_sprite ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createSprite', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptSpriteName, placeHolder: 'spr_player' });
      if (!name) return;

      const ok = await createSprite(model.projectRoot, model.yypPath, name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.spriteCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreateSprite(name));
      }
    }),

    // ── create_font ───────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createFont', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptFontName, placeHolder: 'fnt_ui' });
      if (!name) return;

      const ok = await createFont(model.projectRoot, model.yypPath, name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.fontCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreateFont(name));
      }
    }),

    // ── create_path ───────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createPath', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptPathName, placeHolder: 'path_patrol' });
      if (!name) return;

      const ok = await createPath(model.projectRoot, model.yypPath, name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.pathCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreatePath(name));
      }
    }),

    // ── create_sequence ───────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createSequence', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptSequenceName, placeHolder: 'seq_intro' });
      if (!name) return;

      const ok = await createSequence(model.projectRoot, model.yypPath, name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.sequenceCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreateSequence(name));
      }
    }),

    // ── create_note ───────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.createNote', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const name = await vscode.window.showInputBox({ prompt: i18n.s.promptNoteName, placeHolder: 'note_design' });
      if (!name) return;

      const ok = await createNote(model.projectRoot, model.yypPath, name);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.noteCreated(name));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedCreateNote(name));
      }
    }),

    // ── add_room_instance ─────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.addRoomInstance', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const roomNames = Object.keys(model.rooms);
      const objNames = Object.keys(model.objects);
      if (!roomNames.length) { vscode.window.showErrorMessage(i18n.s.noRooms); return; }
      if (!objNames.length)  { vscode.window.showErrorMessage(i18n.s.noObjectsInProject); return; }

      const roomName = await vscode.window.showQuickPick(roomNames, { placeHolder: i18n.s.selectRoom });
      if (!roomName) return;

      const objName = await vscode.window.showQuickPick(objNames, { placeHolder: i18n.s.selectObject });
      if (!objName) return;

      const xStr = await vscode.window.showInputBox({ prompt: i18n.s.promptXPos, value: '0' });
      if (xStr === undefined) return;
      const yStr = await vscode.window.showInputBox({ prompt: i18n.s.promptYPos, value: '0' });
      if (yStr === undefined) return;

      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);
      if (isNaN(x) || isNaN(y)) { vscode.window.showErrorMessage(i18n.s.xyMustBeNumbers); return; }

      const roomYyPath = getRoomYyPath(model.projectRoot, roomName);
      addRoomInstance(roomYyPath, objName, x, y, 'Instances', model);
      triggerRescan(model.projectRoot);
      setTimeout(() => orchestrator?.touchYyp(), 300);
      vscode.window.showInformationMessage(i18n.s.instanceAdded(objName, roomName, x, y));
    }),

    // ── add_layer ─────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.addLayer', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const roomNames = Object.keys(model.rooms);
      if (!roomNames.length) { vscode.window.showErrorMessage(i18n.s.noRooms); return; }

      const roomName = await vscode.window.showQuickPick(roomNames, { placeHolder: i18n.s.selectRoom });
      if (!roomName) return;

      const LAYER_TYPES: { label: string; type: LayerType }[] = [
        { label: 'Instance Layer (GMRInstanceLayer)',   type: 'GMRInstanceLayer' },
        { label: 'Background Layer (GMRBackgroundLayer)', type: 'GMRBackgroundLayer' },
      ];
      const typePick = await vscode.window.showQuickPick(
        LAYER_TYPES.map(t => t.label),
        { placeHolder: i18n.s.selectLayerType },
      );
      if (!typePick) return;
      const layerType = LAYER_TYPES.find(t => t.label === typePick)!.type;

      const layerName = await vscode.window.showInputBox({ prompt: i18n.s.promptLayerName, placeHolder: 'MyLayer' });
      if (!layerName) return;

      const depthStr = await vscode.window.showInputBox({ prompt: i18n.s.promptLayerDepth, value: '0' });
      if (depthStr === undefined) return;
      const depth = parseInt(depthStr, 10);
      if (isNaN(depth)) { vscode.window.showErrorMessage(i18n.s.xyMustBeNumbers); return; }

      let colour: number | undefined;
      if (layerType === 'GMRBackgroundLayer') {
        const colourStr = await vscode.window.showInputBox({ prompt: i18n.s.promptColour, value: '#000000' });
        if (colourStr === undefined) return;
        const parsed = parseColourInput(colourStr);
        if (parsed === null) { vscode.window.showErrorMessage(i18n.s.failedSetBgColour); return; }
        colour = parsed;
      }

      const roomYyPath = getRoomYyPath(model.projectRoot, roomName);
      const ok = addLayer(roomYyPath, layerName, layerType, depth, colour);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.layerAdded(roomName, layerName));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedAddLayer);
      }
    }),

    // ── remove_layer ──────────────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.removeLayer', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const roomNames = Object.keys(model.rooms);
      if (!roomNames.length) { vscode.window.showErrorMessage(i18n.s.noRooms); return; }

      const roomName = await vscode.window.showQuickPick(roomNames, { placeHolder: i18n.s.selectRoom });
      if (!roomName) return;

      const roomYyPath = getRoomYyPath(model.projectRoot, roomName);
      const layers = getRoomLayers(roomYyPath);
      if (!layers.length) { vscode.window.showErrorMessage(i18n.s.noLayersFound); return; }

      const layerName = await vscode.window.showQuickPick(
        layers.map(l => `${l.name}  [${l.resourceType}]`),
        { placeHolder: i18n.s.selectLayer },
      );
      if (!layerName) return;
      const targetName = layerName.split('  [')[0];

      const ok = removeLayer(roomYyPath, targetName);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        setTimeout(() => triggerRescan(model.projectRoot), 1500);
        vscode.window.showInformationMessage(i18n.s.layerRemoved(roomName, targetName));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedRemoveLayer);
      }
    }),

    // ── set_background_colour ─────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.setBackgroundColour', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const roomNames = Object.keys(model.rooms);
      if (!roomNames.length) { vscode.window.showErrorMessage(i18n.s.noRooms); return; }

      const roomName = await vscode.window.showQuickPick(roomNames, { placeHolder: i18n.s.selectRoom });
      if (!roomName) return;

      const roomYyPath = getRoomYyPath(model.projectRoot, roomName);
      const bgLayers = getRoomLayers(roomYyPath).filter(l => l.resourceType === 'GMRBackgroundLayer');
      if (!bgLayers.length) { vscode.window.showErrorMessage(i18n.s.noLayersFound); return; }

      const layerName = await vscode.window.showQuickPick(bgLayers.map(l => l.name), { placeHolder: i18n.s.selectLayer });
      if (!layerName) return;

      const colourStr = await vscode.window.showInputBox({ prompt: i18n.s.promptColour, value: '#000000' });
      if (colourStr === undefined) return;
      const colour = parseColourInput(colourStr);
      if (colour === null) { vscode.window.showErrorMessage(i18n.s.failedSetBgColour); return; }

      const ok = setBackgroundColour(roomYyPath, layerName, colour);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        vscode.window.showInformationMessage(i18n.s.bgColourSet(roomName, layerName));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedSetBgColour);
      }
    }),

    // ── set_background_sprite ─────────────────────────────────────────────────
    vscode.commands.registerCommand('gms2-live-edit.setBackgroundSprite', async () => {
      const model = orchestrator?.getModel();
      if (!model) { vscode.window.showErrorMessage(i18n.s.projectNotLoaded); return; }

      const roomNames = Object.keys(model.rooms);
      if (!roomNames.length) { vscode.window.showErrorMessage(i18n.s.noRooms); return; }

      const roomName = await vscode.window.showQuickPick(roomNames, { placeHolder: i18n.s.selectRoom });
      if (!roomName) return;

      const roomYyPath = getRoomYyPath(model.projectRoot, roomName);
      const bgLayers = getRoomLayers(roomYyPath).filter(l => l.resourceType === 'GMRBackgroundLayer');
      if (!bgLayers.length) { vscode.window.showErrorMessage(i18n.s.noLayersFound); return; }

      const layerName = await vscode.window.showQuickPick(bgLayers.map(l => l.name), { placeHolder: i18n.s.selectLayer });
      if (!layerName) return;

      const spriteNames = ['(none — clear sprite)', ...Object.keys(model.sprites)];
      const spritePick = await vscode.window.showQuickPick(spriteNames, { placeHolder: i18n.s.selectLayer });
      if (!spritePick) return;
      const spriteName = spritePick === '(none — clear sprite)' ? null : spritePick;

      const ok = setBackgroundSprite(roomYyPath, layerName, spriteName);
      if (ok) {
        triggerRescan(model.projectRoot);
        setTimeout(() => orchestrator?.touchYyp(), 300);
        vscode.window.showInformationMessage(i18n.s.bgSpriteSet(roomName, layerName));
      } else {
        vscode.window.showErrorMessage(i18n.s.failedSetBgSprite);
      }
    }),
  );

  await orchestrator.initialize();

  // ── Bridge (Phase 8) — изолированный модуль, не трогает выше ─────────────
  const bridge = new BridgeModule(
    () => orchestrator?.getModel()?.projectRoot,
    () => orchestrator?.getModel()?.yypPath,
    () => orchestrator?.getModel(),
  );
  ctx.subscriptions.push(bridge);
  ctx.subscriptions.push(
    vscode.commands.registerCommand('gmsync.bridge.start',       () => bridge.startBridge()),
    vscode.commands.registerCommand('gmsync.bridge.stop',        () => bridge.stopBridge()),
    vscode.commands.registerCommand('gmsync.bridge.install',     () => bridge.installBridgeAssets()),
    vscode.commands.registerCommand('gmsync.bridge.uninstall',   () => bridge.uninstallBridgeAssets()),
    vscode.commands.registerCommand('gmsync.bridge.sendCommand', () => bridge.sendCommandPicker()),
    vscode.commands.registerCommand('gmsync.bridge.showLogs',    () => bridge.showLogs()),
  );

  logger.info(CTX, 'GMSync: AI Edition activated');
  vscode.window.showInformationMessage(i18n.s.activatedMsg(path.basename(yypUri.fsPath)));
}

export function deactivate(): void {
  orchestrator?.dispose();
  orchestrator = undefined;
  logger.info(CTX, 'GMSync: AI Edition deactivated');
}

async function findYypFile(): Promise<vscode.Uri | undefined> {
  const files = await vscode.workspace.findFiles('**/*.yyp', '**/node_modules/**', 1);
  return files[0];
}

function _updateThemeStatusBar(
  item: vscode.StatusBarItem,
  ctx: vscode.ExtensionContext,
): void {
  const id = ThemePickerPanel.getCurrentThemeId(ctx);
  const theme = GML_THEMES.find(t => t.id === id) ?? GML_THEMES[0];
  const isHacker = theme.isHacker === true;

  item.text    = isHacker ? `$(terminal) >_ HACKER` : `$(symbol-color) GML: ${theme.name}`;
  item.tooltip = isHacker
    ? i18n.s.themeTooltipHacker(theme.name)
    : i18n.s.themeTooltipNormal(theme.name);
  item.color = isHacker ? new vscode.ThemeColor('terminal.ansiGreen') : undefined;
  item.backgroundColor = isHacker
    ? new vscode.ThemeColor('statusBarItem.warningBackground')
    : undefined;
}
