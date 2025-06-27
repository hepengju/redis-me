import {computed, reactive} from 'vue'

// 全局共享的状态
const store = reactive({
    connList: [],          // 连接列表
    conn: {},              // 当前连接
    info: '',              // 获取的Redis服务器信息
    keys: [],              // 键集合
    redisValue: null,      // 点击键，获取到的redis值

    // 其他界面辅助
    exact: false,          // 精确搜索
    keyword: '',           // 查询关键字
    activeTabName: 'info', // 激活Tab名称
})

export const colorStyle = computed(() => {
    return {color: store.conn?.color}
})
export default store