import { describe, expect, it } from 'vite-plus/test'

import { rememberFtQuery } from '@/utils/redis/query-history'

describe('rememberFtQuery', () => {
  it('空串和 * 不记', () => {
    expect(rememberFtQuery(['bike'], '')).toEqual(['bike'])
    expect(rememberFtQuery(['bike'], '   ')).toEqual(['bike'])
    expect(rememberFtQuery(['bike'], '*')).toEqual(['bike'])
    expect(rememberFtQuery(['bike'], ' * ')).toEqual(['bike'])
  })

  it('新条件放最前，重复的只留一条', () => {
    expect(rememberFtQuery(['@type:{road}', 'bike'], 'bike')).toEqual(['bike', '@type:{road}'])
    expect(rememberFtQuery(['bike'], '  bike  ')).toEqual(['bike'])
  })

  it('最多 10 条', () => {
    const history = ['9', '8', '7', '6', '5', '4', '3', '2', '1', '0']
    expect(rememberFtQuery(history, '10')).toEqual([
      '10',
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
      '3',
      '2',
      '1',
    ])
  })
})
