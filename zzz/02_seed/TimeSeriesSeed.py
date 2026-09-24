#!/usr/bin/env python3
"""向 Redis（需 RedisTimeSeries 模块）写入若干 TimeSeries 样例键，供 RedisME 浏览/读写验收。

需 Python 3.8+，无第三方依赖（纯 socket + RESP）。连接参数优先级：命令行 > 环境变量 >
默认本机。环境变量：REDIS_SERVER / REDIS_PROT / REDIS_PASSWORD。

用法::

    python TimeSeriesSeed.py
    python TimeSeriesSeed.py 127.0.0.1 6379 hepengju
    python TimeSeriesSeed.py 127.0.0.1 6379 ""          # 无密码

写入的键前缀均为 test:ts:。覆盖场景见各 seed 步骤注释（分页 / 长扫描暂停 /
区间过滤 / labels / retention / 值过滤 / TTL 等）。
"""

from __future__ import annotations

import os
import socket
import sys

PREFIX = "test:ts:"


class RedisCli:
    """最小 RESP 客户端：AUTH / DEL / EXPIRE / TS.*。"""

    def __init__(self, host: str, port: int) -> None:
        self._sock = socket.create_connection((host, port))
        self._sock.settimeout(120)  # 大键 MADD 可能较慢

    def close(self) -> None:
        self._sock.close()

    def __enter__(self) -> RedisCli:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def auth(self, password: str) -> None:
        self._write_command(b"AUTH", password.encode("utf-8"))
        self._read_ok()

    def delete(self, key: str) -> None:
        self._write_command(b"DEL", key.encode("utf-8"))
        self._read_integer()

    def expire(self, key: str, seconds: int) -> None:
        self._write_command(b"EXPIRE", key.encode("utf-8"), str(seconds).encode("ascii"))
        self._read_integer()

    def ts_create(
        self,
        key: str,
        *,
        retention_ms: int | None = None,
        labels: list[tuple[str, str]] | None = None,
        duplicate_policy: str | None = None,
    ) -> None:
        args: list[bytes] = [key.encode("utf-8")]
        if retention_ms is not None:
            args.extend([b"RETENTION", str(retention_ms).encode("ascii")])
        if duplicate_policy:
            args.extend([b"DUPLICATE_POLICY", duplicate_policy.encode("ascii")])
        if labels:
            args.append(b"LABELS")
            for k, v in labels:
                args.append(k.encode("utf-8"))
                args.append(v.encode("utf-8"))
        self._write_command(b"TS.CREATE", *args)
        self._read_ok()

    def ts_add(self, key: str, timestamp: int | str, value: float | int | str) -> None:
        self._write_command(
            b"TS.ADD",
            key.encode("utf-8"),
            str(timestamp).encode("ascii"),
            str(value).encode("ascii"),
        )
        self._read_integer()

    def ts_madd(self, triples: list[tuple[str, int, float | int]]) -> None:
        """TS.MADD key ts value [key ts value ...]"""
        args: list[bytes] = []
        for key, ts, val in triples:
            args.append(key.encode("utf-8"))
            args.append(str(ts).encode("ascii"))
            args.append(str(val).encode("ascii"))
        self._write_command(b"TS.MADD", *args)
        # MADD 返回数组；读完整 reply 丢弃
        self._read_reply()

    def _write_command(self, cmd: bytes, *args: bytes) -> None:
        parts = [cmd, *args]
        buf = bytearray()
        buf.extend(f"*{len(parts)}\r\n".encode("ascii"))
        for p in parts:
            buf.extend(f"${len(p)}\r\n".encode("ascii"))
            buf.extend(p)
            buf.extend(b"\r\n")
        self._sock.sendall(buf)

    def _read_ok(self) -> None:
        line = self._readline()
        if line.startswith(b"+"):
            return
        if line.startswith(b"-"):
            raise OSError(f"Redis error: {line[1:].decode('utf-8', errors='replace')}")
        raise OSError(f"unexpected Redis reply: {line!r}")

    def _read_integer(self) -> None:
        line = self._readline()
        if line.startswith(b":"):
            return
        if line.startswith(b"-"):
            raise OSError(f"Redis error: {line[1:].decode('utf-8', errors='replace')}")
        raise OSError(f"unexpected Redis reply: {line!r}")

    def _read_reply(self) -> None:
        """消费一条完整 RESP（忽略内容，仅用于 MADD 等）。"""
        line = self._readline()
        if line.startswith(b"-"):
            raise OSError(f"Redis error: {line[1:].decode('utf-8', errors='replace')}")
        if line.startswith((b"+", b":", b",")):
            return
        if line.startswith(b"$"):
            n = int(line[1:])
            if n >= 0:
                self._sock.recv(n + 2)
            return
        if line.startswith(b"*"):
            n = int(line[1:])
            for _ in range(max(n, 0)):
                self._read_reply()
            return
        raise OSError(f"unexpected Redis reply: {line!r}")

    def _readline(self) -> bytes:
        buf = bytearray()
        while True:
            ch = self._sock.recv(1)
            if not ch:
                raise OSError("Redis connection closed")
            if ch == b"\n":
                if buf.endswith(b"\r"):
                    return bytes(buf[:-1])
                return bytes(buf)
            buf.extend(ch)


