import mitt from 'mitt'
import {sampleSize} from 'lodash'


// 常量
export const CONN_REFRESH = 'CONN_REFRESH'

// 全局事件总线: setup直接导入，app全局属性也添加
export const bus = mitt()

// 随机N个字符
const CHAR_ARRAY = [...'abcdefghigklmnopqrstuvwxyz0123456789']
export function randomString(n) {
    return sampleSize(CHAR_ARRAY, n).join('')
}

// 睡眠
export function sleep(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}