import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { logger } from '../utils/logger';

const CTX = 'GmsWindowActivate';

/**
 * PowerShell-скрипт:
 *  1. Сохраняет текущее активное окно (VS Code).
 *  2. SetForegroundWindow → GMS2 получает реальный OS-фокус → Object Editor обновляется.
 *  3. Через 300ms возвращает фокус обратно (VS Code или другое окно).
 *  Флэш 300ms — достаточно для GMS2 обработать WM_SETFOCUS и перечитать .yy.
 *  НЕ использует WM_NCACTIVATE/WM_ACTIVATEAPP — они вызывают integrity check GMS2.
 */
const POWERSHELL_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'

$gm = Get-Process | Where-Object {
  $_.Name -match 'GameMaker' -and $_.MainWindowHandle -ne 0
} | Select-Object -First 1

if (-not $gm) {
  Write-Output "GMS2_NOT_FOUND"
  exit 0
}

if (-not ([System.Management.Automation.PSTypeName]'GmsWinApi').Type) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class GmsWinApi {
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public const uint WM_ACTIVATE = 0x0006;
  public const int WA_INACTIVE  = 0;
  public const int WA_ACTIVE    = 1;
}
"@ -ErrorAction SilentlyContinue
}

$hwnd = [IntPtr]$gm.MainWindowHandle
$prev = [GmsWinApi]::GetForegroundWindow()

# Даём GMS2 реальный OS-фокус — только так Object Editor обновляется.
# 300ms достаточно для GMS2 обработать WM_SETFOCUS и перечитать .yy.
[GmsWinApi]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 300

# Возвращаем фокус обратно (VS Code)
if ($prev -ne [IntPtr]::Zero -and $prev -ne $hwnd) {
  [GmsWinApi]::SetForegroundWindow($prev) | Out-Null
}

Write-Output "ACTIVATE_OK"
`;

/**
 * Активирует окно GMS2 IDE через SetForegroundWindow, затем возвращает фокус обратно.
 *
 * Используется для принудительного обновления Room Editor при добавлении инстанса.
 * Fire-and-forget: не блокирует основной поток.
 *
 * Windows: SetForegroundWindow(GMS2) → 300ms → SetForegroundWindow(prev)
 * Linux:   xdotool windowfocus/windowactivate (fallback: wmctrl)
 * macOS:   GMS2 IDE не поддерживается — пропускаем
 */
export function triggerGmsWindowActivate(): void {
  if (process.platform === 'win32') {
    activateGmsWindowWin32();
  } else if (process.platform === 'linux') {
    activateGmsWindowLinux();
  }
}

function activateGmsWindowWin32(): void {
  const tmpScript = path.join(os.tmpdir(), 'gms2_activate.ps1');

  try {
    fs.writeFileSync(tmpScript, POWERSHELL_SCRIPT, 'utf8');
  } catch (e) {
    logger.warn(CTX, 'Failed to write temp PS script', { error: String(e) });
    return;
  }

  exec(
    `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpScript}"`,
    { timeout: 8000 },
    (err, stdout) => {
      try { fs.unlinkSync(tmpScript); } catch { /* temp файл — игнорируем */ }

      if (err) {
        logger.warn(CTX, 'PowerShell window activate failed', { msg: err.message });
        return;
      }

      const out = stdout.trim();
      if (out === 'GMS2_NOT_FOUND') {
        logger.debug(CTX, 'GMS2 process not found — activate skipped');
      } else if (out === 'ACTIVATE_OK') {
        logger.info(CTX, 'SetForegroundWindow sent to GMS2 (focus restored)');
      }
    },
  );
}

// Bash-скрипт для Linux: пробует xdotool, fallback на wmctrl
const LINUX_SCRIPT = `#!/bin/bash
if command -v xdotool &>/dev/null; then
  WID=$(xdotool search --name "GameMaker" 2>/dev/null | head -1)
  if [ -n "$WID" ]; then
    xdotool windowfocus "$WID" 2>/dev/null
    sleep 0.3
    xdotool windowactivate "$WID" 2>/dev/null
    echo "ACTIVATE_OK"
  else
    echo "GMS2_NOT_FOUND"
  fi
elif command -v wmctrl &>/dev/null; then
  if wmctrl -a "GameMaker" 2>/dev/null; then
    echo "ACTIVATE_OK"
  else
    echo "GMS2_NOT_FOUND"
  fi
else
  echo "NO_TOOL"
fi
`;

function activateGmsWindowLinux(): void {
  const tmpScript = path.join(os.tmpdir(), 'gms2_activate.sh');

  try {
    fs.writeFileSync(tmpScript, LINUX_SCRIPT, { encoding: 'utf8', mode: 0o755 });
  } catch (e) {
    logger.warn(CTX, 'Failed to write temp shell script', { error: String(e) });
    return;
  }

  exec(
    `bash "${tmpScript}"`,
    { timeout: 5000 },
    (err, stdout) => {
      try { fs.unlinkSync(tmpScript); } catch { /* ignore */ }

      if (err) {
        logger.warn(CTX, 'Linux window activate failed', { msg: err.message });
        return;
      }

      const out = stdout.trim();
      if (out === 'GMS2_NOT_FOUND') {
        logger.debug(CTX, 'GMS2 window not found on Linux — activate skipped');
      } else if (out === 'NO_TOOL') {
        logger.debug(CTX, 'Linux: xdotool/wmctrl not installed — activate skipped');
      } else if (out === 'ACTIVATE_OK') {
        logger.info(CTX, 'Linux: GMS2 window activated');
      }
    },
  );
}
