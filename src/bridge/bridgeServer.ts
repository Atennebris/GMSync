import * as net from 'net';
import { EventEmitter } from 'events';
import {
  BRIDGE_GAME_PORT, BRIDGE_HOST, MAX_LOG_BUFFER, CMD_TIMEOUT_MS,
  parseMessage, formatCmd,
} from './bridgeProtocol';
import { logger } from '../utils/logger';

const CTX = 'BridgeServer';

export interface LogEntry {
  timestamp:  string;
  message:    string;
  receivedAt: number;
}

export interface CommandResult {
  id:       string;
  command:  string;
  result?:  string;
  success:  boolean;
  error?:   string;
}

/**
 * TCP-сервер (Node.js net) который ждёт подключения от игры на порт 6503.
 * Игра — клиент (network_connect_raw), VS Code — сервер.
 * Данные: plain text без заголовков — "CMD:<id>|<cmd>\n" / "RSP:<id>|<res>\n" / "LOG:<ts>|<msg>\n"
 *
 * События: 'started' | 'stopped' | 'connected' | 'disconnected' | 'log' (LogEntry)
 */
export class BridgeServer extends EventEmitter {
  private _tcpServer:  net.Server | null = null;
  private socket:      net.Socket | null = null;
  private _running     = false;
  private _connected   = false;

  private logs:        LogEntry[]                 = [];
  private cmdCounter   = 0;
  private pending      = new Map<string, {
    resolve: (r: CommandResult) => void;
    timer:   ReturnType<typeof setTimeout>;
  }>();
  private recvBuf      = '';

  get isRunning():   boolean { return this._running; }
  get isConnected(): boolean { return this._connected; }

  // ── Запуск / остановка ───────────────────────────────────────────────────

