/** 自定义编解码内置模板：协议样板固定，用户只需改 decode/encode；内含 Hex 示例 */

export type CodecTemplateId = 'python' | 'node' | 'java'

export interface CodecTemplate {
  id: CodecTemplateId
  /** 写入 customCodecs 的默认名称 */
  defaultName: string
  /** 保存对话框默认文件名 */
  fileName: string
  /** 文件扩展名（对话框过滤） */
  ext: string
  /** 命令中的解释器（PATH 上的短名；用户可改成绝对路径） */
  interpreter: string
  source: string
}

const PYTHON_SOURCE = `#!/usr/bin/env python3
"""
RedisME 自定义编解码模板
协议样板一般无需修改；只需改下方 decode / encode。
"""
import sys
import base64
import binascii

# ---------------------------------------------------------------------------
# TODO: 实现你的编解码逻辑（下面是 Hex 示例，可直接用或改成业务格式）
# ---------------------------------------------------------------------------

def decode(raw: bytes) -> str:
    """Redis 原始字节 → 编辑器展示文本。"""
    return binascii.hexlify(raw).decode('ascii')  # 示例：小写十六进制


def encode(text: str) -> bytes:
    """编辑器文本 → Redis 原始字节。"""
    return binascii.unhexlify(text.strip())  # 示例：解析十六进制


# ---------------------------------------------------------------------------
# 协议样板：一般无需修改
# ---------------------------------------------------------------------------

def main() -> None:
    # Windows 管道默认可能是 GBK，RedisME 按 UTF-8 读取
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')

    if len(sys.argv) < 3:
        sys.exit('usage: codec.py <decode|encode> <base64|--stdin>')

    mode, arg = sys.argv[1], sys.argv[2]
    b64 = sys.stdin.readline().strip() if arg == '--stdin' else arg
    raw = base64.b64decode(b64)

    try:
        if mode == 'decode':
            sys.stdout.write(decode(raw))
        elif mode == 'encode':
            sys.stdout.write(base64.b64encode(encode(raw.decode('utf-8'))).decode('ascii'))
        else:
            raise ValueError(f'unknown mode: {mode}')
    except Exception as e:
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
`

const NODE_SOURCE = `#!/usr/bin/env node
/**
 * RedisME 自定义编解码模板
 * 协议样板一般无需修改；只需改下方 decode / encode。
 */

// ---------------------------------------------------------------------------
// TODO: 实现你的编解码逻辑（下面是 Hex 示例，可直接用或改成业务格式）
// ---------------------------------------------------------------------------

/** Redis 原始字节 → 编辑器展示文本 */
function decode(raw) {
  return raw.toString('hex') // 示例：小写十六进制
}

/** 编辑器文本 → Redis 原始字节 */
function encode(text) {
  return Buffer.from(text.trim(), 'hex') // 示例：解析十六进制
}

// ---------------------------------------------------------------------------
// 协议样板：一般无需修改
// ---------------------------------------------------------------------------

const mode = process.argv[2]
const arg = process.argv[3]

async function readB64() {
  if (arg !== '--stdin') {
    if (!mode || !arg) throw new Error('usage: codec.js <decode|encode> <base64|--stdin>')
    return arg
  }
  // 应用写完一行后不关 stdin，须读到换行即返回（勿等 EOF）
  let data = ''
  for await (const chunk of process.stdin) {
    data += chunk
    const nl = data.search(/\\r?\\n/)
    if (nl >= 0) return data.slice(0, nl).trim()
  }
  return data.trim()
}

async function main() {
  const raw = Buffer.from(await readB64(), 'base64')
  if (mode === 'decode') {
    process.stdout.write(decode(raw))
  } else if (mode === 'encode') {
    process.stdout.write(encode(raw.toString('utf8')).toString('base64'))
  } else {
    throw new Error(\`unknown mode: \${mode}\`)
  }
}

main()
  .then(() => process.exit(0)) // stdin 写完后管道不关，须主动退出
  .catch(e => {
    process.stderr.write(String(e) + '\\n')
    process.exit(1)
  })
`

const JAVA_SOURCE = `import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Scanner;

/**
 * RedisME 自定义编解码模板（JDK 11+ 可直接 java Codec.java）
 * 文件名须为 Codec.java；协议样板一般无需修改，只需改下方 decode / encode。
 */
public class Codec {

    // -----------------------------------------------------------------------
    // TODO: 实现你的编解码逻辑（下面是 Hex 示例，可直接用或改成业务格式）
    // -----------------------------------------------------------------------

    /** Redis 原始字节 → 编辑器展示文本 */
    private static String decode(byte[] raw) {
        return toHex(raw); // 示例：小写十六进制
    }

    /** 编辑器文本 → Redis 原始字节 */
    private static byte[] encode(String text) {
        return fromHex(text.trim()); // 示例：解析十六进制
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static byte[] fromHex(String hex) {
        if (hex.length() % 2 != 0) throw new IllegalArgumentException("invalid hex length");
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < hex.length(); i += 2) {
            int hi = Character.digit(hex.charAt(i), 16);
            int lo = Character.digit(hex.charAt(i + 1), 16);
            if (hi < 0 || lo < 0) throw new IllegalArgumentException("invalid hex character");
            out[i / 2] = (byte) ((hi << 4) + lo);
        }
        return out;
    }

    // -----------------------------------------------------------------------
    // 协议样板：一般无需修改
    // -----------------------------------------------------------------------

    public static void main(String[] args) {
        if (args.length < 2) {
            System.err.println("usage: Codec <decode|encode> <base64|--stdin>");
            System.exit(1);
        }
        String mode = args[0];
        String b64 = "--stdin".equals(args[1])
            ? new Scanner(System.in).nextLine().trim()
            : args[1];
        try {
            byte[] raw = Base64.getDecoder().decode(b64);
            if ("decode".equals(mode)) {
                System.out.print(decode(raw));
            } else if ("encode".equals(mode)) {
                System.out.print(Base64.getEncoder().encodeToString(
                    encode(new String(raw, StandardCharsets.UTF_8))));
            } else {
                throw new IllegalArgumentException("unknown mode: " + mode);
            }
        } catch (Exception e) {
            System.err.println(e.getMessage());
            System.exit(1);
        }
    }
}
`

export const CODEC_TEMPLATES: CodecTemplate[] = [
  {
    id: 'python',
    defaultName: 'Python',
    fileName: 'codec.py',
    ext: 'py',
    interpreter: 'python',
    source: PYTHON_SOURCE,
  },
  {
    id: 'node',
    defaultName: 'Node',
    fileName: 'codec.js',
    ext: 'js',
    interpreter: 'node',
    source: NODE_SOURCE,
  },
  {
    id: 'java',
    defaultName: 'Java',
    fileName: 'Codec.java',
    ext: 'java',
    interpreter: 'java',
    source: JAVA_SOURCE,
  },
]

export function findCodecTemplate(id: string): CodecTemplate | undefined {
  return CODEC_TEMPLATES.find(t => t.id === id)
}

/** 拼「解释器 + 脚本路径」；路径含空格时加引号（Windows cmd /C） */
export function buildCodecCommandLine(interpreter: string, scriptPath: string): string {
  const path = /[\s"]/.test(scriptPath) ? `"${scriptPath.replace(/"/g, '')}"` : scriptPath
  return `${interpreter} ${path}`
}
