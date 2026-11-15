import { describe, expect, it } from 'vite-plus/test'

import {
  buildTerminalKeyHintTips,
  getKeyHintRuleForTest,
  isTypingTerminalCommandName,
  parseTerminalKeyHintContext,
  setTerminalKeyHints,
  terminalHintInput,
} from '@/utils/redis/terminal-key-hints'

describe('terminalHintInput', () => {
  it('keeps trailing space when cursor is one behind (GET + space)', () => {
    expect(terminalHintInput('GET ', 3)).toBe('GET ')
    expect(parseTerminalKeyHintContext(terminalHintInput('GET ', 3))).toEqual({
      cmd: 'GET',
      commandPrefix: 'GET ',
      keyPrefix: '',
    })
  })

  it('slices when cursor is in the command name', () => {
    expect(terminalHintInput('GET foo', 3)).toBe('GET')
    expect(parseTerminalKeyHintContext(terminalHintInput('GET foo', 3))).toBeNull()
  })
})

describe('isTypingTerminalCommandName', () => {
  const keys = [
    'GET',
    'GETBIT',
    'HGET',
    'HGETALL',
    'HSET',
    'MSET',
    'CONFIG GET',
    'CONFIG SET',
    'OBJECT ENCODING',
  ]

  it('is true while typing the first token', () => {
    expect(isTypingTerminalCommandName('HGET', keys)).toBe(true)
    expect(isTypingTerminalCommandName('CON', keys)).toBe(true)
  })

  it('is true for unfinished multi-word commands', () => {
    expect(isTypingTerminalCommandName('CONFIG ', keys)).toBe(true)
    expect(isTypingTerminalCommandName('CONFIG G', keys)).toBe(true)
    expect(isTypingTerminalCommandName('OBJECT ENC', keys)).toBe(true)
  })

  it('is false at HGET field and MSET value', () => {
    expect(isTypingTerminalCommandName('HGET mykey ', keys)).toBe(false)
    expect(isTypingTerminalCommandName('HGET mykey field', keys)).toBe(false)
    expect(isTypingTerminalCommandName('HSET k f v', keys)).toBe(false)
    expect(isTypingTerminalCommandName('MSET k1 v1', keys)).toBe(false)
  })

  it('is false after a completed CONFIG GET', () => {
    expect(isTypingTerminalCommandName('CONFIG GET ', keys)).toBe(false)
    expect(isTypingTerminalCommandName('CONFIG GET param', keys)).toBe(false)
  })
})

