import * as fs   from 'fs';
import * as path from 'path';
import { writeAtomicText } from '../writer/writeAtomic';
import { readGms2Json, writeGms2Json } from '../utils/gms2Json';
import { registerResource, unregisterResource, registerResourceBatch, unregisterResourceBatch } from '../writer/yypUpdater';
import { addRoomInstance, removeObjectInstancesFromRoom } from '../writer/roomWriter';
import { logger }           from '../utils/logger';
import {
  BRIDGE_OBJECT_NAME,
  BRIDGE_CONNECT_SCRIPT,
  BRIDGE_LOG_SCRIPT,
  BRIDGE_EXEC_SCRIPT,
  BRIDGE_GAME_PORT,
} from './bridgeProtocol';

const CTX = 'BridgeInstaller';

// ── GML шаблоны ──────────────────────────────────────────────────────────────

const GML_CREATE = `\
// ${BRIDGE_OBJECT_NAME} — Create Event
// GMSync Bridge: игра = TCP-клиент, VS Code = TCP-сервер на порту ${BRIDGE_GAME_PORT}.
// Alarm 0 сразу пробует подключиться; при неудаче повторяет каждые 3 секунды.
__gsb_sock       = -1;
__gsb_active     = false;
__gsb_recv_buf   = "";
__gsb_log_queue  = ds_queue_create();
__gsb_diag_count = 0;        // диагностика: логируем async_load при первых N вызовах
__gsb_heartbeat  = 0;        // счётчик для периодических логов
alarm[0] = 1;                // немедленная первая попытка подключения
show_debug_message("[GMSync] Create: Bridge initialized. Connecting to VS Code on port ${BRIDGE_GAME_PORT}...");
global.__gsb_hud_vars      = ds_list_create();
global.__gsb_hud_visible   = false;   // скрыт по умолчанию
global.__gsb_hud_auto_hide = -1;      // timestamp авто-скрытия (-1 = ручное управление)
`;

const GML_ALARM = `\
// ${BRIDGE_OBJECT_NAME} — Alarm 0: попытка подключения к VS Code
if (__gsb_active) {
    show_debug_message("[GMSync] Alarm0: already connected, skip.");
    exit;
}

// Уничтожаем старый сокет если был
if (__gsb_sock >= 0) {
    show_debug_message("[GMSync] Alarm0: destroying old socket " + string(__gsb_sock));
    network_destroy(__gsb_sock);
    __gsb_sock = -1;
}

show_debug_message("[GMSync] Alarm0: creating socket and connecting to 127.0.0.1:${BRIDGE_GAME_PORT}...");
var _s = network_create_socket(network_socket_tcp);
show_debug_message("[GMSync] Alarm0: socket created = " + string(_s));

var _r = network_connect_raw(_s, "127.0.0.1", ${BRIDGE_GAME_PORT});
show_debug_message("[GMSync] Alarm0: network_connect_raw result = " + string(_r));

if (_r >= 0) {
    __gsb_sock     = _s;
    __gsb_active   = true;
    __gsb_recv_buf = "";
    show_debug_message("[GMSync] Alarm0: CONNECTED to VS Code! sock=" + string(__gsb_sock));
} else {
    network_destroy(_s);
    show_debug_message("[GMSync] Alarm0: VS Code not running (result=" + string(_r) + "), retry in 3s...");
    alarm[0] = room_speed * 3;
}
`;

const GML_STEP = `\
// ${BRIDGE_OBJECT_NAME} — Step Event
// Периодический heartbeat-лог + отправка накопленных логов в VS Code
__gsb_heartbeat++;
if (__gsb_heartbeat >= 180) { // каждые ~3 секунды при 60fps
    __gsb_heartbeat = 0;
    show_debug_message("[GMSync] Step: active=" + string(__gsb_active) + " sock=" + string(__gsb_sock) + " recv_buf_len=" + string(string_length(__gsb_recv_buf)));
}

if (!__gsb_active) exit;
if (!ds_exists(__gsb_log_queue, ds_type_queue)) exit;

var _sent = 0;
while (!ds_queue_empty(__gsb_log_queue) && _sent < 100) {
    var _msg  = ds_queue_dequeue(__gsb_log_queue);
    var _ts   = string(current_hour) + ":"
              + string_format(current_minute, 2, 0) + ":"
              + string_format(current_second, 2, 0);
    var _line = "LOG:" + _ts + "|" + string(_msg) + "\\n";
    var _buf  = buffer_create(string_byte_length(_line), buffer_fixed, 1);
    buffer_write(_buf, buffer_text, _line);
    network_send_raw(__gsb_sock, _buf, buffer_tell(_buf));
    buffer_delete(_buf);
    _sent++;
}
if (_sent > 0) {
    show_debug_message("[GMSync] Step: sent " + string(_sent) + " log(s) to VS Code");
}
`;

