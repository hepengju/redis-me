import {computed, Reactive, reactive} from 'vue'
import {connList, dbList, scan} from '../api'
import {sleep} from './util.js'

// ~~~~~~~~~~~~~数据定义~~~~~~~~~~~~~
// 全局共享的状态
const store: Reactive<IStore> = reactive({
    // 核心数据
    connList: [],          // 连接列表
    conn: null,            // 当前连接
    info: '',              // 获取的Redis服务器信息
    keys: [],              // 键集合
    redisValue: null,      // 点击键，获取到的redis值

    // redis支持db0 ~ db15 16个数据库; 集群只支持db0，
    dbList: [],            // db集合
    dbIndex: null,         // 当前db

    // 其他界面辅助
    exact: false,          // 精确搜索
    keyword: '',           // 查询关键字
    readonly: false,       // 只读
    activeTabName: 'info', // 激活Tab名称
    loading: {
        keys: false
    }
})

// ~~~~~~~~~~~~~计算属性~~~~~~~~~~~~~
export const colorStyle = computed(() => {
    return {color: store.conn?.color}
})

export const filterKeys = computed(() =>
    store.keys
        .filter(redisKey => !store.keyword || redisKey.key.toLowerCase().indexOf(store.keyword.toLowerCase()) > -1)
)

// ~~~~~~~~~~~~~通用方法~~~~~~~~~~~~~
export function initConnList() {
    store.connList = connList()
    store.conn = store.connList[0]
}

export function initDbList() {
    if (store.conn.cluster) {
        const unique = { index: 0, label: 'DB0', name: 'DB0'}
        store.db = unique
        store.dbList = [unique]
    } else {
        store.dbList = dbList()
        store.db = store.dbList[0]
    }
}
export async function scanKey (){
    store.loading.keys = true
    store.keys = scan(store.conn.id, store.keyword)
    await sleep(500)
    store.loading.keys = false
}


// ~~~~~~~~~~~~~默认导出~~~~~~~~~~~~~
export default store