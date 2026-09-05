#!/usr/bin/env python3
"""向 Redis 写入若干 Gzip 样例键，供 RedisME Auto「Gzip · 内层」只读剥壳验证。

需 Python 3.8+，无第三方依赖（纯 socket + RESP + 标准库 gzip/pickle）。
连接参数优先级：命令行 > 环境变量 > 默认本机。
环境变量：REDIS_SERVER / REDIS_PROT / REDIS_PASSWORD。

用法::

    python GzipSeed.py
    python GzipSeed.py 127.0.0.1 6379 hepengju
    python GzipSeed.py 127.0.0.1 6379 ""          # 无密码

写入的键前缀均为 encoding:gzip:。STRING 整键选 Auto，旁侧标签应为 Gzip · UTF8 /
Gzip · JdkSerial 等；剥过 Gzip 后只读，不支持保存写回。Hash/List/Set/ZSet 打开
字段弹窗测字段级 Auto（混有明文 UTF-8）。

场景对照（Auto 期望）：

    utf8 / json / chinese     Gzip · UTF8
    strjson                   Gzip · StrJson
    pickle                    Gzip · Pickle
    javaserial                Gzip · JdkSerial（内嵌已知 TreeSet ACED）
    phpserial                 Gzip · PhpSerial
    msgpack                   Gzip · MsgPack
    binary                    Gzip · Hex
    empty                     Gzip · UTF8（空内层）
    nested                    只剥一层，内层仍是 Gzip → Gzip · Hex
    plain-utf8                无壳对照 → UTF8
    corrupt / truncated       魔数对但解不开 → Hex（不当壳）
"""

from __future__ import annotations

import base64
import gzip
import json
import os
import pickle
import socket
import sys

PREFIX = "encoding:gzip:"

# 与 detect-view-format.test.ts / javaserial 单测同源的 java.util.TreeSet
JAVA_TREESET_B64 = "rO0ABXNyABFqYXZhLnV0aWwuVHJlZVNldN2YUJOV7YdbAwAAeHBwdwQAAAACdAABYXQAAWJ4"

# 手写 MsgPack，避免引入第三方库：fixmap 1 {a:1} / fixarray 3 [1,2,3]
MSGPACK_MAP_A1 = bytes([0x81, 0xA1, 0x61, 0x01])
MSGPACK_ARR_123 = bytes([0x93, 0x01, 0x02, 0x03])


def gz(payload: bytes) -> bytes:
    return gzip.compress(payload)


class RedisCli:
    """最小 RESP 客户端：AUTH / SET / DEL / HSET / RPUSH / SADD / ZADD 二进制值。"""

    def __init__(self, host: str, port: int) -> None:
        self._sock = socket.create_connection((host, port))
        self._sock.settimeout(10)

    def close(self) -> None:
        self._sock.close()

    def __enter__(self) -> RedisCli:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def auth(self, password: str) -> None:
        self._write_command(b"AUTH", password.encode("utf-8"))
        self._read_ok()

    def set(self, key: str, value: bytes) -> None:
        self._write_command(b"SET", key.encode("utf-8"), value)
        self._read_ok()

    def delete(self, key: str) -> None:
        self._write_command(b"DEL", key.encode("utf-8"))
        self._read_integer()

    def hset(self, key: str, field: str, value: bytes) -> None:
        self._write_command(b"HSET", key.encode("utf-8"), field.encode("utf-8"), value)
        self._read_integer()

    def rpush(self, key: str, value: bytes) -> None:
        self._write_command(b"RPUSH", key.encode("utf-8"), value)
        self._read_integer()

    def sadd(self, key: str, member: bytes) -> None:
        self._write_command(b"SADD", key.encode("utf-8"), member)
        self._read_integer()

    def zadd(self, key: str, score: float, member: bytes) -> None:
        self._write_command(
            b"ZADD",
            key.encode("utf-8"),
            str(score).encode("ascii"),
            member,
        )
        self._read_integer()

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


