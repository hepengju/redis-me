import {mockConnList, mockDbList, mockGet, mockInfo, mockScan, mockSlowlog} from './api-mock.js'
import {random, sample} from 'lodash'

// 获取连接配置信息
export function apiConnList() {
    return mockConnList
}

// 获取Redis基本信息
export function apiInfo(id) {
    return mockInfo
}

// db集合
export function apiDbList(id) {
    return mockDbList
}

// 扫描键
export function apiScan(id, match = '', count = 1000, type = '', db = '') {
    return mockScan.slice(0, random(1000))
}

// 获取值
export function apiGet(id, key) {
    return sample(mockGet)
}

// 设置值
export function apiSet(id, redisSet) {
    return
}

// 过期时间
export function apiExpire(id, key) {
    return random(-1, 10000)
}

// 慢日志
export function apiSlowlog(id, count) {
    return mockSlowlog
}