describe('parseTerminalKeyHintContext', () => {
  it('matches single-word command with trailing space', () => {
    expect(parseTerminalKeyHintContext('GET ')).toEqual({
      cmd: 'GET',
      commandPrefix: 'GET ',
      keyPrefix: '',
    })
  })

  it('matches partial key after command', () => {
    expect(parseTerminalKeyHintContext('GET foo')).toEqual({
      cmd: 'GET',
      commandPrefix: 'GET ',
      keyPrefix: 'foo',
    })
  })

  it('stops after key argument for HGET', () => {
    expect(parseTerminalKeyHintContext('HGET mykey field')).toBeNull()
  })

  it('matches multi-word command', () => {
    expect(parseTerminalKeyHintContext('OBJECT ENCODING ')).toEqual({
      cmd: 'OBJECT ENCODING',
      commandPrefix: 'OBJECT ENCODING ',
      keyPrefix: '',
    })
  })

  it('does not match command without space', () => {
    expect(parseTerminalKeyHintContext('GET')).toBeNull()
  })

  it('does not match CONFIG GET', () => {
    expect(parseTerminalKeyHintContext('CONFIG GET ')).toBeNull()
  })

  it('matches RENAME second key after first key and space', () => {
    expect(parseTerminalKeyHintContext('RENAME old ')).toEqual({
      cmd: 'RENAME',
      commandPrefix: 'RENAME old ',
      keyPrefix: '',
    })
  })

  it('matches partial first key for RENAME', () => {
    expect(parseTerminalKeyHintContext('RENAME redis')).toEqual({
      cmd: 'RENAME',
      commandPrefix: 'RENAME ',
      keyPrefix: 'redis',
    })
  })

  it('matches partial second key for RENAME', () => {
    expect(parseTerminalKeyHintContext('RENAME old new')).toEqual({
      cmd: 'RENAME',
      commandPrefix: 'RENAME old ',
      keyPrefix: 'new',
    })
  })

  it('matches MGET second key after first key and space', () => {
    expect(parseTerminalKeyHintContext('MGET k1 ')).toEqual({
      cmd: 'MGET',
      commandPrefix: 'MGET k1 ',
      keyPrefix: '',
    })
  })

  it('matches partial second key for MGET', () => {
    expect(parseTerminalKeyHintContext('MGET k1 k2')).toEqual({
      cmd: 'MGET',
      commandPrefix: 'MGET k1 ',
      keyPrefix: 'k2',
    })
  })

  it('matches DEL multiple keys', () => {
    expect(parseTerminalKeyHintContext('DEL a b ')).toEqual({
      cmd: 'DEL',
      commandPrefix: 'DEL a b ',
      keyPrefix: '',
    })
  })

  it('matches MSET second key after value', () => {
    expect(parseTerminalKeyHintContext('MSET k1 v1 ')).toEqual({
      cmd: 'MSET',
      commandPrefix: 'MSET k1 v1 ',
      keyPrefix: '',
    })
  })

  it('does not hint MSET value position', () => {
    expect(parseTerminalKeyHintContext('MSET k1 v1')).toBeNull()
  })

  it('rename rule includes both key slots', () => {
    expect(getKeyHintRuleForTest('RENAME')).toEqual({
      cmdKey: 'RENAME',
      keySlotMode: 'fixed',
      prefixArgCount: 0,
      keySlotIndexes: [0, 1],
    })
  })

  it('hints SUNIONSTORE destination then source keys', () => {
    expect(getKeyHintRuleForTest('SUNIONSTORE')).toEqual({
      cmdKey: 'SUNIONSTORE',
      keySlotMode: 'repeat-keys',
      prefixArgCount: 1,
      keySlotIndexes: [0],
    })
    expect(parseTerminalKeyHintContext('SUNIONSTORE ')).toEqual({
      cmd: 'SUNIONSTORE',
      commandPrefix: 'SUNIONSTORE ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('SUNIONSTORE dest ')).toEqual({
      cmd: 'SUNIONSTORE',
      commandPrefix: 'SUNIONSTORE dest ',
      keyPrefix: '',
    })
  })

  it('hints ZINTERSTORE destination but not numkeys', () => {
    expect(parseTerminalKeyHintContext('ZINTERSTORE ')).toEqual({
      cmd: 'ZINTERSTORE',
      commandPrefix: 'ZINTERSTORE ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('ZINTERSTORE dest ')).toBeNull()
    expect(parseTerminalKeyHintContext('ZINTERSTORE dest 2 ')).toEqual({
      cmd: 'ZINTERSTORE',
      commandPrefix: 'ZINTERSTORE dest 2 ',
      keyPrefix: '',
    })
  })

  it('does not hint MSETEX numkeys, hints first key after it', () => {
    expect(getKeyHintRuleForTest('MSETEX')).toEqual({
      cmdKey: 'MSETEX',
      keySlotMode: 'key-value-pairs',
      prefixArgCount: 1,
      keySlotIndexes: [],
      period: 2,
    })
    expect(parseTerminalKeyHintContext('MSETEX ')).toBeNull()
    expect(parseTerminalKeyHintContext('MSETEX 2 ')).toEqual({
      cmd: 'MSETEX',
      commandPrefix: 'MSETEX 2 ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('MSETEX 2 k1 v1')).toBeNull()
    expect(parseTerminalKeyHintContext('MSETEX 2 k1 v1 ')).toEqual({
      cmd: 'MSETEX',
      commandPrefix: 'MSETEX 2 k1 v1 ',
      keyPrefix: '',
    })
  })

  it('hints BITOP destkey after operation, not the operation itself', () => {
    expect(getKeyHintRuleForTest('BITOP')).toEqual({
      cmdKey: 'BITOP',
      keySlotMode: 'repeat-keys',
      prefixArgCount: 2,
      keySlotIndexes: [1],
    })
    expect(parseTerminalKeyHintContext('BITOP ')).toBeNull()
    expect(parseTerminalKeyHintContext('BITOP AND ')).toEqual({
      cmd: 'BITOP',
      commandPrefix: 'BITOP AND ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('BITOP AND dest ')).toEqual({
      cmd: 'BITOP',
      commandPrefix: 'BITOP AND dest ',
      keyPrefix: '',
    })
  })

  it('hints LCS both keys and PFMERGE dest plus sources', () => {
    expect(parseTerminalKeyHintContext('LCS ')).toEqual({
      cmd: 'LCS',
      commandPrefix: 'LCS ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('LCS k1 ')).toEqual({
      cmd: 'LCS',
      commandPrefix: 'LCS k1 ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('LCS k1 k2 ')).toBeNull()
    expect(parseTerminalKeyHintContext('PFMERGE ')).toEqual({
      cmd: 'PFMERGE',
      commandPrefix: 'PFMERGE ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('PFMERGE dest ')).toEqual({
      cmd: 'PFMERGE',
      commandPrefix: 'PFMERGE dest ',
      keyPrefix: '',
    })
  })

  it('hints ZRANGESTORE dst and src', () => {
    expect(parseTerminalKeyHintContext('ZRANGESTORE ')).toEqual({
      cmd: 'ZRANGESTORE',
      commandPrefix: 'ZRANGESTORE ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('ZRANGESTORE dst ')).toEqual({
      cmd: 'ZRANGESTORE',
      commandPrefix: 'ZRANGESTORE dst ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('ZRANGESTORE dst src ')).toBeNull()
  })

  it('hints JSON.MSET repeating keys every three args', () => {
    expect(getKeyHintRuleForTest('JSON.MSET')).toEqual({
      cmdKey: 'JSON.MSET',
      keySlotMode: 'key-value-pairs',
      prefixArgCount: 0,
      keySlotIndexes: [],
      period: 3,
    })
    expect(parseTerminalKeyHintContext('JSON.MSET k1 $ v1 ')).toEqual({
      cmd: 'JSON.MSET',
      commandPrefix: 'JSON.MSET k1 $ v1 ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('JSON.MSET k1 $')).toBeNull()
  })

  it('parses quoted key with spaces as one argument', () => {
    expect(parseTerminalKeyHintContext('MGET "a b" ')).toEqual({
      cmd: 'MGET',
      commandPrefix: 'MGET "a b" ',
      keyPrefix: '',
    })
    expect(parseTerminalKeyHintContext('GET "a b')).toEqual({
      cmd: 'GET',
      commandPrefix: 'GET ',
      keyPrefix: 'a b',
    })
    expect(parseTerminalKeyHintContext("GET 'a b'")).toEqual({
      cmd: 'GET',
      commandPrefix: 'GET ',
      keyPrefix: 'a b',
    })
    expect(parseTerminalKeyHintContext("GET user's:id")).toEqual({
      cmd: 'GET',
      commandPrefix: 'GET ',
      keyPrefix: "user's:id",
    })
  })

  it('hints XREADGROUP keys after STREAMS, not GROUP args', () => {
    expect(parseTerminalKeyHintContext('XREADGROUP ')).toBeNull()
    expect(parseTerminalKeyHintContext('XREADGROUP GROUP g c STREAMS ')).toEqual({
      cmd: 'XREADGROUP',
      commandPrefix: 'XREADGROUP GROUP g c STREAMS ',
      keyPrefix: '',
    })
  })

  it('does not treat EVAL key list as hintable at script position', () => {
    expect(getKeyHintRuleForTest('EVAL')).toBeUndefined()
    expect(parseTerminalKeyHintContext('EVAL ')).toBeNull()
  })
})

describe('buildTerminalKeyHintTips', () => {
  it('prioritizes favorite keys', () => {
    setTerminalKeyHints(['alpha', 'beta'], ['beta'])
    const tips = buildTerminalKeyHintTips(
      { cmd: 'GET', commandPrefix: 'GET ', keyPrefix: '' },
      [
        { name: 'beta', source: 'favorite' },
        { name: 'alpha', source: 'scanned' },
      ],
      { scanned: 'scanned', favorite: 'favorite' },
    )
    expect(tips[0]?.description).toBe('favorite')
    expect(tips[0]?.command?.key).toBe('GET beta')
  })

  it('preserves previous keys for MGET', () => {
    const tips = buildTerminalKeyHintTips(
      { cmd: 'MGET', commandPrefix: 'MGET k1 ', keyPrefix: 'k' },
      [{ name: 'k2', source: 'scanned' }],
      { scanned: 'scanned', favorite: 'favorite' },
    )
    expect(tips[0]?.command?.key).toBe('MGET k1 k2')
  })

  it('filters keys by first RENAME argument prefix', () => {
    const tips = buildTerminalKeyHintTips(
      { cmd: 'RENAME', commandPrefix: 'RENAME ', keyPrefix: 'redis' },
      [
        { name: 'RedisME', source: 'favorite' },
        { name: 'vec2word', source: 'favorite' },
        { name: '小何包', source: 'favorite' },
      ],
      { scanned: 'scanned', favorite: 'favorite' },
    )
    expect(tips.map(t => t.command?.key)).toEqual(['RENAME RedisME'])
  })

  it('preserves first key for RENAME', () => {
    const tips = buildTerminalKeyHintTips(
      { cmd: 'RENAME', commandPrefix: 'RENAME old ', keyPrefix: 'n' },
      [{ name: 'newkey', source: 'scanned' }],
      { scanned: 'scanned', favorite: 'favorite' },
    )
    expect(tips[0]?.command?.key).toBe('RENAME old newkey')
  })

  it('quotes keys with spaces', () => {
    const tips = buildTerminalKeyHintTips(
      { cmd: 'GET', commandPrefix: 'GET ', keyPrefix: '' },
      [{ name: 'a b', source: 'scanned' }],
      { scanned: 'scanned', favorite: 'favorite' },
    )
    expect(tips[0]?.command?.key).toBe('GET "a b"')
  })

  it('escapes HTML in key names used as tip content', () => {
    const tips = buildTerminalKeyHintTips(
      { cmd: 'GET', commandPrefix: 'GET ', keyPrefix: 'a<' },
      [{ name: 'a<b&c', source: 'scanned' }],
      { scanned: 'scanned', favorite: 'favorite' },
    )
    expect(tips[0]?.content).toBe('<span class="t-cmd-key">a&lt;</span>b&amp;c')
    expect(tips[0]?.command?.key).toBe('GET a<b&c')
  })

  it('attaches original command usage so help panel is not empty', () => {
    const tips = buildTerminalKeyHintTips(
      { cmd: 'GET', commandPrefix: 'GET ', keyPrefix: '' },
      [{ name: 'k1', source: 'scanned' }],
      { scanned: 'scanned', favorite: 'favorite' },
      { usage: 'GET key', description: 'Get the value of a key' },
    )
    expect(tips[0]?.command?.usage).toBe('GET key')
    expect(tips[0]?.command?.description).toBe('Get the value of a key')
    expect(tips[0]?.command?.key).toBe('GET k1')
  })
})
