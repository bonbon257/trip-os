#!/bin/bash
# Trip OS 双服务管理（前端 5173 + 后端 8787）
# ────────────────────────────────────────────────────────────
# 前端的 /api/* 自动反代到后端，所以浏览器只看到一个端口。
#
#   ./scripts/dev.sh start     启动两个服务（守护进程化，崩溃自动重启）
#   ./scripts/dev.sh stop      停止
#   ./scripts/dev.sh restart   重启（改配置 / 换 key 后用这个）
#   ./scripts/dev.sh status    看状态
#   ./scripts/dev.sh log [frontend|backend]   看日志
#   ./scripts/dev.sh db:push   同步数据库 schema
#   ./scripts/dev.sh install   装前后端依赖
#
# 说明：服务是否活着以「端口能不能通」为准，pidfile 只是辅助的精确停止手段。
#       守护进程脱离终端后可能收不到/处理不了某些信号，导致 pidfile 残留或丢失，
#       所以这里一律以 curl 探活的结果为准。
# ────────────────────────────────────────────────────────────

set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FRONT="$ROOT/.dev.pid.frontend"
PID_BACK="$ROOT/.dev.pid.backend"
LOG_FRONT="/tmp/tripos-dev.log"
LOG_BACK="/tmp/tripos-server.log"
URL_FRONT="http://localhost:5173/"
URL_BACK="http://localhost:8787/api/health"

probe() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" 2>/dev/null || echo 000; }
up() { [ "$(probe "$1")" = "200" ]; }

case "${1:-status}" in
  start)
    if up "$URL_FRONT" && up "$URL_BACK"; then
      echo "两个服务都已经在运行"
      exit 0
    fi
    rm -f "$PID_FRONT" "$PID_BACK"
    python3 "$ROOT/scripts/dev-daemon.py" "$LOG_FRONT" "frontend" "node:5173" "$ROOT" "$PID_FRONT"
    python3 "$ROOT/scripts/dev-daemon.py" "$LOG_BACK" "backend" "node:8787" "$ROOT/server" "$PID_BACK"
    # 等服务真正起来，最多等 20 秒
    for _ in $(seq 1 20); do
      up "$URL_FRONT" && up "$URL_BACK" && break
      sleep 1
    done
    "$0" status
    ;;
  stop)
    # 1) 让 supervisor 优雅退出（它会顺带关掉自己的子进程）
    for f in "$PID_FRONT" "$PID_BACK"; do
      [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null
    done
    sleep 2
    # 2) 兜底：supervisor 本身 + 它拉起来的进程一起清干净。
    #    残留的 supervisor 会不停重启服务，导致下次 start 出现多个实例抢端口。
    pkill -f "trip-os/scripts/dev-daemon.py" 2>/dev/null
    pkill -f "trip-os/node_modules/vite/bin/vite.js" 2>/dev/null
    pkill -f "trip-os/server/src/index.ts" 2>/dev/null
    # 3) 等端口释放
    for _ in $(seq 1 10); do
      up "$URL_FRONT" || up "$URL_BACK" || break
      sleep 1
    done
    rm -f "$PID_FRONT" "$PID_BACK"
    echo "已停止"
    ;;
  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;
  status)
    F=$(up "$URL_FRONT" && echo "运行中" || echo "未运行")
    B=$(up "$URL_BACK" && echo "运行中" || echo "未运行")
    echo "前端 $F · $URL_FRONT"
    echo "后端 $B · $URL_BACK"
    up "$URL_FRONT" && up "$URL_BACK"
    ;;
  log)
    case "${2:-}" in
      frontend|front|f) tail -f "$LOG_FRONT" ;;
      backend|back|b) tail -f "$LOG_BACK" ;;
      *) tail -f "$LOG_FRONT" "$LOG_BACK" ;;
    esac
    ;;
  db:push)
    cd "$ROOT/server" && npx prisma db push
    ;;
  db:seed)
    cd "$ROOT/server" && [ -f prisma/seed.ts ] && npx tsx prisma/seed.ts || echo "没有 seed.ts"
    ;;
  install)
    echo "安装前端依赖…"
    (cd "$ROOT" && npm install)
    echo "安装后端依赖…"
    (cd "$ROOT/server" && npm install)
    ;;
  cities)
    # 重新生成国内城市库（改了 scripts/build-cities 的画像规则后跑这个）
    python3 "$ROOT/scripts/build-cities" "${2:-}"
    ;;
  *)
    echo "用法: $0 start|stop|restart|status|log [frontend|backend]|db:push|db:seed|cities|install"
    exit 1
    ;;
esac