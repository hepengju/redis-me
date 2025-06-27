import {mockInfo, mockConnList, mockScan, mockGet} from './mock.ts'
import RedisKey from '../views/RedisKey.vue'
import RedisValue from '../views/tag/RedisValue.vue'

import {random} from 'lodash'

// 获取连接配置信息
function connList(): RedisProperties[] {
    return mockConnList
}

// 获取Redis基本信息
function info(id: string): string {
    return mockInfo
}

// 扫描键
function scan(id: string, match: string, count: number = 1000): RedisKey[] {
    return mockScan
}

// 获取值
function get(id: string, key: RedisKey): RedisValue {
    return mockGet
}

// 设置值
function set(id: string, redisSet: RedisSet): void {
    return
}

// 过期时间
function expire(id: string, key: RedisKey): number {
    return random(-1, 10000)
}