// ⚠️ ВАЖНО: Other_68 = Async Networking в GMS2 2024.x
// Other_75 = Async Audio (проверено: async_load[? "event_type"] = audio_system_status)
const GML_ASYNC_NETWORK = `\
// ${BRIDGE_OBJECT_NAME} — Async Networking Event (Other 68)
// ⚠️ Это Other_68, НЕ Other_75! В GMS2 2024.x:
//    Other_68 = Async Networking
//    Other_75 = Async Audio

// ДИАГНОСТИКА: дампим все ключи async_load при первых 5 вызовах
if (__gsb_diag_count < 5) {
    __gsb_diag_count++;
    var _dump = "[GMSync] Async68 #" + string(__gsb_diag_count) + " async_load keys: ";
    var _dk = ds_map_find_first(async_load);
    while (_dk != undefined) {
        _dump += string(_dk) + "=" + string(async_load[? _dk]) + " | ";
        _dk = ds_map_find_next(async_load, _dk);
    }
    show_debug_message(_dump);
}

// GMS2 может использовать "id" или "socket" в зависимости от типа соединения
var _type = async_load[? "type"];
var _sock = async_load[? "id"];
if (is_undefined(_sock) || _sock < 0) {
    _sock = async_load[? "socket"];
}

show_debug_message("[GMSync] Async68: type=" + string(_type) + " sock=" + string(_sock) + " our_sock=" + string(__gsb_sock));

// Если тип undefined — это не сетевое событие, игнорируем
if (is_undefined(_type)) {
    show_debug_message("[GMSync] Async68: type is undefined, not a network event — skip");
    exit;
}

if (_sock != __gsb_sock) {
    show_debug_message("[GMSync] Async68: sock mismatch (" + string(_sock) + " != " + string(__gsb_sock) + ") — skip");
    exit;
}

// Данные от VS Code — разбираем CMD-строки
if (_type == network_type_data) {
    var _raw = buffer_read(async_load[? "buffer"], buffer_text);
    show_debug_message("[GMSync] Async68: network_type_data received, size=" + string(async_load[? "size"]) + " raw='" + _raw + "'");
    __gsb_recv_buf += _raw;

    // Защита от переполнения recv-буфера
    if (string_length(__gsb_recv_buf) > 65536) {
        show_debug_message("[GMSync] Async68: recv_buf OVERFLOW — сброс");
        __gsb_recv_buf = "";
        exit;
    }

    var _nl = string_pos("\\n", __gsb_recv_buf);
    show_debug_message("[GMSync] Async68: recv_buf='" + __gsb_recv_buf + "' nl_pos=" + string(_nl));
    while (_nl > 0) {
        var _line       = string_copy(__gsb_recv_buf, 1, _nl - 1);
        __gsb_recv_buf  = string_delete(__gsb_recv_buf, 1, _nl);
        _nl             = string_pos("\\n", __gsb_recv_buf);

        show_debug_message("[GMSync] Async68: processing line='" + _line + "'");

        if (!string_starts_with(_line, "CMD:")) {
            show_debug_message("[GMSync] Async68: not a CMD line, skip");
            continue;
        }

        var _rest = string_delete(_line, 1, 4);
        var _sep  = string_pos("|", _rest);
        if (_sep <= 0) {
            show_debug_message("[GMSync] Async68: malformed CMD (no pipe), skip");
            continue;
        }

        var _id     = string_copy(_rest, 1, _sep - 1);
        var _cmd    = string_delete(_rest, 1, _sep);
        show_debug_message("[GMSync] Async68: executing CMD id='" + _id + "' cmd='" + _cmd + "'");
        var _result = ${BRIDGE_EXEC_SCRIPT}(_id, _cmd);
        show_debug_message("[GMSync] Async68: CMD result='" + string(_result) + "'");

        var _rsp = "RSP:" + _id + "|" + string(_result) + "\\n";
        var _buf = buffer_create(string_byte_length(_rsp), buffer_fixed, 1);
        buffer_write(_buf, buffer_text, _rsp);
        network_send_raw(__gsb_sock, _buf, buffer_tell(_buf));
        buffer_delete(_buf);
        show_debug_message("[GMSync] Async68: sent RSP='" + _rsp + "'");
    }
    exit;
}

// VS Code сервер закрылся или упал — переподключаемся автоматически
if (_type == network_type_disconnect) {
    __gsb_active   = false;
    __gsb_sock     = -1;
    __gsb_recv_buf = "";
    show_debug_message("[GMSync] Async68: network_type_disconnect — VS Code disconnected. Reconnecting in 3s...");
    alarm[0] = room_speed * 3;
    exit;
}

if (_type == network_type_connect) {
    show_debug_message("[GMSync] Async68: network_type_connect confirmed for sock=" + string(_sock));
    exit;
}

show_debug_message("[GMSync] Async68: unhandled type=" + string(_type));
`;

