import {sampleSize} from 'lodash'

/**
 * 随机N个字符
 */
const CHAR_ARRAY = [...'abcdefghigklmnopqrstuvwxyz0123456789']
export function randomString(n: number): string {
    return sampleSize(CHAR_ARRAY, n).join('')
}

export function sleep(delay: number) {
    return new Promise(resolve => setTimeout(resolve, delay));
}