/**
 * redis字符串信息转换为Map
 */
function toInfoMap(redisInfo: string): Map<string, string> {
    const infoMap = new Map<string, string>()
    redisInfo.split('\n')
        .filter(line => !line.startsWith('#'))
        .forEach(line => {
            const index = line.indexOf(';')
            if (index > -1) {
                const key = line.substring(0, index)
                const value = line.substring(index)
                infoMap.set(key, value)
            }
        })
    return infoMap
}

export function sleep(delay: number) {
    return new Promise(resolve => setTimeout(resolve, delay));
}