const GML_DESTROY = `\
// ${BRIDGE_OBJECT_NAME} — Destroy Event
show_debug_message("[GMSync] Destroy: cleaning up bridge...");
if (ds_exists(__gsb_log_queue, ds_type_queue)) {
    ds_queue_destroy(__gsb_log_queue);
}
if (__gsb_sock >= 0) {
    network_destroy(__gsb_sock);
    show_debug_message("[GMSync] Destroy: socket destroyed.");
}
if (variable_global_exists("__gsb_hud_vars") && ds_exists(global.__gsb_hud_vars, ds_type_list)) {
    ds_list_destroy(global.__gsb_hud_vars);
}
show_debug_message("[GMSync] Destroy: done.");
`;

const GML_DRAW_GUI = `\
// ${BRIDGE_OBJECT_NAME} — Draw GUI Event
// GMSync Live Debug HUD — появляется на 5 сек после каждого изменения переменной
// Авто-скрытие по таймеру
if (variable_global_exists("__gsb_hud_auto_hide") && global.__gsb_hud_auto_hide > 0 && current_time >= global.__gsb_hud_auto_hide) {
    global.__gsb_hud_visible   = false;
    global.__gsb_hud_auto_hide = -1;
}
if (!variable_global_exists("__gsb_hud_visible") || !global.__gsb_hud_visible) exit;
if (!variable_global_exists("__gsb_hud_vars")) exit;
if (!ds_exists(global.__gsb_hud_vars, ds_type_list)) exit;

var _count = ds_list_size(global.__gsb_hud_vars);
if (_count == 0) exit;

var _line_h = 18;
var _pad    = 6;
var _w      = 290;
var _h      = _pad * 2 + 16 + _count * _line_h + _pad;
var _gw     = display_get_gui_width();
var _x      = _gw - _w - 10;
var _y      = 10;

// Полупрозрачный чёрный фон
draw_set_alpha(0.8);
draw_set_colour(c_black);
draw_rectangle(_x, _y, _x + _w, _y + _h, false);
draw_set_alpha(1);

// Зелёная рамка (GMSync цвет)
draw_set_colour(make_colour_rgb(0, 200, 100));
draw_rectangle(_x, _y, _x + _w, _y + _h, true);

// Заголовок
draw_set_colour(make_colour_rgb(0, 255, 128));
draw_set_halign(fa_left);
draw_set_valign(fa_top);
draw_set_font(-1);
draw_text(_x + _pad, _y + _pad, "GMSync Live");

// Список изменённых переменных
for (var _i = 0; _i < _count; _i++) {
    draw_set_colour(c_white);
    draw_text(_x + _pad, _y + _pad + 16 + _i * _line_h, ds_list_find_value(global.__gsb_hud_vars, _i));
}

// Сброс состояния рисования
draw_set_colour(c_white);
draw_set_alpha(1);
draw_set_halign(fa_left);
draw_set_valign(fa_top);
draw_set_font(-1);
`;

