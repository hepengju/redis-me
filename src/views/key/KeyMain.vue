<script setup>
import MeIcon from '@/components/MeIcon.vue'
import {apiDbList, apiScan} from '@/utils/api.js'
import useGlobalStore from '@/utils/store.js'
import {bus, CONN_REFRESH, sleep} from '@/utils/util.js'
import {computed, reactive} from 'vue'
import ListKey from './detail/ListKey.vue'
import TreeKey from './detail/TreeKey.vue'

// 全局对象
const global = useGlobalStore()

// 监听刷新事件
bus.on(CONN_REFRESH, refresh)
async function refresh() {
  initReset()
  initDbList()
  await scanKey()
}

// 刷新时条件初始化
function initReset(){
  keyType.value = {value: 'ALL', type: 'info'}
  exact.value = false
  keyword.value = ''
  keyList.value = []
}

// 键类型
const keyTypeList = [
    { value: 'ALL'   , type: 'info'},
    { value: 'STRING', type: 'primary'},
    { value: 'HASH'  , type: 'success'},
    { value: 'LIST'  , type: 'info'},
    { value: 'SET'   , type: 'danger'},
    { value: 'ZSET'  , type: 'info'},
    { value: 'STREAM', type: 'warning'},
    { value: 'JSON'  , type: 'primary'},
]
const keyType = ref({value: 'ALL', type: 'info'})    // 键类型
function chooseKeyType(keyTypeSelected) {
  keyType.value = keyTypeSelected
}

// 查询框: SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]
const exact   = ref(false) // 是否精确查询
const keyword = ref('')    // 关键字
const keyList = ref([])    // 键列表
const loading = ref(false) // 扫描健过程中loading

// 扫描键
async function scanKey(){
  loading.value = true
  keyList.value = apiScan(global.conn?.id)
  await sleep(500)
  loading.value = false
}
const filterKeyList = computed(() => {
  const lowerKeyword = keyword.value.toLowerCase()
  return keyList.value.filter(redisKey => redisKey.key.toLowerCase().indexOf(lowerKeyword) > -1)
})

// 键显示类型
const keyShowTypeList = ref(['list', 'tree'])
const keyShowType = ref('list')

// DB列表
const dbList  = ref([])    // db列表
const db      = ref({})    // 选择的db
function chooseDb(dbSelected) {
  db.value = dbSelected
}
function initDbList(){
  dbList.value = apiDbList(global.conn?.id)
  db.value = dbList.value[0]
}

// 弹框
const dialog = reactive({
  add: false,    // 新增键
  load: false,   // 导入键
  delete: false, // 删除健
})

// 新增键
function addKey(){}

// 扫描更多
function scanMore() {
}

// 扫描所有
function scanAll() {
}

function handleCommand() {
}
</script>

<template>
  <div class="key-main">
    <template v-if="global.conn">
      <el-input class="key-search" v-model="keyword" placeholder="Enter 键进行搜索" @keyup.enter="scanKey" clearable>
        <template #prepend>
          <el-dropdown placement="bottom-start" @command="chooseKeyType">
            <el-tag :type="keyType.type" effect="plain" style="width: 32px; height: 32px">{{keyType.value.slice(0, 1)}}
            </el-tag>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="item in keyTypeList" :command="item">
                  <el-tag :type="item.type" :effect="item.value === keyType.value ? 'dark' : 'plain'">
                    {{ item.value.slice(0, 1) }}
                  </el-tag>
                  <el-text style="margin-left: 6px">{{ item.value }}</el-text>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-tooltip content="精确搜素">
            <el-checkbox size="small" v-model="exact" style="margin-left: 10px"/>
          </el-tooltip>
        </template>
        <template #append>
          <el-button-group>
            <me-button info="刷新键" @click="scanKey" icon="el-icon-search"></me-button>
            <me-button info="新增键" @click="addKey" style="border-color: var(--el-button-border-color)"
                       icon="el-icon-plus"></me-button>
          </el-button-group>
        </template>
      </el-input>

      <div class="key-list" v-loading="loading">
        <ListKey :filter-key-list="filterKeyList" v-if="keyShowType === 'list'"/>
        <TreeKey :filter-key-list="filterKeyList" v-else/>
      </div>

      <div class="key-footer">
        <div>
          <el-segmented v-model="keyShowType" :options="keyShowTypeList">
            <template #default="scope">
              <me-icon name="键平铺展示" icon="me-icon-list" hint placement="top" v-if="scope.item === 'list'"/>
              <me-icon name="键树形展示" icon="me-icon-tree" hint placement="top" v-else/>
            </template>
          </el-segmented>
          <el-select v-model="db" filterable value-key="index" style="width: 66px"
                     @change="scanKey" :disabled="global.conn.cluster" placeholder="--" suffix-icon="">
            <el-option v-for="item in dbList"
                       :label="item.label"
                       :value="item"
                       :key="item.index"/>
          </el-select>
        </div>

        <el-text class="tip" size="large" type="primary">{{ filterKeyList.length }} / {{ keyList.length }}</el-text>

        <div class="btns">
          <me-icon name="加载更多" icon="me-icon-load-more" hint placement="top" @click="scanMore"/>
          <me-icon name="加载剩余所有键" icon="me-icon-load-all" hint placement="top" @click="scanAll"/>
          <el-dropdown placement="top-end" @command="handleCommand">
            <me-icon icon="el-icon-more-filled"></me-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="import">
                  <me-icon name="导入数据" icon="el-icon-download"/>
                </el-dropdown-item>
                <el-dropdown-item command="batch" divided>
                  <me-icon name="批量删除" icon="el-icon-warning"/>
                </el-dropdown-item>
                <el-dropdown-item command="flush">
                  <me-icon name="清空数据" icon="me-icon-flush"/>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </template>

    <div class="fallback" v-else>
      <el-text size="large">键显示区</el-text>
    </div>
  </div>
</template>

<style scoped lang="scss">
.key-main {
  //border: 2px solid red;
  flex-grow: 1;

  .fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    border: 1px solid var(--el-border-color);
  }

  .key-search {
    // 复选框显示尽量为方形
    :deep(.el-input-group__prepend) {
      padding: 0 10px 0 0;
    }

    // 查询和新增key不收缩，避免调整侧边栏宽度时变为两行
    :deep(.el-input-group__append) {
      flex-shrink: 0;
    }
  }

  // 滚动条显示在键的区域，而不是整个左侧区域
  // 原理：需要指定下高度。此处指定为0，弹性扩展
  height: 0;

  margin-top: 10px;
  display: flex;
  flex-direction: column;

  .key-list {
    flex-grow: 1;
    border: 1px solid var(--el-border-color);
    border-top: none;
    border-bottom: none;

    height: 100%;
    padding: 5px;
    overflow: hidden auto; // 隐藏水平滚动条，仅显示竖直滚动条

    // 简单键列表和文件夹列表共享的属性
    //font-size: 12px;
    //color: var(--el-color-primary);

    :deep(.el-link) {
      font-size: 12px;
    }
  }

  .key-footer {
    margin-top: 5px;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .tip {
      white-space: nowrap;
    }

    .btns {
      width: 70px;
      font-size: 22px;
      display: flex;
      justify-content: space-between;
      color: var(--el-color-info);
      cursor: pointer;
    }

    & .icon-main:hover {
      color: var(--el-color-primary);
    }
  }
}
</style>