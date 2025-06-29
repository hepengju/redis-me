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

interface RedisDB {
    index: number,
    label: string
    name: string,
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

// ~~~~~~~~全局数据类型
interface IStore {
    connList: RedisProperties[]
    conn: RedisProperties
    info: string,
    keys: RedisKey[],
    redisValue: RedisValue

    dbList: RedisDB[]
    db: RedisDB

    exact: boolean,
    keyword: string,
    readonly: boolean,
    activeTabName: string,

    loading: ILoading
}

interface ILoading {
    keys: boolean
}