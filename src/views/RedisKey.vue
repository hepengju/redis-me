<script setup>
import ListKey from './key/ListKey.vue'
import TreeKey from './key/TreeKey.vue'
import {computed, ref} from 'vue'
import {bus, commonDeleteKey, CONN_REFRESH, copy, DELETE_KEY, REFRESH_KEY} from "@/utils/util.js"
import {ElMessage} from 'element-plus'
import FieldAdd from '@/views/ext/FieldAdd.vue'
import KeyBatchDel from './key/KeyBatchDel.vue'
import KeyMemory from './key/KeyMemory.vue'
import {invoke_then} from "@/utils/util.js";
import SaveConn from '@/views/ext/SaveConn.vue'
import Setting from '@/views/ext/Setting.vue'

// 共享数据
const share = inject('share')
const canEdit = computed(() => true)

// 监听刷新事件
async function refresh() {
  initReset()
  await scanKey()
}

// 刷新时条件初始化
function initReset(){
  keyType.value = {value: 'ALL', type: 'info'}
  exact.value = false
  keyword.value = ''
  keyList.value = []
  share.redisKey = null
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
const exact      = ref(false)   // 是否精确查询
const keyword    = ref('')      // 关键字
const loading    = ref(false)   // 扫描键过程中loading
const loadFolder = ref(false)   // 文件夹的右键：仅加载该目录的特殊处理
const match = computed(() => {
  // 仅扫描该目录，直接返回
  if (loadFolder.value) return keyword.value + '*'

  // 精确查询直接返回；空白则返回*；否则判断前后是否需要添加*
  if (exact.value) return keyword.value
  if (!keyword.value) return '*'
  if (keyword.value.startsWith('*') && keyword.value.endsWith("*")) return keyword.value
  if (keyword.value.startsWith('*')) return keyword.value + '*'
  if (keyword.value.endsWith('*')) return '*' + keyword.value
  return '*' + keyword.value + '*'
})
const cursor = ref(null)     // 扫描的游标

// 扫描键
const keyList  = ref([])    // 键列表
const filterKeyList = computed(() => {
  const key = keyword.value.toLowerCase()
  return keyList.value.filter(k => k.key.toLowerCase().indexOf(key) > -1)
})

async function scanKey(useCursor = false, loadAll = false) {
  loading.value = true
  try {
    if (!useCursor) {
      cursor.value = null
      keyList.value = []
    }

    const params = {
      match: match.value,
      count: 1000,
      type: keyType.value?.value === 'ALL' ? '' : keyType.value.value,
      loadAll: loadAll,
      cursor: cursor.value,
    }
    const data = await invoke_then('scan', {id: share.conn.id, param: params})
    cursor.value = data.cursor
    keyList.value.push(...data.keyList)
    // 排序下, 虽然后端排序更快，但多次扫描的结果还是需要前端排序
    keyList.value.sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()))
  } finally {
    loading.value = false
  }
}

onMounted(() => bus.on(DELETE_KEY, deleteKey))
onMounted(() => bus.on(CONN_REFRESH, refresh))
onUnmounted(() => bus.off(DELETE_KEY, deleteKey))
onUnmounted(() => bus.off(CONN_REFRESH, refresh))
function deleteKey(redisKey) {
  keyList.value = keyList.value.filter(rk => rk.bytes !== redisKey.bytes)
  share.redisKey = null
}

// 键显示类型
const keyShowTypeList = ref(['tree', 'list'])
const keyShowType = ref('tree')

// 选中键
function chooseKey(redisKey) {
  keyPrefix.value = ''
  share.redisKey = redisKey
  share.tabName = 'value'
  bus.emit(REFRESH_KEY)
}

// 选中文件夹
const keyPrefix = ref('')
function chooseFolder(folder) {
  keyPrefix.value = folder
}

// 键右键
function contextKey(command, redisKey) {
  if (command == 'refreshKey') {
    chooseKey(redisKey)
  } else if (command == 'copyKey') {
    copy(redisKey.key)
  } else if (command == 'deleteKey') {
    commonDeleteKey(share.conn.id, redisKey)
  } else {
    ElMessage.warning(`TODO: 键右键 ${command}`)
  }
}

