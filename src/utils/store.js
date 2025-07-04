import {defineStore, setMapStoreSuffix } from 'pinia'

// 不要添加后缀，应用就使用全局的一个store状态
setMapStoreSuffix('')
const useStore = defineStore('store', {
  state: () => ({
    conn: null,
  }),
  getters: {},
  actions: {},
})

export default useStore
// import {computed, Reactive, reactive} from 'vue'
// import {connList, apiDbList, apiInfo, apiScan, apiGet} from './api.ts'
// import {sleep} from './util.js'
//
// // ~~~~~~~~~~~~~数据定义~~~~~~~~~~~~~
// // 全局共享的状态
// const store: Reactive<IStore> = reactive({
//     // 核心数据
//     // connList: [],          // 连接列表
//     conn: null,            // 当前连接
//     // info: '',              // 获取的Redis服务器信息
//     redisKeyList: [],      // 键集合
//     redisKey: null,        // 当前选中的key
//     redisValue: null,      // 点击键，获取到的redis值
//
//     // redis支持db0 ~ db15 16个数据库; 集群只支持db0，
//     dbList: [],            // db集合
//     db: null,              // 当前db
//
//     // 其他界面辅助
//     exact: false,          // 精确搜索
//     keyword: '',           // 查询关键字
//     readonly: false,       // 只读
//     activeTabName: 'info', // 激活Tab名称
//
//     // 加载中状态，以便显示loading
//     loading: {
//         // info: false,           // 获取RedisInfo
//         redisKeyList: false,   // 获取键列表
//         redisValue: false      // 获取键的值
//     },
// })
//
// // ~~~~~~~~~~~~~计算属性~~~~~~~~~~~~~
// export const colorStyle = computed(() => {
//     return {color: store.conn?.color}
// })
//
// export const filterKeys = computed(() =>
//     store.redisKeyList
//         .filter(redisKey => !store.keyword || redisKey.key.toLowerCase().indexOf(store.keyword.toLowerCase()) > -1)
// )
//
// // ~~~~~~~~~~~~~通用方法~~~~~~~~~~~~~
// /**
//  * 进入应用的主方法
//  */
// export function initMain(){
//     // TODO 应用进入选择连接
//     // initConnList()
//
//     // 获取数据库列表，并默认选择第一个
//     // initDbList()
//
//     // 获取服务器信息
//     //getInfo()
//
//     // 选择连接后，调用scan扫描
//     scanKey()
// }
//
// /**
//  * 重置为初始状态
//  */
// export function resetInit() {
//     // TODO
// }
//
// // export function initConnList() {
// //     store.connList = connList()
// //     store.conn = store.connList[0]
// // }
//
// export function initDbList() {
//     if (store.conn.cluster) {
//         const unique = { index: 0, label: 'DB0', name: 'DB0'}
//         store.db = unique
//         store.dbList = [unique]
//     } else {
//         store.dbList = apiDbList()
//         store.db = store.dbList[0]
//     }
// }
//
// export async function scanKey (){
//     store.loading.redisKeyList = true
//     store.redisKeyList = apiScan(store.conn?.id, store.keyword)
//     store.redisKey = null
//     await sleep(500)
//     store.loading.redisKeyList = false
// }
//
// /**
//  * 加载更多
//  */
// export async function scanMore() {
//     // TODO
// }
//
// /**
//  * 加载所有
//  */
// export async function scanAll() {
//     // TODO
// }
//
//
// export async function getKey(redisKey: RedisKey): RedisValue {
//     store.loading.redisKey = true
//     store.redisKey = redisKey
//     await sleep(500)
//     store.redisValue = apiGet(store.conn.id, redisKey)
//     store.loading.redisKey = false
// }
//
// // ~~~~~~~~~~~~~默认导出~~~~~~~~~~~~~
// export default store