def seed_all(redis: RedisCli) -> list[str]:
    """写入全部样例，返回键名列表。"""
    keys: list[str] = []

    def take(name: str) -> str:
        key = PREFIX + name
        redis.delete(key)
        keys.append(key)
        return key

    # --- 基础读写 ---
    k = take("tiny")
    redis.ts_create(k)
    redis.ts_add(k, 1000, 1.5)
    redis.ts_add(k, 2000, 2.5)
    redis.ts_add(k, 3000, 3.5)
    print(f"TS.CREATE+ADD {k} ×3  → 稠密小序列，测基础表格")

    k = take("single")
    redis.ts_create(k)
    redis.ts_add(k, 1_700_000_000_000, 42)
    print(f"TS.ADD {k} 单点  → 可读时间列 / 编辑删行")

    k = take("empty")
    redis.ts_create(k)
    print(f"TS.CREATE {k}  → 空序列（totalSamples=0），测插入首样本")

    # --- 分页（COUNT 续页）---
    k = take("page")
    redis.ts_create(k)
    triples = [(k, 1_000_000 + i * 1000, float(i)) for i in range(80)]
    # MADD 分批，避免单包过大
    for i in range(0, len(triples), 40):
        redis.ts_madd(triples[i : i + 40])
    print(f"TS.MADD {k} ×80  → 测 fieldScan 正/倒序续页")

    # --- 长扫描暂停（底栏「已扫描」旁；需连拉多批才出现控件）---
    k = take("huge")
    redis.ts_create(k)
    n = 9999
    batch = 200
    base_ts = 1_600_000_000_000
    for i in range(0, n, batch):
        end = min(i + batch, n)
        redis.ts_madd([(k, base_ts + j * 1000, float(j % 1000)) for j in range(i, end)])
        if (i // batch) % 10 == 0 or end == n:
            print(f"  … {k} {end}/{n}", flush=True)
    print(f"TS.MADD {k} ×{n}  → 测长扫描暂停（设置里开「加载全部」或连扫）")

    # --- 时间区间过滤 ---
    k = take("range-clusters")
    redis.ts_create(k)
    for i in range(5):
        redis.ts_add(k, 1000 + i, i)  # 1000–1004
    for i in range(5):
        redis.ts_add(k, 50_000 + i, 50 + i)  # 50000–50004
    for i in range(5):
        redis.ts_add(k, 200_000 + i, 200 + i)  # 200000–200004
    print(f"TS.ADD {k} 三簇  → 测工具栏时间戳区间")

    # --- 值过滤 FILTER_BY_VALUE ---
    k = take("value-filter")
    redis.ts_create(k)
    for i, v in enumerate((1.0, 5.0, 10.0, 50.0, 100.0, -3.0, 0.0)):
        redis.ts_add(k, 10_000 + i * 1000, v)
    print(f"TS.ADD {k} 多值  → 测数值区间过滤")

    # --- labels / retention（TS.INFO 弹窗）---
    k = take("labeled")
    redis.ts_create(
        k,
        retention_ms=86_400_000,
        labels=[("device", "thermometer"), ("location", "lab")],
        duplicate_policy="LAST",
    )
    redis.ts_add(k, "*", 36.5)
    redis.ts_add(k, "*", 36.8)
    print(f"TS.CREATE LABELS {k}  → 测 TS.INFO（labels / retention / policy）")

    # --- 毫秒级真实时间戳附近 ---
    k = take("realtime")
    redis.ts_create(k)
    base = 1_720_000_000_000
    for i in range(12):
        redis.ts_add(k, base + i * 60_000, 20 + i * 0.5)
    print(f"TS.ADD {k} 近真实 ms  → 可读时间 / 倒序默认")

    # --- 带 TTL ---
    k = take("ttl-1h")
    redis.ts_create(k)
    redis.ts_add(k, "*", 1)
    redis.expire(k, 3600)
    print(f"TS.ADD+EXPIRE {k} 3600  → 测键 TTL 展示")

    # --- 重复时间戳 upsert（编辑 ON_DUPLICATE LAST）---
    k = take("dup-last")
    redis.ts_create(k, duplicate_policy="LAST")
    redis.ts_add(k, 5000, 1)
    redis.ts_add(k, 5000, 99)  # 同 ts 覆盖
    print(f"TS.ADD {k} 同 ts×2  → 编辑 upsert / INFO duplicatePolicy")

    return keys


def redis_conn_from_argv(argv: list[str]) -> tuple[str, int, str]:
    """命令行 > REDIS_SERVER / REDIS_PROT / REDIS_PASSWORD > 本机默认。"""
    host = argv[1] if len(argv) > 1 else os.environ.get("REDIS_SERVER", "127.0.0.1")
    port = int(argv[2] if len(argv) > 2 else os.environ.get("REDIS_PROT", "6379"))
    password = argv[3] if len(argv) > 3 else os.environ.get("REDIS_PASSWORD", "hepengju")
    return host, port, password


def main(argv: list[str]) -> int:
    host, port, password = redis_conn_from_argv(argv)

    with RedisCli(host, port) as redis:
        if password:
            redis.auth(password)
        try:
            keys = seed_all(redis)
        except OSError as e:
            msg = str(e)
            low = msg.lower()
            if "unknown command" in low or "ts." in low or "timeseries" in low:
                print(
                    "失败：当前 Redis 似乎不支持 TimeSeries（需 RedisTimeSeries 模块）。\n"
                    f"  原始错误: {msg}",
                    file=sys.stderr,
                )
                return 1
            raise

    print(f"done. {len(keys)}× {PREFIX}*")
    print("建议验收：")
    print("  tiny / page           → 基础表格与正/倒序分页")
    print("  huge（9999）          → 长扫描：底栏「已扫描」旁暂停控件")
    print("  range-clusters        → 时间戳区间 1000–1004 / 5e4 / 2e5")
    print("  value-filter          → 数值 FILTER_BY_VALUE")
    print("  labeled               → 更多 → TS.INFO")
    print("  empty / single        → 插入首样本 / 编辑删行")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