// 文件夹右键
function contextFolder(command, folder){
  if (command === 'addKey') {
    keyPrefix.value = folder
    addKey()
  } else if (command === 'copyFolder') {
    copy(folder)
  } else if (command === 'loadFolder') {
    loadFolder.value = true
    try {
      exact.value = false
      keyword.value = folder
      scanKey(false, false)
    } finally {
      loadFolder.value = false
    }
  } else if (command === 'memoryUsage') {
    keyMemory(folder)
  } else if (command === 'deleteFolder') {
    deleteFolder(folder)
  } else {
    ElMessage.warning(`TODO: 文件夹右键 ${command}`)
  }
}

// 新增模拟数据
async function mockData() {
  await invoke_then('mock_data', {id: share.conn.id, count: 10})
  ElMessage.success("模拟数据插入完成")
  await scanKey(false, false)
}

// 重置连接池
async function clearPool() {
  ElMessage.info("TODO")
}

// 字段新增
const fieldAddRef = useTemplateRef('fieldAddRef')

function addKey() {
  const prefix = keyShowType.value == 'list' ? '' : (keyPrefix.value ? keyPrefix.value + ':' : '')
  fieldAddRef.value?.open({mode: 'key', key: prefix})
}

function addKeyOk(redisKey) {
  keyList.value.unshift(redisKey)
  chooseKey(redisKey)
}

// 批量删除键
const keyBatchDelRef = useTemplateRef('keyBatchDelRef')
function deleteFolder(folder) {
  keyBatchDelRef.value?.open({match: folder + ':*', keyList: []})
}

// 内存分析
const keyMemoryRef = useTemplateRef('keyMemoryRef')
function keyMemory(folder) {
  keyMemoryRef.value?.open({match: folder + ':*'})
}
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// 切换连接
function changeConn() {
  if (share.conn) {
    bus.emit(CONN_REFRESH)
  }
}

// 弹出框
const dialog = reactive({
  conn: false,         // 编辑连接
  setting: false,      // 基础设置
})

// 处理额外命令
const connRef = useTemplateRef('conn')
const settingRef = useTemplateRef('setting')
async function handleCommand(command) {
  if (command === 'addConn') {
    dialog.conn = true
    nextTick(() => connRef.value.open('add'))
  } else if (command === 'editConn') {
    dialog.conn = true
    nextTick(() => connRef.value.open('edit', share.conn))
  } else if (command === 'deleteConn') {
    // TODO
    //global.deleteConn(global.conn, true)
  } else if (command === 'refreshConn') {
    await invoke_then('disconnect', {id: share.conn.id})
    bus.emit(CONN_REFRESH)
  } else if (command === 'setting') {
    dialog.setting = true
    nextTick(() => settingRef.value.open())
  } else if ('refreshConn' === command) {
    refresh()
  } else if ('clearPool' === command) {
    clearPool()
  } else if ('mockData' === command) {
    mockData()
  }
}

// 保存连接后触发刷新
function saveConn(_, mode) {
  if (mode === 'edit') {
    bus.emit(CONN_REFRESH)
  }
}
</script>

