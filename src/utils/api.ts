import {mockConnList, mockDbList, mockGet, mockInfo, mockScan} from './api-mock.ts'
import {random} from 'lodash'

// 获取连接配置信息
export function apiConnList(): RedisProperties[] {
    return mockConnList
}

// 获取Redis基本信息
export function apiInfo(id: string): string {
    return mockInfo
}

// db集合
export function apiDbList(id: string): RedisDB[] {
    return mockDbList
}

// 扫描键
export function apiScan(id: string, match: string, count: number = 1000): RedisKey[] {
    return mockScan.slice(0, random(1000))
}

// 获取值
export function apiGet(id: string, key: RedisKey): RedisValue {
    return mockGet
}

// 设置值
export function apiSet(id: string, redisSet: RedisSet): void {
    return
}

// 过期时间
export function apiExpire(id: string, key: RedisKey): number {
    return random(-1, 10000)
}