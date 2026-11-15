import { describe, expect, it } from 'vite-plus/test'

import { indexAlterDraft, indexCreateDraft, indexDdl } from '@/utils/redis/search-ddl'

describe('indexDdl', () => {
  it('RESP2 交替数组还原 FT.CREATE，统计里的 NaN 不影响', () => {
    const raw = JSON.stringify([
      'index_definition',
      ['key_type', 'HASH', 'prefixes', ['user:'], 'default_score', '1'],
      'attributes',
      [['identifier', 'name', 'attribute', 'name', 'type', 'TEXT', 'WITHSUFFIXTRIE']],
      'gc_stats',
      ['average_cycle_time_ms', NaN],
    ]).replaceAll('null', 'NaN')
    expect(indexDdl(raw, 'idx')).toBe(
      [
        'FT.CREATE idx',
        '    ON HASH',
        '    PREFIX 1 "user:"',
        '    SCHEMA',
        '      "name" TEXT WITHSUFFIXTRIE',
      ].join('\n'),
    )
  })

  it('JSON 别名和向量参数个数按 FT.CREATE 拼', () => {
    const raw = {
      index_definition: { key_type: 'JSON', prefixes: ['movie:'], default_score: 1 },
      index_options: ['NOOFFSETS'],
      attributes: [
        { identifier: '$.title', attribute: 'title', type: 'TEXT' },
        {
          identifier: 'embedding',
          attribute: 'embedding',
          type: 'VECTOR',
          algorithm: 'FLAT',
          data_type: 'FLOAT32',
          dim: 8,
          distance_metric: 'COSINE',
        },
      ],
    }
    expect(indexDdl(JSON.stringify(raw), 'idx:movies_vss')).toBe(
      [
        'FT.CREATE idx:movies_vss',
        '    ON JSON',
        '    PREFIX 1 "movie:"',
        '        NOOFFSETS',
        '    SCHEMA',
        '      "$.title" AS "title" TEXT',
        '      "embedding" VECTOR FLAT 6',
        '        TYPE FLOAT32',
        '        DIM 8',
        '        DISTANCE_METRIC COSINE',
      ].join('\n'),
    )
  })

  it('flags 展开，默认权重和逗号分隔符省略，嵌套的向量容量写回', () => {
    const raw = {
      index_definition: { key_type: 'HASH', prefixes: ['bikes:'] },
      attributes: [
        {
          identifier: 'model',
          attribute: 'model',
          type: 'TEXT',
          WEIGHT: 1,
          flags: ['SORTABLE', 'NOSTEM'],
        },
        { identifier: 'price', attribute: 'price', type: 'NUMERIC', flags: ['SORTABLE'] },
        { identifier: 'type', attribute: 'type', type: 'TAG', SEPARATOR: ',', flags: [] },
        {
          identifier: 'description_embeddings',
          attribute: 'description_embeddings',
          type: 'VECTOR',
          algorithm: 'FLAT',
          data_type: 'FLOAT32',
          dim: 768,
          distance_metric: 'L2',
          flags: [],
          index: { initial_cap: 111, block_size: 111 },
        },
      ],
    }
    expect(indexDdl(JSON.stringify(raw), 'idx:bikes_vss')).toBe(
      [
        'FT.CREATE idx:bikes_vss',
        '    ON HASH',
        '    PREFIX 1 "bikes:"',
        '    SCHEMA',
        '      "model" TEXT NOSTEM SORTABLE',
        '      "price" NUMERIC SORTABLE',
        '      "type" TAG',
        '      "description_embeddings" VECTOR FLAT 10',
        '        TYPE FLOAT32',
        '        DIM 768',
        '        DISTANCE_METRIC L2',
        '        INITIAL_CAP 111',
        '        BLOCK_SIZE 111',
      ].join('\n'),
    )
  })

  it('隐式 UNF 省略，Hash 文本上显式的 UNF 保留', () => {
    const raw = {
      index_definition: { key_type: 'HASH' },
      attributes: [
        { identifier: 'model', attribute: 'model', type: 'TEXT', flags: ['SORTABLE', 'UNF'] },
        { identifier: 'price', attribute: 'price', type: 'NUMERIC', flags: ['SORTABLE', 'UNF'] },
        {
          identifier: 'sku',
          attribute: 'sku',
          type: 'TAG',
          flags: ['SORTABLE', 'UNF', 'CASESENSITIVE'],
        },
        { identifier: 'color', attribute: 'color', type: 'TAG', flags: ['SORTABLE', 'UNF'] },
      ],
    }
    const json = {
      index_definition: { key_type: 'JSON' },
      attributes: [
        { identifier: '$.title', attribute: 'title', type: 'TEXT', flags: ['SORTABLE', 'UNF'] },
      ],
    }
    expect(indexDdl(JSON.stringify(raw), 'idx')).toBe(
      [
        'FT.CREATE idx',
        '    ON HASH',
        '    SCHEMA',
        '      "model" TEXT SORTABLE UNF',
        '      "price" NUMERIC SORTABLE',
        '      "sku" TAG CASESENSITIVE SORTABLE',
        '      "color" TAG SORTABLE UNF',
      ].join('\n'),
    )
    expect(indexDdl(JSON.stringify(json), 'idx')).toBe(
      [
        'FT.CREATE idx',
        '    ON JSON',
        '    SCHEMA',
        '      "$.title" AS "title" TEXT SORTABLE',
      ].join('\n'),
    )
  })

  it('键详情预填：按当前键的值猜 NUMERIC / TAG，其余 TEXT', () => {
    expect(
      indexCreateDraft('HASH', 'user:1001', [
        { name: 'name', value: 'Ada Lovelace' },
        { name: 'name', value: 'skipped' },
        { name: ' score ', value: ' 9.5 ' },
        { name: 'type', value: 'pro' },
        { name: 'note', value: '' },
        { name: 'token', value: '1e10' },
        { name: 'sku', value: 'A'.repeat(64) },
        { name: 'blob', value: 'A'.repeat(65) },
      ]),
    ).toBe(
      [
        'FT.CREATE idx:user',
        '    ON HASH',
        '    PREFIX 1 user:',
        '    SCHEMA',
        '      name TEXT',
        '      score NUMERIC',
        '      type TAG',
        '      note TEXT',
        '      token TAG',
        '      sku TAG',
        '      blob TEXT',
      ].join('\n'),
    )
    expect(
      indexCreateDraft('JSON', 'order:2024:9', [
        { name: 'title', value: 'hello' },
        { name: 'a.b', value: { x: 1 } },
        { name: 'price', value: 12 },
        { name: 'priceStr', value: '12' },
        { name: 'ok', value: true },
        { name: 'gone', value: null },
        { name: 'desc', value: 'has space' },
        { name: 'tags', value: ['a'] },
      ]),
    ).toBe(
      [
        'FT.CREATE idx:order:2024',
        '    ON JSON',
        '    PREFIX 1 order:2024:',
        '    SCHEMA',
        '      $.title TAG',
        `      ${JSON.stringify('$["a.b"]')} TEXT`,
        '      $.price NUMERIC',
        '      $.priceStr TAG',
        '      $.ok TAG',
        '      $.gone TAG',
        '      $.desc TEXT',
        '      $.tags TEXT',
      ].join('\n'),
    )
    expect(indexCreateDraft('HASH', 'lonely', [])).toBe(
      [
        'FT.CREATE idx:lonely',
        '    ON HASH',
        '    PREFIX 1 lonely',
        '    SCHEMA',
        '      field TEXT',
      ].join('\n'),
    )
  })

  it('修改索引预填当前索引名，特殊字符加引号', () => {
    expect(indexAlterDraft('idx:user')).toBe(
      ['FT.ALTER idx:user', '    SCHEMA ADD', '      city TEXT', '      year NUMERIC'].join('\n'),
    )
    expect(indexAlterDraft(' a b ')).toBe(
      ['FT.ALTER "a b"', '    SCHEMA ADD', '      city TEXT', '      year NUMERIC'].join('\n'),
    )
    expect(indexAlterDraft('  ')).toBe(
      ['FT.ALTER idx:name', '    SCHEMA ADD', '      city TEXT', '      year NUMERIC'].join('\n'),
    )
  })

  it('空停用词是 STOPWORDS 0，过长的默认词表省略', () => {
    expect(indexDdl(JSON.stringify({ stopwords_list: [], attributes: [] }), 'idx')).toBe(
      ['FT.CREATE idx', '    STOPWORDS 0', '    SCHEMA'].join('\n'),
    )
    const many = Array.from({ length: 65 }, (_, i) => `w${i}`)
    expect(indexDdl(JSON.stringify({ stopwords_list: many, attributes: [] }), 'idx')).toBe(
      ['FT.CREATE idx', '    SCHEMA'].join('\n'),
    )
  })
})
