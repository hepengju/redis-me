import { describe, expect, it } from 'vite-plus/test'

import {
  CODEC_TEMPLATES,
  buildCodecCommandLine,
  findCodecTemplate,
} from '@/utils/codec/codec-templates'

describe('codec templates', () => {
  it('内置 python / node / java，脚本里同时有 decode 和 encode', () => {
    expect(CODEC_TEMPLATES.map(item => item.id)).toEqual(['python', 'node', 'java'])
    for (const item of CODEC_TEMPLATES) {
      expect(item.interpreter.length).toBeGreaterThan(0)
      expect(item.fileName.endsWith(`.${item.ext}`)).toBe(true)
      expect(item.source).toContain('decode')
      expect(item.source).toContain('encode')
    }
    expect(findCodecTemplate('python')?.interpreter).toBe('python')
    expect(findCodecTemplate('missing')).toBeUndefined()
  })

  it('路径含空格或引号时加引号并去掉原引号', () => {
    expect(buildCodecCommandLine('python', 'C:\\codec.py')).toBe('python C:\\codec.py')
    expect(buildCodecCommandLine('python', 'C:\\My Scripts\\codec.py')).toBe(
      'python "C:\\My Scripts\\codec.py"',
    )
    expect(buildCodecCommandLine('python', 'C:\\a"b.py')).toBe('python "C:\\ab.py"')
  })
})
