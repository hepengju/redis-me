/**
 * 小端 FLOAT32 向量（RediSearch HASH 的 VECTOR TYPE FLOAT32）。
 * Auto 在不是合法 UTF-8 时才认：至少 8 字节、长度是 4 的倍数、每个数有限，
 * 并且数量级挤在一起（绝对值不超过 1e6，非零分量的指数跨度不超过 40）。
 * 任意二进制（如 Kryo / Marshalling）常被误读成有限浮点，跨度很大就留给 Hex。
 * 手动选 Vector32 仍只检查长度和有限性。只读，不把浮点文本编回字节。
 */

const MIN_AUTO_BYTES = 8
/** 超过这个绝对值不像向量分量 */
const MAX_ABS = 1e6
/** 非零分量 log2 跨度上限，约 12 个数量级；再散就是别的二进制 */
const MAX_EXP_SPAN = 40

function dataViewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export function formatF32(n: number): string {
  if (!Number.isFinite(n)) return 'null'
  return String(n)
}

/**
 * Auto 用。调用方须已排除合法 UTF-8。
 * 短于 8 字节不认，避免把单个浮点或碎字节从 Hex 抢走。
 */
export function looksLikeVector32(bytes: Uint8Array): boolean {
  if (bytes.length < MIN_AUTO_BYTES || bytes.length % 4 !== 0) return false
  const view = dataViewOf(bytes)
  let minExp = Infinity
  let maxExp = -Infinity
  for (let i = 0; i < bytes.length; i += 4) {
    const n = view.getFloat32(i, true)
    if (!Number.isFinite(n)) return false
    const abs = Math.abs(n)
    if (abs === 0) continue
    if (abs > MAX_ABS) return false
    const exp = Math.floor(Math.log2(abs))
    if (exp < minExp) minExp = exp
    if (exp > maxExp) maxExp = exp
  }
  if (!Number.isFinite(minExp)) return true
  return maxExp - minExp <= MAX_EXP_SPAN
}

/**
 * 手动选 Vector32 时用。长度不是 4 的倍数，或含 NaN/Infinity，返回 null（展示层报解码错误，不退回别的编码）。
 * 允许 4 字节（一个数）；Auto 仍要求至少两个数。
 */
export function formatVector32Bytes(bytes: Uint8Array): string | null {
  if (bytes.length === 0 || bytes.length % 4 !== 0) return null
  const view = dataViewOf(bytes)
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += 4) {
    const n = view.getFloat32(i, true)
    if (!Number.isFinite(n)) return null
    parts.push(formatF32(n))
  }
  return `[${parts.join(', ')}]`
}
