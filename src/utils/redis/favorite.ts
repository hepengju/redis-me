import { useStorage } from '@vueuse/core'

import type { RedisKey_Deserialize } from '@/types/tauri-specta'
import { sameRedisKey } from '@/utils/redis/redis-key'

export interface FavoriteKey {
  connId: string
  db: number
  redisKey: RedisKey_Deserialize
  favoritedAt: number
}

/** 收藏目录：path 与 KeyTree 文件夹 id 一致，无尾部 ':' */
export interface FavoriteFolder {
  connId: string
  db: number
  path: string
  favoritedAt: number
}

/** 收藏模式上下分区布局（比例 + 折叠态） */
export interface FavoriteSplitLayout {
  /** 上区高度，如 '40%' */
  folderSize: string
  folderCollapsed: boolean
  keysCollapsed: boolean
}

const FAVORITE_KEY = 'redis-me:favorites'
const FAVORITE_FOLDER_KEY = 'redis-me:favorite-folders'
const FAVORITE_SPLIT_KEY = 'redis-me:favorite-split'

export function useFavorites() {
  return useStorage<FavoriteKey[]>(FAVORITE_KEY, [])
}

export function useFavoriteFolders() {
  return useStorage<FavoriteFolder[]>(FAVORITE_FOLDER_KEY, [])
}

export function useFavoriteSplitLayout() {
  return useStorage<FavoriteSplitLayout>(FAVORITE_SPLIT_KEY, {
    folderSize: '40%',
    folderCollapsed: false,
    keysCollapsed: false,
  })
}

export function isFavorited(
  favorites: FavoriteKey[],
  connId: string,
  db: number,
  redisKey: RedisKey_Deserialize,
): boolean {
  return favorites.some(
    f => f.connId === connId && f.db === db && sameRedisKey(f.redisKey, redisKey),
  )
}

export function addFavorite(
  favorites: FavoriteKey[],
  connId: string,
  db: number,
  redisKey: RedisKey_Deserialize,
): FavoriteKey[] {
  if (isFavorited(favorites, connId, db, redisKey)) return favorites
  return [...favorites, { connId, db, redisKey, favoritedAt: Date.now() }]
}

export function removeFavorite(
  favorites: FavoriteKey[],
  connId: string,
  db: number,
  redisKey: RedisKey_Deserialize,
): FavoriteKey[] {
  return favorites.filter(
    f => !(f.connId === connId && f.db === db && sameRedisKey(f.redisKey, redisKey)),
  )
}

/** 清空指定连接下某一 db 的全部收藏键 */
export function clearFavoritesForDb(
  favorites: FavoriteKey[],
  connId: string,
  db: number,
): FavoriteKey[] {
  return favorites.filter(f => !(f.connId === connId && f.db === db))
}

export function isFolderFavorited(
  folders: FavoriteFolder[],
  connId: string,
  db: number,
  path: string,
): boolean {
  return folders.some(f => f.connId === connId && f.db === db && f.path === path)
}

export function addFavoriteFolder(
  folders: FavoriteFolder[],
  connId: string,
  db: number,
  path: string,
): FavoriteFolder[] {
  if (!path || isFolderFavorited(folders, connId, db, path)) return folders
  return [...folders, { connId, db, path, favoritedAt: Date.now() }]
}

export function removeFavoriteFolder(
  folders: FavoriteFolder[],
  connId: string,
  db: number,
  path: string,
): FavoriteFolder[] {
  return folders.filter(f => !(f.connId === connId && f.db === db && f.path === path))
}

/** 清空指定连接下某一 db 的全部收藏目录 */
export function clearFavoriteFoldersForDb(
  folders: FavoriteFolder[],
  connId: string,
  db: number,
): FavoriteFolder[] {
  return folders.filter(f => !(f.connId === connId && f.db === db))
}
