import { afterEach, describe, expect, it } from 'vite-plus/test'

import { utf8TextToBase64 } from '@/utils/codec/format'
import {
  addFavorite,
  addFavoriteFolder,
  clearFavoriteFoldersForDb,
  clearFavoritesForDb,
  isFavorited,
  isFolderFavorited,
  removeFavorite,
  removeFavoriteFolder,
  type FavoriteFolder,
  type FavoriteKey,
} from '@/utils/redis/favorite'

const keyA = { key: 'user:1', bytes: '' }
const keyB = { key: 'user:2', bytes: '' }

function fav(connId: string, db: number, key = keyA, favoritedAt = 1): FavoriteKey {
  return { connId, db, redisKey: key, favoritedAt }
}

function folder(connId: string, db: number, path: string, favoritedAt = 1): FavoriteFolder {
  return { connId, db, path, favoritedAt }
}

describe('favorite keys', () => {
  const realNow = Date.now
  afterEach(() => {
    Date.now = realNow
  })

  it('按连接和库判断，UTF-8 有无 bytes 视为同一键', () => {
    const wire = utf8TextToBase64('user:1')
    const list = [fav('c1', 0, { key: 'user:1', bytes: wire })]
    expect(isFavorited(list, 'c1', 0, keyA)).toBe(true)
    expect(isFavorited(list, 'c1', 1, keyA)).toBe(false)
    expect(isFavorited(list, 'c2', 0, keyA)).toBe(false)
    expect(isFavorited(list, 'c1', 0, keyB)).toBe(false)
  })

  it('新增不重复，并记下时间', () => {
    Date.now = () => 42
    const existing = [fav('c1', 0)]
    const added = addFavorite(existing, 'c1', 2, keyA)
    expect(existing).toEqual([fav('c1', 0)])
    expect(added).toEqual([fav('c1', 0), { connId: 'c1', db: 2, redisKey: keyA, favoritedAt: 42 }])
    expect(addFavorite(added, 'c1', 2, keyA)).toBe(added)
  })

  it('删除只去掉匹配项', () => {
    const list = [fav('c1', 0), fav('c1', 0, keyB), fav('c1', 1)]
    expect(removeFavorite(list, 'c1', 0, keyA)).toEqual([fav('c1', 0, keyB), fav('c1', 1)])
  })

  it('清空某个库不影响其它库和其它连接', () => {
    const list = [fav('c1', 0), fav('c1', 1), fav('c2', 0)]
    expect(clearFavoritesForDb(list, 'c1', 0)).toEqual([fav('c1', 1), fav('c2', 0)])
  })
})

describe('favorite folders', () => {
  const realNow = Date.now
  afterEach(() => {
    Date.now = realNow
  })

  it('路径精确匹配', () => {
    const list = [folder('c1', 0, 'a:b')]
    expect(isFolderFavorited(list, 'c1', 0, 'a:b')).toBe(true)
    expect(isFolderFavorited(list, 'c1', 0, 'a')).toBe(false)
    expect(isFolderFavorited(list, 'c1', 1, 'a:b')).toBe(false)
  })

  it('空路径不加；已有路径不重复', () => {
    Date.now = () => 7
    const list = [folder('c1', 0, 'app')]
    expect(addFavoriteFolder(list, 'c1', 0, '')).toBe(list)
    expect(addFavoriteFolder(list, 'c1', 0, 'app')).toBe(list)
    expect(addFavoriteFolder([], 'c1', 3, 'app')).toEqual([
      { connId: 'c1', db: 3, path: 'app', favoritedAt: 7 },
    ])
  })

  it('删除和按库清空', () => {
    const list = [
      folder('c1', 0, 'a'),
      folder('c1', 0, 'b'),
      folder('c1', 1, 'a'),
      folder('c2', 0, 'a'),
    ]
    expect(removeFavoriteFolder(list, 'c1', 0, 'a')).toEqual([
      folder('c1', 0, 'b'),
      folder('c1', 1, 'a'),
      folder('c2', 0, 'a'),
    ])
    expect(clearFavoriteFoldersForDb(list, 'c1', 0)).toEqual([
      folder('c1', 1, 'a'),
      folder('c2', 0, 'a'),
    ])
  })
})
