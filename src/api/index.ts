import {mockInfo, mockConnList, mockScan, mockGet} from './mock.ts'
import RedisKey from '../views/RedisKey.vue'
import RedisValue from '../views/tag/RedisValue.vue'

import {random} from 'lodash'

// 获取连接配置信息
export function connList(): RedisProperties[] {
    return mockConnList
}

// 获取Redis基本信息
export function info(id: string): string {
    return mockInfo
}

// 扫描键
export function scan(id: string, match: string, count: number = 1000): RedisKey[] {
    return mockScan
}

// 获取值
export function get(id: string, key: RedisKey): RedisValue {
    return mockGet
}

// 设置值
export function set(id: string, redisSet: RedisSet): void {
    return
}

// 过期时间
export function expire(id: string, key: RedisKey): number {
    return random(-1, 10000)
}