const GML_CONNECT_SCRIPT = `\
/// @desc Устарело — мост теперь работает как TCP-клиент (игра подключается к VS Code).
function _gsb_try_connect() {
    // no-op: bridge now connects via Alarm 0 in Create event
}
`;

const GML_LOG_SCRIPT = `\
/// @param {any} msg
/// @desc Отправляет лог-сообщение в VS Code через GMSync Bridge.
function ${BRIDGE_LOG_SCRIPT}(msg) {
    if (!instance_exists(${BRIDGE_OBJECT_NAME})) exit;
    with (${BRIDGE_OBJECT_NAME}) {
        if (__gsb_active && ds_exists(__gsb_log_queue, ds_type_queue)) {
            if (ds_queue_size(__gsb_log_queue) < 500) {
                ds_queue_enqueue(__gsb_log_queue, string(msg));
            }
        }
    }
}
`;

const GML_EXEC_SCRIPT = `\
/// @param {string} _id
/// @param {string} _cmd
/// @desc Исполняет команду от GMSync Bridge и возвращает строку-результат.
function ${BRIDGE_EXEC_SCRIPT}(_id, _cmd) {
    var _parts = string_split(_cmd, " ");
    var _n     = array_length(_parts);
    if (_n == 0) return "error:empty";
    var _verb  = _parts[0];

    try {
        if (_verb == "ping") return "pong";

        if (_verb == "var_global_get") {
            if (_n < 2) return "error:missing name";
            return string(variable_global_get(_parts[1]));
        }

        if (_verb == "var_global_set") {
            if (_n < 3) return "error:missing args";
            variable_global_set(_parts[1], real(_parts[2]));
            return "ok";
        }

        if (_verb == "var_instance_get") {
            if (_n < 3) return "error:missing args";
            var _inst = real(_parts[1]);
            if (!instance_exists(_inst)) return "error:instance not found";
            return string(variable_instance_get(_inst, _parts[2]));
        }

        if (_verb == "var_instance_set") {
            if (_n < 4) return "error:missing args";
            var _inst = real(_parts[1]);
            if (!instance_exists(_inst)) return "error:instance not found";
            var _iname = _parts[2];
            var _ival  = _parts[3];
            if (string(real(_ival)) == _ival) {
                variable_instance_set(_inst, _iname, real(_ival));
            } else {
                variable_instance_set(_inst, _iname, _ival);
            }
            // Обновляем HUD
            if (variable_global_exists("__gsb_hud_vars") && ds_exists(global.__gsb_hud_vars, ds_type_list)) {
                var _hentry = string(_inst) + "." + _iname + " = " + _ival;
                for (var _hi = ds_list_size(global.__gsb_hud_vars) - 1; _hi >= 0; _hi--) {
                    if (string_starts_with(ds_list_find_value(global.__gsb_hud_vars, _hi), string(_inst) + "." + _iname + " ")) {
                        ds_list_delete(global.__gsb_hud_vars, _hi);
                        break;
                    }
                }
                ds_list_add(global.__gsb_hud_vars, _hentry);
                if (ds_list_size(global.__gsb_hud_vars) > 8) {
                    ds_list_delete(global.__gsb_hud_vars, 0);
                }
                global.__gsb_hud_visible   = true;
                global.__gsb_hud_auto_hide = current_time + 5000;
            }
            return "ok:" + string(_inst) + "." + _iname + " = " + _ival;
        }

        if (_verb == "instance_create") {
            if (_n < 5) return "error:missing args";
            var _obj = asset_get_index(_parts[1]);
            if (_obj < 0) return "error:unknown object " + _parts[1];
            var _inst = instance_create_layer(real(_parts[2]), real(_parts[3]), _parts[4], _obj);
            return string(_inst);
        }

        if (_verb == "instance_destroy") {
            if (_n < 2) return "error:missing id";
            var _inst = real(_parts[1]);
            if (!instance_exists(_inst)) return "error:instance not found";
            with (_inst) instance_destroy();
            return "ok";
        }

        if (_verb == "instance_count") {
            if (_n < 2) return "error:missing obj";
            var _obj = asset_get_index(_parts[1]);
            if (_obj < 0) return "error:unknown object";
            return string(instance_number(_obj));
        }

        if (_verb == "goto_room") {
            if (_n < 2) return "error:missing room";
            var _r = asset_get_index(_parts[1]);
            if (_r < 0) return "error:unknown room " + _parts[1];
            room_goto(_r);
            return "ok";
        }

        if (_verb == "room_info") {
            return room_get_name(room) + "|" + string(room_width) + "x" + string(room_height);
        }

        if (_verb == "get_fps") {
            return string(fps) + "|" + string(fps_real);
        }

        if (_verb == "audio_play") {
            if (_n < 2) return "error:missing sound";
            var _snd = asset_get_index(_parts[1]);
            if (_snd < 0) return "error:unknown sound " + _parts[1];
            audio_play_sound(_snd, 1, false);
            return "ok";
        }

        if (_verb == "audio_stop_all") {
            audio_stop_all();
            return "ok";
        }

        if (_verb == "game_restart") {
            game_restart();
            return "ok";
        }

        if (_verb == "game_end") {
            game_end();
            return "ok";
        }

        // gml_eval — вычисление GML-выражений в рантайме
        // GMS2 не поддерживает execute_string() в 2.3+, поэтому реализованы
        // конкретные паттерны: global.var, встроенные геттеры, basic assigns.
        if (_verb == "gml_eval") {
            if (_n < 2) return "error:usage: gml_eval <expression>";
            // Склеиваем оставшиеся части обратно в выражение
            var _expr = "";
            for (var _ei = 1; _ei < _n; _ei++) {
                if (_ei > 1) _expr += " ";
                _expr += _parts[_ei];
            }
            // ── Встроенные геттеры ───────────────────────────────────────
            if (_expr == "room")         return room_get_name(room);
            if (_expr == "fps")          return string(fps);
            if (_expr == "fps_real")     return string(fps_real);
            if (_expr == "room_width")   return string(room_width);
            if (_expr == "room_height")  return string(room_height);
            if (_expr == "current_time") return string(current_time);
            if (_expr == "game_id")      return string(game_id);
            if (_expr == "os_type")      return string(os_type);
            if (_expr == "instance_count_all") return string(instance_count);
            // ── global.varname  /  global.varname=value ──────────────────
            if (string_starts_with(_expr, "global.")) {
                var _grest = string_delete(_expr, 1, 7);  // убираем "global."
                var _geq   = string_pos("=", _grest);
                if (_geq > 0) {
                    // ЗАПИСЬ: global.name=value  (без пробелов вокруг =)
                    var _gname = string_copy(_grest, 1, _geq - 1);
                    var _gval  = string_delete(_grest, 1, _geq);
                    if (!variable_global_exists(_gname)) return "error:global not found: " + _gname;
                    // Пробуем как число, иначе как строку
                    if (string(real(_gval)) == _gval) {
                        variable_global_set(_gname, real(_gval));
                    } else {
                        variable_global_set(_gname, _gval);
                    }
                    // Обновляем HUD с новым значением
                    if (variable_global_exists("__gsb_hud_vars") && ds_exists(global.__gsb_hud_vars, ds_type_list)) {
                        var _entry = "global." + _gname + " = " + _gval;
                        for (var _hi = ds_list_size(global.__gsb_hud_vars) - 1; _hi >= 0; _hi--) {
                            if (string_starts_with(ds_list_find_value(global.__gsb_hud_vars, _hi), "global." + _gname + " ")) {
                                ds_list_delete(global.__gsb_hud_vars, _hi);
                                break;
                            }
                        }
                        ds_list_add(global.__gsb_hud_vars, _entry);
                        if (ds_list_size(global.__gsb_hud_vars) > 8) {
                            ds_list_delete(global.__gsb_hud_vars, 0);
                        }
                        // Показываем HUD на 5 секунд
                        global.__gsb_hud_visible   = true;
                        global.__gsb_hud_auto_hide = current_time + 5000;
                    }
                    return "ok:global." + _gname + " = " + _gval;
                } else {
                    // ЧТЕНИЕ: global.name
                    if (!variable_global_exists(_grest)) return "error:global not found: " + _grest;
                    return string(variable_global_get(_grest));
                }
            }
            // ── self.varname (bridge-объект) ─────────────────────────────
            if (string_starts_with(_expr, "self.")) {
                var _sname = string_delete(_expr, 1, 5);
                if (!variable_instance_exists(id, _sname)) return "error:self var not found: " + _sname;
                return string(variable_instance_get(id, _sname));
            }
            return "error:unsupported expr '" + _expr + "'. Supported: global.x, global.x=v, fps, room, room_width, room_height, current_time, game_id, os_type, instance_count_all, self.x";
        }

        // list_globals — все объявленные global-переменные в рантайме
        // Возвращает строку "var1,var2,var3" (через запятую)
        if (_verb == "list_globals") {
            var _gnames = variable_struct_get_names(global);
            var _gcount = array_length(_gnames);
            if (_gcount == 0) return "";
            var _gres = "";
            for (var _gi = 0; _gi < _gcount; _gi++) {
                if (_gi > 0) _gres += ",";
                _gres += _gnames[_gi];
            }
            return _gres;
        }

        // room_objects — объекты в текущей комнате с количеством инстансов
        // Возвращает строку "objName:count,objName2:count2"
        if (_verb == "room_objects") {
            var _rtotal = instance_count;
            if (_rtotal == 0) return "";
            var _rmap = ds_map_create();
            for (var _ri = 0; _ri < _rtotal; _ri++) {
                var _rinst = instance_find(all, _ri);
                if (!instance_exists(_rinst)) continue;
                var _roname = object_get_name(_rinst.object_index);
                _rmap[? _roname] = (ds_map_exists(_rmap, _roname) ? _rmap[? _roname] : 0) + 1;
            }
            var _rres = "";
            var _rk = ds_map_find_first(_rmap);
            while (_rk != undefined) {
                if (string_length(_rres) > 0) _rres += ",";
                _rres += _rk + ":" + string(_rmap[? _rk]);
                _rk = ds_map_find_next(_rmap, _rk);
            }
            ds_map_destroy(_rmap);
            return _rres;
        }

        if (_verb == "list_instances") {
            if (_n < 2) return "error:missing obj";
            var _obj = asset_get_index(_parts[1]);
            if (_obj < 0) return "error:unknown object " + _parts[1];
            var _cnt = instance_number(_obj);
            if (_cnt == 0) return "";
            var _res = "";
            for (var _ii = 0; _ii < _cnt; _ii++) {
                var _inst = instance_find(_obj, _ii);
                if (!instance_exists(_inst)) continue;
                if (string_length(_res) > 0) _res += ",";
                _res += string(real(_inst));
            }
            return _res;
        }

        if (_verb == "var_instance_list") {
            if (_n < 2) return "error:missing id";
            var _inst = real(_parts[1]);
            if (!instance_exists(_inst)) return "error:instance not found";
            var _vnames = variable_instance_get_names(_inst);
            var _vcount = array_length(_vnames);
            if (_vcount == 0) return "";
            var _vres = "";
            for (var _vi = 0; _vi < _vcount; _vi++) {
                if (_vi > 0) _vres += ",";
                _vres += _vnames[_vi];
            }
            return _vres;
        }

        if (_verb == "hud_toggle") {
            if (!variable_global_exists("__gsb_hud_visible")) return "error:hud not initialized";
            global.__gsb_hud_visible   = !global.__gsb_hud_visible;
            global.__gsb_hud_auto_hide = -1;  // при ручном тогле отключаем авто-скрытие
            return global.__gsb_hud_visible ? "hud:on (permanent)" : "hud:off";
        }

        if (_verb == "hud_clear") {
            if (!variable_global_exists("__gsb_hud_vars") || !ds_exists(global.__gsb_hud_vars, ds_type_list)) return "error:hud not initialized";
            ds_list_clear(global.__gsb_hud_vars);
            return "ok";
        }

        return "error:unknown command " + _verb;

    } catch (_e) {
        return "error:" + string(_e.message);
    }
}
`;

