#!/usr/bin/env python3
"""
Trip OS 双服务守护进程（前端 vite + 后端 fastify）
────────────────────────────────────────────────────────────
  args: log_path label node_host:cwd:port workdir pidfile
"""
import os
import pathlib
import signal
import subprocess
import sys
import time

LOGFILE = pathlib.Path(sys.argv[1])
LABEL = sys.argv[2]
TARGET = sys.argv[3]           # e.g. node:5173 or node:8787
WORKDIR = sys.argv[4]
PIDFILE = pathlib.Path(sys.argv[5])

NODE = "/Users/edy/.workbuddy/binaries/node/versions/22.22.2/bin/node"
mode, port = TARGET.split(":")
VITE = WORKDIR + "/node_modules/vite/bin/vite.js"
ENTRY = WORKDIR + "/src/index.ts"

child: "subprocess.Popen[bytes] | None" = None


def detach() -> None:
    if os.fork() > 0:
        os._exit(0)
    os.setsid()
    if os.fork() > 0:
        os._exit(0)


def shutdown(signum, _frame) -> None:
    global child
    if child and child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=6)
        except subprocess.TimeoutExpired:
            child.kill()
    try:
        PIDFILE.unlink(missing_ok=True)
    except OSError:
        pass
    sys.exit(0)


def supervise() -> None:
    global child
    LOGFILE.touch(exist_ok=True)
    log = LOGFILE.open("a", buffering=1)
    os.dup2(log.fileno(), sys.stdout.fileno())
    os.dup2(log.fileno(), sys.stderr.fileno())

    print(f"\n=== {LABEL} supervisor 启动 {time.strftime('%F %T')} ===", flush=True)
    while True:
        print(f"--- 启动 {LABEL} {time.strftime('%F %T')}", flush=True)
        cmd = [NODE] if mode == "node" else []
        if LABEL == "frontend":
            cmd += [VITE, "--host", "--port", str(port)]
        else:
            # backend：用 tsx 跑 TS 入口；端口由入口里的 env 决定
            cmd += [WORKDIR + "/node_modules/.bin/tsx", ENTRY]
        try:
            child = subprocess.Popen(
                cmd,
                cwd=WORKDIR,
                # stdin 必须给 /dev/null：vite 会读 stdin 监听快捷键，
                # 脱离终端后读到 EIO 会直接崩溃（errno -5, syscall read）。
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"--- 启动失败：{exc}", flush=True)
            time.sleep(5)
            continue

        code = child.wait()
        print(f"--- {LABEL} 退出（code={code}），3 秒后重启", flush=True)
        time.sleep(3)


def trace(msg: str) -> None:
    """detach 之后 stdio 还没重定向，写日志最可靠"""
    try:
        with LOGFILE.open("a") as f:
            f.write(f"[daemon {LABEL}] {msg}\n")
    except Exception:
        pass


if __name__ == "__main__":
    detach()
    trace(f"started pid={os.getpid()} pidfile={PIDFILE}")
    try:
        PIDFILE.write_text(str(os.getpid()))
        trace("pidfile written")
    except Exception as exc:  # noqa: BLE001
        # pidfile 只是给 dev.sh 管理用，写失败也要让服务跑起来
        trace(f"pidfile write FAILED: {exc!r}")
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    supervise()