  start(): Promise<void> {
    if (this._running) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const server = net.createServer(sock => this._handleNewGameConnection(sock));

      server.once('error', (err: NodeJS.ErrnoException) => {
        this._running = false;
        this._tcpServer = null;
        logger.error(CTX, 'TCP server error', { code: err.code, msg: err.message });
        reject(err);
      });

      server.listen(BRIDGE_GAME_PORT, BRIDGE_HOST, () => {
        this._tcpServer = server;
        this._running   = true;
        logger.info(CTX, `Bridge TCP server listening on ${BRIDGE_HOST}:${BRIDGE_GAME_PORT}`);
        this.emit('started');
        resolve();
      });
    });
  }

  stop(): void {
    this._running = false;

    // Отменяем все ожидающие команды
    for (const { resolve, timer } of this.pending.values()) {
      clearTimeout(timer);
      resolve({ id: '', command: '', success: false, error: 'Bridge stopped' });
    }
    this.pending.clear();

    this.socket?.destroy();
    this.socket     = null;
    this._connected = false;

    this._tcpServer?.close();
    this._tcpServer = null;

    logger.info(CTX, 'Bridge server stopped');
    this.emit('stopped');
  }

  // ── Отправка команды в игру ───────────────────────────────────────────────

  sendCommand(command: string): Promise<CommandResult> {
    return new Promise(resolve => {
      if (!this._connected || !this.socket) {
        resolve({ id: '', command, success: false, error: 'Not connected to game' });
        return;
      }

      this.cmdCounter++;
      const id = `c${this.cmdCounter}`;

      const timer = setTimeout(() => {
        this.pending.delete(id);
        logger.warn(CTX, `✗ CMD timeout [${id}]: ${command.trim()} (${CMD_TIMEOUT_MS}ms)`);
        resolve({ id, command, success: false, error: 'Timeout' });
      }, CMD_TIMEOUT_MS);

      this.pending.set(id, { resolve, timer });
      const line = formatCmd(id, command);
      logger.info(CTX, `→ CMD sent [${id}]: ${command.trim()}`);
      this._sendLine(line);
    });
  }

  // ── Логи из игры ──────────────────────────────────────────────────────────

  getLogs(count = 200): LogEntry[] {
    return this.logs.slice(-count);
  }

  clearLogs(): void {
    this.logs = [];
  }

  // ── Внутренние методы ────────────────────────────────────────────────────

  /**
   * Принимает новое подключение от игры.
   * Только одна игра одновременно — второе подключение отклоняется.
   */
  private _handleNewGameConnection(sock: net.Socket): void {
    if (this._connected && this.socket) {
      // Игра перезапустилась (game_restart) — закрываем старый сокет и принимаем новый
      logger.info(CTX, 'New game connection while old still open — replacing (game restarted?)');
      this.socket.destroy();
      this.socket     = null;
      this._connected = false;
      // Отменяем ожидающие команды от старого соединения
      for (const { resolve, timer } of this.pending.values()) {
        clearTimeout(timer);
        resolve({ id: '', command: '', success: false, error: 'Game reconnected' });
      }
      this.pending.clear();
    }

    this.socket     = sock;
    this._connected = true;
    this.recvBuf    = '';

    const remoteAddr = `${sock.remoteAddress}:${sock.remotePort}`;
    logger.info(CTX, `✓ Game connected to bridge from ${remoteAddr}`);
    this.emit('connected');

    sock.on('data', (data: Buffer) => this._handleData(data));

    sock.once('error', (err: NodeJS.ErrnoException) => {
      // Игнорируем ECONNRESET — обработается в 'close'
      if (err.code !== 'ECONNRESET') {
        logger.warn(CTX, 'Game socket error', { code: err.code, msg: err.message });
      }
    });

    sock.once('close', () => {
      // Если этот сокет уже заменён новым подключением (room_goto / game_restart)
      // — не сбрасываем состояние и не эмитим 'disconnected'
      if (this.socket !== sock) {
        logger.info(CTX, 'Old socket closed after reconnect — ignoring stale close');
        return;
      }

      this.socket     = null;
      this._connected = false;

      // Отменяем ожидающие команды
      for (const { resolve, timer } of this.pending.values()) {
        clearTimeout(timer);
        resolve({ id: '', command: '', success: false, error: 'Game disconnected' });
      }
      this.pending.clear();

      logger.info(CTX, 'Game disconnected — waiting for next connection');
      this.emit('disconnected');
      // Сервер продолжает слушать — следующий запуск игры подключится автоматически
    });
  }

  /**
   * Отправляет строку в игру — plain text без заголовков.
   * Игра читает через buffer_text, разделитель \n.
   */
  private _sendLine(data: string): void {
    if (!this.socket) return;
    const buf = Buffer.from(data, 'utf8');
    logger.debug(CTX, `→ raw send ${buf.length} bytes: ${data.replace(/\n/g, '\\n').slice(0, 200)}`);
    this.socket.write(buf);
  }

  private _handleData(data: Buffer): void {
    logger.debug(CTX, `← raw recv ${data.length} bytes: ${data.toString('utf8').replace(/\n/g, '\\n').slice(0, 200)}`);
    this.recvBuf += data.toString('utf8');

    // Защита от unbounded роста буфера
    if (this.recvBuf.length > 1_000_000) {
      logger.error(CTX, 'recvBuf overflow — сброс буфера', { size: this.recvBuf.length });
      this.recvBuf = '';
      return;
    }

    // Обрабатываем все полные строки
    let nl: number;
    while ((nl = this.recvBuf.indexOf('\n')) >= 0) {
      const line   = this.recvBuf.slice(0, nl).replace(/\x00/g, '').trim();
      this.recvBuf = this.recvBuf.slice(nl + 1);
      if (!line) continue;

      const msg = parseMessage(line);
      if (!msg) { logger.warn(CTX, `← unknown line from game: ${line.slice(0, 200)}`); continue; }

      if (msg.type === 'LOG') {
        logger.debug(CTX, `← LOG [${msg.id}]: ${msg.payload}`);
        const entry: LogEntry = {
          timestamp:  msg.id,
          message:    msg.payload,
          receivedAt: Date.now(),
        };
        this.logs.push(entry);
        if (this.logs.length > MAX_LOG_BUFFER) this.logs.shift();
        this.emit('log', entry);
      }

      if (msg.type === 'RSP') {
        const p = this.pending.get(msg.id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          logger.info(CTX, `✓ RSP [${msg.id}]: ${msg.payload}`);
          p.resolve({ id: msg.id, command: '', result: msg.payload, success: true });
        } else {
          logger.warn(CTX, `← RSP [${msg.id}] — нет ожидающей команды (возможно уже timeout)`);
        }
      }
    }
  }
}
