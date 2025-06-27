/**
 * Redis连接信息
 */
interface RedisProperties {
    id: string,
    name: string,

    host: string,
    port: number,
    username?: string,
    password?: string,
    cluster: boolean,
    readonly: boolean,
    order: number,

    sslOption?: SSLOptions

    // 其他辅助信息
    color: string
}

interface SSLOptions {
    key: string,
    cert: string,
    ca: string,
}

interface RedisKey {
    key: string,
    bytes: string,
}

interface RedisSet extends RedisKey {
    value: string,
    ttl: number
}

interface RedisHash extends RedisKey {
    hashKey: string,
    hashValue: string
}

interface RedisValue {
    type: string,
    value: object,
    rawValue: object,
    ttl: number,
}