// ── Шаблон .yy объекта ───────────────────────────────────────────────────────

function makeBridgeObjectYy(name: string, projectName: string): Record<string, unknown> {
  const makeEvent = (eventType: number, eventNum: number) => ({
    '$GMEvent': 'v1',
    '%Name': '',
    collisionObjectId: null,
    eventNum,
    eventType,
    isDnD: false,
    name: '',
    resourceType: 'GMEvent',
    resourceVersion: '2.0',
  });

  return {
    '$GMObject': '',
    '%Name': name,
    eventList: [
      makeEvent(0, 0),   // Create
      makeEvent(2, 0),   // Alarm 0 — подключение / переподключение
      makeEvent(3, 0),   // Step — heartbeat + отправка логов
      makeEvent(8, 64),  // Draw GUI — HUD overlay (переменные в реальном времени)
      makeEvent(7, 68),  // Other 68 — Async Networking (GMS2 2024.x)
      makeEvent(1, 0),   // Destroy
    ],
    managed: true,
    name,
    overriddenProperties: [],
    parent: { name: projectName, path: `${projectName}.yyp` },
    parentObjectId: null,
    persistent: true,
    physicsAngularDamping: 0.1,
    physicsDensity: 0.5,
    physicsFriction: 0.2,
    physicsGroup: 1,
    physicsKinematic: false,
    physicsLinearDamping: 0.1,
    physicsObject: false,
    physicsRestitution: 0.1,
    physicsSensor: false,
    physicsShape: 1,
    physicsShapePoints: [],
    physicsStartAwake: true,
    properties: [],
    resourceType: 'GMObject',
    resourceVersion: '2.0',
    solid: false,
    spriteId: null,
    spriteMaskId: null,
    visible: true,
  };
}

