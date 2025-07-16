import mitt from 'mitt'
import {sampleSize} from 'lodash'
import {useClipboard} from '@vueuse/core'
import {ElMessage} from 'element-plus'

// 全局事件总线: setup直接导入，app全局属性也添加
export const bus = mitt()

// 常量
export const CONN_REFRESH = 'CONN_REFRESH'

// 预设颜色
export const PREDEFINE_COLORS = [
    '#409eff',  // primary
    '#67c23a',  // success
    '#e6a23c',  // warning
    '#f56c6c',  // danger
    '#909399',  // info
]

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