def build_string_samples() -> list[tuple[str, bytes, str]]:
    """(key, payload, 说明)。payload 已是 Redis 里的原始字节（多数已 gzip）。"""
    pickle_obj = pickle.dumps({"k": "gzip-pickle", "n": 1, "zh": "中文"}, protocol=4)
    java_bytes = base64.b64decode(JAVA_TREESET_B64)
    php_arr = b'a:1:{s:1:"a";i:1;}'
    strjson = json.dumps(json.dumps({"a": 1}, separators=(",", ":"))).encode("utf-8")
    large_text = ("gzip-large " * 200 + "中文").encode("utf-8")
    inner_gz = gz("hello-nested".encode("utf-8"))
    good_gz = gz(b"hello-truncated")
    truncated = good_gz[:-8]  # 切掉 footer，解压应失败
    corrupt = bytes([0x1F, 0x8B, 0x08]) + b"\x00" * 16

    return [
        (PREFIX + "utf8", gz("hello gzip 你好".encode("utf-8")), "Gzip · UTF8"),
        (PREFIX + "json", gz(b'{"name":"gzip","n":1}'), "Gzip · UTF8（普通 JSON）"),
        (PREFIX + "chinese", gz("中文压缩文本，含换行\n第二行".encode("utf-8")), "Gzip · UTF8"),
        (PREFIX + "strjson", gz(strjson), "Gzip · StrJson"),
        (PREFIX + "pickle", gz(pickle_obj), "Gzip · Pickle"),
        (PREFIX + "javaserial", gz(java_bytes), "Gzip · JdkSerial"),
        (PREFIX + "phpserial", gz(php_arr), "Gzip · PhpSerial"),
        (PREFIX + "msgpack", gz(MSGPACK_MAP_A1), "Gzip · MsgPack map"),
        (PREFIX + "msgpack-arr", gz(MSGPACK_ARR_123), "Gzip · MsgPack array"),
        (PREFIX + "binary", gz(bytes([0xFF, 0xFE, 0x00, 0x01])), "Gzip · Hex"),
        (PREFIX + "empty", gz(b""), "Gzip · UTF8（空内层）"),
        (PREFIX + "large", gz(large_text), "Gzip · UTF8（约 2KB 明文）"),
        (PREFIX + "nested", gz(inner_gz), "只剥一层 → Gzip · Hex"),
        (PREFIX + "plain-utf8", "plain-not-gzip 对照".encode("utf-8"), "无壳 → UTF8"),
        (PREFIX + "corrupt", corrupt, "魔数对但解不开 → Hex"),
        (PREFIX + "truncated", truncated, "截断 Gzip → Hex"),
    ]


def seed_compound_types(redis: RedisCli) -> None:
    """Hash/List/Set/ZSet：字段值为 Gzip（混 UTF-8，测字段级 Auto）。"""
    pickle_user = pickle.dumps({"id": 1001, "name": "Alice"}, protocol=4)

    hash_key = PREFIX + "hash"
    redis.delete(hash_key)
    redis.hset(hash_key, "utf8", gz("hash-gzip-utf8".encode("utf-8")))
    redis.hset(hash_key, "json", gz(b'{"from":"hash"}'))
    redis.hset(hash_key, "pickle", gz(pickle_user))
    redis.hset(hash_key, "plain-utf8", "新增字段".encode("utf-8"))
    print(f"HSET {hash_key} (utf8/json/pickle=Gzip, plain-utf8=UTF8)")

    list_key = PREFIX + "list-key"
    redis.delete(list_key)
    redis.rpush(list_key, gz("hello-list".encode("utf-8")))
    redis.rpush(list_key, gz(pickle.dumps(42, protocol=4)))
    redis.rpush(list_key, gz(b'{"i":1}'))
    redis.rpush(list_key, "纯文本元素".encode("utf-8"))
    print(f"RPUSH {list_key} (3×Gzip + 1×UTF8)")

    set_key = PREFIX + "set-key"
    redis.delete(set_key)
    redis.sadd(set_key, gz("member-a".encode("utf-8")))
    redis.sadd(set_key, gz(pickle.dumps("member-pickle", protocol=4)))
    redis.sadd(set_key, b"utf8-member")
    print(f"SADD {set_key} (2×Gzip + 1×UTF8)")

    zset_key = PREFIX + "zset"
    redis.delete(zset_key)
    redis.zadd(zset_key, 1.0, gz("z-low".encode("utf-8")))
    redis.zadd(zset_key, 2.5, gz(pickle_user))
    redis.zadd(zset_key, 9.0, b"z-utf8")
    print(f"ZADD {zset_key} (2×Gzip + 1×UTF8)")


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
        for key, payload, note in build_string_samples():
            redis.set(key, payload)
            magic = payload[:2].hex() if len(payload) >= 2 else ""
            print(f"SET {key} ({len(payload)} bytes, magic={magic})  # {note}")
        seed_compound_types(redis)

    print("done. STRING → Auto 看 Gzip · 内层（只读）；Hash/List/Set/ZSet → 打开字段查看。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