// ── Публичный API ────────────────────────────────────────────────────────────

export function isBridgeInstalled(projectRoot: string): boolean {
  const objYy = path.join(projectRoot, 'objects', BRIDGE_OBJECT_NAME, `${BRIDGE_OBJECT_NAME}.yy`);
  return fs.existsSync(objYy);
}

export async function installBridge(projectRoot: string, yypPath: string): Promise<boolean> {
  try {
    if (isBridgeInstalled(projectRoot)) {
      logger.warn(CTX, 'Bridge already installed', { projectRoot });
      return true;
    }

    const objDir      = path.join(projectRoot, 'objects', BRIDGE_OBJECT_NAME);
    const objYy       = path.join(objDir, `${BRIDGE_OBJECT_NAME}.yy`);
    const projectName = path.basename(yypPath, '.yyp');

    fs.mkdirSync(objDir, { recursive: true });
    writeGms2Json(objYy, makeBridgeObjectYy(BRIDGE_OBJECT_NAME, projectName));

    writeAtomicText(path.join(objDir, 'Create_0.gml'),  GML_CREATE);
    writeAtomicText(path.join(objDir, 'Alarm_0.gml'),   GML_ALARM);
    writeAtomicText(path.join(objDir, 'Step_0.gml'),    GML_STEP);
    writeAtomicText(path.join(objDir, 'Other_68.gml'),  GML_ASYNC_NETWORK); // ⚠️ 68, не 75!
    writeAtomicText(path.join(objDir, 'Destroy_0.gml'), GML_DESTROY);
    writeAtomicText(path.join(objDir, 'Draw_64.gml'),   GML_DRAW_GUI);

    _createScriptFiles(projectRoot, yypPath, BRIDGE_CONNECT_SCRIPT, GML_CONNECT_SCRIPT);
    _createScriptFiles(projectRoot, yypPath, BRIDGE_LOG_SCRIPT,     GML_LOG_SCRIPT);
    _createScriptFiles(projectRoot, yypPath, BRIDGE_EXEC_SCRIPT,    GML_EXEC_SCRIPT);

    await registerResourceBatch(yypPath, [
      { name: BRIDGE_OBJECT_NAME,    relativePath: `objects/${BRIDGE_OBJECT_NAME}/${BRIDGE_OBJECT_NAME}.yy` },
      { name: BRIDGE_CONNECT_SCRIPT, relativePath: `scripts/${BRIDGE_CONNECT_SCRIPT}/${BRIDGE_CONNECT_SCRIPT}.yy` },
      { name: BRIDGE_LOG_SCRIPT,     relativePath: `scripts/${BRIDGE_LOG_SCRIPT}/${BRIDGE_LOG_SCRIPT}.yy` },
      { name: BRIDGE_EXEC_SCRIPT,    relativePath: `scripts/${BRIDGE_EXEC_SCRIPT}/${BRIDGE_EXEC_SCRIPT}.yy` },
    ]);

    _placeInStartupRoom(projectRoot, yypPath);

    logger.info(CTX, 'Bridge installed successfully (Other_68 = Async Networking)');
    return true;
  } catch (e) {
    logger.error(CTX, 'Bridge install failed', { error: String(e) });
    return false;
  }
}

