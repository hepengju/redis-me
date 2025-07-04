import {sampleSize} from 'lodash'

/**
 * 随机N个字符
 */
const CHAR_ARRAY = [...'abcdefghigklmnopqrstuvwxyz0123456789']
export function randomString(n) {
    return sampleSize(CHAR_ARRAY, n).join('')
}

/**
 * 睡眠
 */
export function sleep(delay) {
    return new Promise(resolve => setTimeout(resolve, delay));
}