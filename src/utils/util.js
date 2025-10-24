import mitt from 'mitt'
import {sampleSize} from 'lodash'
import {useClipboard} from '@vueuse/core'
import {ElMessage, ElMessageBox} from 'element-plus'
import {invoke} from "@tauri-apps/api/core";

// 全局事件总线: setup直接导入，app全局属性也添加
export const bus = mitt()

// 常量
export const DELETE_KEY = 'DELETE_KEY'
export const REFRESH_KEY = 'REFRESH_KEY'
export const GO_CLIENT = 'GO_CLIENT'
export const CONN_REFRESH = 'CONN_REFRESH'

// 预设颜色
export const PREDEFINE_COLORS = [
    '#409eff',  // primary
    '#67c23a',  // success
    '#e6a23c',  // warning
    '#f56c6c',  // danger
    '#909399',  // info
]

// 打印日志
export async function invoke_then(command, params, alert = true) {
    try {
        const data = await invoke(command, params)
        console.log(`命令: ${command}, 参数: `, params, '结果: ', data)
        //return {code: 200, data}
        return data
    } catch (error) {
        if (alert) {
            ElMessageBox.alert(error, `错误: ${command}`, {type: 'error'})
        }
        console.log(`命令: ${command}, 参数:`, params, `, 错误: ${error}`)
        // return {code: 500, error}
        throw error;
    }
}

// 复制文本
export function copy(text) {
    useClipboard({legacy: true}).copy(text)
    ElMessage({message: '复制成功', type: 'success'})
}

// 随机N个字符
const CHAR_ARRAY = [...'abcdefghigklmnopqrstuvwxyz0123456789']
export function randomString(n) {
    return sampleSize(CHAR_ARRAY, n).join('')
}

// 睡眠
export function sleep(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

// 人类可读的大小
const humanUnits = [
    {threshold: 1        , symbol: 'B'},
    {threshold: 1024     , symbol: 'K'},
    {threshold: 1024 ** 2, symbol: 'M'},
    {threshold: 1024 ** 3, symbol: 'G'},
    {threshold: 1024 ** 4, symbol: 'T'},
]
export function humanSize(size, zeroShow = '0B', fractionDigits = 2) {
    if (!size) return zeroShow || ''

    // 从大到小查找合适的单位
    for (let i = humanUnits.length - 1; i >= 0; i--) {
        if (size >= humanUnits[i].threshold) {
            const value = size / humanUnits[i].threshold;
            return value.toFixed(fractionDigits) + humanUnits[i].symbol;
        }
    }

    return size + 'B'; // 小于1KB的情况
}

// w天 xx:yy:zz 的格式
export function humanSeconds(seconds) {
    const days = Math.floor(seconds / (3600 * 24)) // 计算天数
    seconds %= (3600 * 24) // 计算剩余秒数

    const hours = Math.floor(seconds / 3600)
    seconds %= 3600

    const minutes = Math.floor(seconds / 60)
    seconds %= 60

    // 确保小时、分钟和秒数是两位数显示
    const formattedHours   = String(hours).padStart(2, '0')
    const formattedMinutes = String(minutes).padStart(2, '0')
    const formattedSeconds = String(seconds).padStart(2, '0')

    // 组合结果
    let result = `${formattedHours}:${formattedMinutes}:${formattedSeconds}`
    if (days > 0) {
        result = `${days}天 ${result}`
    }
    return result
}

// 表格根据属性过滤
export function filterHandler(value, row, column){
    const property = column.property;
    return row[property] === value;
}

// 删除键
export function commonDeleteKey(id, redisKey) {
    ElMessageBox.confirm(
      `确定删除键【${redisKey.key}】吗？`,
      '提示',
      {type: 'warning'},
    ).then(async () => {
        await invoke_then('del', {id, key: redisKey})
        bus.emit(DELETE_KEY, redisKey)
        ElMessage.success('删除成功')
    }).catch(() => {})
}