export async function uninstallBridge(projectRoot: string, yypPath: string): Promise<boolean> {
  try {
    const objDir  = path.join(projectRoot, 'objects', BRIDGE_OBJECT_NAME);
    const connDir = path.join(projectRoot, 'scripts', BRIDGE_CONNECT_SCRIPT);
    const logDir  = path.join(projectRoot, 'scripts', BRIDGE_LOG_SCRIPT);
    const execDir = path.join(projectRoot, 'scripts', BRIDGE_EXEC_SCRIPT);

    if (fs.existsSync(objDir))  fs.rmSync(objDir,  { recursive: true });
    if (fs.existsSync(connDir)) fs.rmSync(connDir, { recursive: true });
    if (fs.existsSync(logDir))  fs.rmSync(logDir,  { recursive: true });
    if (fs.existsSync(execDir)) fs.rmSync(execDir, { recursive: true });

    await unregisterResourceBatch(yypPath, [
      BRIDGE_OBJECT_NAME, BRIDGE_CONNECT_SCRIPT, BRIDGE_LOG_SCRIPT, BRIDGE_EXEC_SCRIPT,
    ]);

    _removeFromAllRooms(projectRoot, yypPath);

    logger.info(CTX, 'Bridge uninstalled');
    return true;
  } catch (e) {
    logger.error(CTX, 'Bridge uninstall failed', { error: String(e) });
    return false;
  }
}