<template>
  <div class="redis-key">
    <div class="key-header">
      <el-select v-model="share.conn" placeholder="请选择连接" class="conn" clearable
                 filterable :disabled="share.connList.length == 0" value-key="id" @change="changeConn">
        <el-option v-for="item in share.connList" :label="item.name" :value="item" :key="item.id">
          <div :style="{color: item?.color}">{{ item.name }}</div>
        </el-option>

        <template #label="{ value }">
          <div :style="{color: share.color}">{{ value.name }}</div>
        </template>
        <template #prefix>
          <me-icon icon="me-icon-redis"/>
        </template>
      </el-select>

      <el-dropdown placement="bottom-end" @command="handleCommand" style="margin-left: 10px">
        <el-button type="success" icon="el-icon-operation"/>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="refreshConn" :disabled="!share.conn"><me-icon name="刷新连接" icon="el-icon-refresh"/></el-dropdown-item>
            <el-dropdown-item command="mockData"    :disabled="!share.conn"><me-icon name="模拟数据"   icon="el-icon-coffee-cup"/></el-dropdown-item>
            <el-dropdown-item command="addConn"><me-icon name="新增连接" icon="el-icon-plus"/></el-dropdown-item>
            <el-dropdown-item command="editConn" :disabled="!share.conn"><me-icon name="编辑连接" icon="el-icon-edit"/></el-dropdown-item>
            <el-dropdown-item command="deleteConn" :disabled="!share.conn"><me-icon name="删除连接" icon="el-icon-delete"/></el-dropdown-item>
            <el-dropdown-item command="appLog" divided><me-icon name="命令日志" icon="el-icon-stopwatch"/></el-dropdown-item>
            <el-dropdown-item command="setting"><me-icon name="基础设置" icon="el-icon-setting"/></el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <SaveConn ref="conn" v-if="dialog.conn" @success="saveConn" @closed="dialog.conn = false"/>

      <!--为了方便主题语言等初始化，组件一直存在；为了方便v-model直接绑定弹框是否显示直接传入dialog-->
      <Setting :dialog="dialog"/>
    </div>

    <div class="key-main" v-if="share.conn">
      <el-input class="key-search" v-model="keyword" placeholder="Enter 键进行搜索" @keyup.enter="scanKey(false, false)" clearable>
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
            <me-button info="刷新键" @click="scanKey(false, false)" icon="el-icon-search"></me-button>
            <me-button info="新增键" @click="addKey" style="border-color: var(--el-button-border-color)" v-if="canEdit"
                       icon="el-icon-plus"></me-button>
          </el-button-group>
        </template>
      </el-input>

      <div class="key-list" v-loading="loading">
        <ListKey v-if="keyShowType === 'list'"
                 :filter-key-list="filterKeyList"
                 :redis-key="share.redisKey"
                 :color="share.color"
                 @chooseKey="chooseKey"
                 @contextKey="contextKey"/>
        <TreeKey v-else
                 :filter-key-list="filterKeyList"
                 :redis-key="share.redisKey"
                 :color="share.color"
                 @chooseKey="chooseKey"
                 @contextKey="contextKey"
                 @chooseFolder="chooseFolder"
                 @contextFolder="contextFolder"/>
      </div>

      <div class="key-footer">
        <div class="me-flex" style="align-items: center">
          <el-segmented v-model="keyShowType" :options="keyShowTypeList">
            <template #default="scope">
              <me-icon name="键平铺展示" icon="me-icon-list" hint placement="top" v-if="scope.item === 'list'"/>
              <me-icon name="键树形展示" icon="me-icon-tree" hint placement="top" v-else/>
            </template>
          </el-segmented>
        </div>

        <el-text class="tip" size="large" type="primary">{{ filterKeyList.length }} / {{ keyList.length }}</el-text>

        <div class="btn-rb">
          <template v-if="canEdit">
            <me-icon v-if="!(cursor?.finished)" name="加载更多"       icon="me-icon-load-more" hint placement="top" class="icon-btn" @click="scanKey(true, false)"/>
            <me-icon v-if="!(cursor?.finished)" name="加载剩余所有键" icon="me-icon-load-all"  hint placement="top" class="icon-btn" @click="scanKey(true, true)"/>
          </template>
        </div>
      </div>
    </div>

    <!-- 字段新增、批量删除键、目录内存分析 -->
    <FieldAdd    ref="fieldAddRef"    @success="addKeyOk"/>
    <KeyBatchDel ref="keyBatchDelRef" @success="scanKey(false, false)"/>
    <KeyMemory   ref="keyMemoryRef" />
  </div>
</template>

<style scoped lang="scss">
.redis-key {
  //border: 2px solid red;
  height: 100%;
  display: flex;
  flex-direction: column;

  .key-header {
    display: flex;
  }

  .key-main {
    //border: 2px solid red;
    flex-grow: 1;

    .empty {
      height: 100%;
      border: 1px solid var(--el-border-color);
    }

    .key-search {
      :deep(.el-tag) {
        border-color: var(--el-border-color);
      }

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
      overflow: hidden; // 隐藏水平滚动条，仅显示竖直滚动条

      // 简单键列表和文件夹列表共享的属性
      //font-size: 12px;
      //color: var(--el-color-primary);

      :deep(.el-link) {
        font-size: 12px;
      }
    }

    .key-footer {
      border: 1px solid var(--el-border-color);
      border-top: none;

      //margin-top: 5px;
      //padding-bottom: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;

      :deep(.el-select__wrapper) {
        min-height: 0;
        height: 28px;
        padding: 4px 4px 4px 10px;
      }

      .tip {
        white-space: nowrap;
      }

      .btn-rb {
        width:50px;
        font-size: 22px;
        display: flex;
        justify-content: space-between;
        color: var(--el-color-info);
        cursor: pointer;
        margin-right: 5px;
      }
    }
  }

   /* 选中的键 */
  :deep(.choose-key) {
    background-color: var(--el-color-info-light-8);
  }
}
</style>