// ── Внутренние хелперы ───────────────────────────────────────────────────────

function _createScriptFiles(
  projectRoot: string, yypPath: string, name: string, gml: string,
): void {
  const projectName = path.basename(yypPath, '.yyp');
  const dir = path.join(projectRoot, 'scripts', name);
  fs.mkdirSync(dir, { recursive: true });

  const yy: Record<string, unknown> = {
    '$GMScript': '',
    '%Name': name,
    isCompatibility: false,
    isDnD: false,
    name,
    parent: { name: projectName, path: `${projectName}.yyp` },
    resourceType: 'GMScript',
    resourceVersion: '2.0',
  };

  writeGms2Json(path.join(dir, `${name}.yy`), yy);
  writeAtomicText(path.join(dir, `${name}.gml`), gml);
}

function _getStartupRoomName(yypPath: string): string | undefined {
  try {
    const yyp = readGms2Json(yypPath) as Record<string, unknown>;
    const nodes = yyp['RoomOrderNodes'] as Array<{ roomId?: { name?: string } }> | undefined;
    return nodes?.[0]?.roomId?.name;
  } catch {
    return undefined;
  }
}

function _placeInStartupRoom(projectRoot: string, yypPath: string): void {
  const roomName = _getStartupRoomName(yypPath);
  if (!roomName) {
    logger.warn(CTX, 'Could not find startup room — place __gmsync_bridge manually');
    return;
  }
  const roomYyPath = path.join(projectRoot, 'rooms', roomName, `${roomName}.yy`);
  if (!fs.existsSync(roomYyPath)) {
    logger.warn(CTX, 'Startup room .yy not found', { roomYyPath });
    return;
  }
  try {
    addRoomInstance(roomYyPath, BRIDGE_OBJECT_NAME, 0, 0);
    logger.info(CTX, `__gmsync_bridge placed in startup room "${roomName}"`);
  } catch (e) {
    logger.warn(CTX, 'Could not place bridge in startup room', { error: String(e) });
  }
}

function _removeFromAllRooms(projectRoot: string, yypPath: string): void {
  try {
    const yyp = readGms2Json(yypPath) as Record<string, unknown>;
    const nodes = (yyp['RoomOrderNodes'] as Array<{ roomId?: { name?: string } }>) ?? [];
    for (const node of nodes) {
      const roomName = node.roomId?.name;
      if (!roomName) continue;
      const roomYyPath = path.join(projectRoot, 'rooms', roomName, `${roomName}.yy`);
      if (fs.existsSync(roomYyPath)) {
        removeObjectInstancesFromRoom(roomYyPath, BRIDGE_OBJECT_NAME);
      }
    }
  } catch (e) {
    logger.warn(CTX, 'Error removing bridge instances from rooms', { error: String(e) });
  }
}
