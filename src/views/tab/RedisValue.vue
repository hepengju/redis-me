<script setup>
import {capitalize} from 'lodash'
import {bus, copy, KEY_DELETE, humanSize, KEY_REFRESH, commonDeleteKey} from '@/utils/util.js'
import {ElMessage} from 'element-plus'
import FieldAdd from '../ext/FieldAdd.vue'
import FieldSet from '../ext/FieldSet.vue'
import {invoke_then} from "@/utils/util.js";

// 刷新键
onMounted(() => bus.on(KEY_REFRESH, refreshKey))
onUnmounted(() => bus.off(KEY_REFRESH, refreshKey))

// 共享数据
const share = inject('share')
const canEdit = computed(() => true)
const canSave = computed(() => stringType.value && canEdit)

// 值的显示方式
const viewTypeList = ['json', 'table']
const viewType = ref('json')
const hashKey = ref('')
const isPretty = ref(true)
const withHashKey = ref(false)
const tableKeyword = ref('')
const redisValue = ref(null)
const loading = ref(false)

// 计算属性
const hashType = computed(() => 'hash' === redisValue.value?.type)
const stringType = computed(() => 'string' === redisValue.value?.type)
const stringTypeOrWithHashKey = computed(() => 'string' === redisValue.value?.type || withHashKey.value)
const showValue = computed(() => {
  const obj = redisValue.value?.value
  if (obj === null || obj === undefined) return ''

  if (isPretty.value) {
    if (stringTypeOrWithHashKey.value) {
      const str = obj.toString()
      try {
        return str.startsWith('{') || str.startsWith('[') ? JSON.stringify(JSON.parse(str), null, 2) : str
      } catch (e) {
        return str
      }
    } else {
      return JSON.stringify(obj, null, 2)
    }
  } else {
    return 'hash' === redisValue.value?.type && !withHashKey.value || 'zset' === redisValue.value?.type // zset包含分数
      ? JSON.stringify(obj) : obj.toString()
  }
})

const showSize = computed(() => {
  const textEncoder = new TextEncoder();
  const length = textEncoder.encode(showValue.value).length
  return humanSize(length)
})

// 表格数据
const dataList = computed(() => {
  const rv = redisValue.value
  if (rv === null || rv === undefined || rv.value === null || rv.value === undefined) return []

  let data = []

  if (rv.type === 'hash') {
    Object.entries(rv.value)
      .forEach(([key, value]) => data.push({key, value}))
  } else if (rv.type === 'list' || rv.type === 'set') {
    rv.value.forEach(value => data.push({value}))
  } else if (rv.type === 'zset') {
    rv.value.forEach(value => data.push(value)) // 返回的直接是[{score: '', value: ''}]
  }
  return data
})

const filterDataList = computed(() => {
  const key = tableKeyword.value.toLowerCase()
  return dataList.value.filter(row => !key
    || row.key?.toLowerCase().indexOf(key) > -1
    || row.value?.toLowerCase().indexOf(key) > -1
    || row.score?.toString().toLowerCase().indexOf(key) > -1,
  )
})

// 监听属性
watchEffect(() => {
  if (stringTypeOrWithHashKey.value) {
    viewType.value = 'json'
  }
})

// TTL设置
async function setTTL(){
  const seconds = redisValue.value.ttl
  if (seconds <=0 & seconds != -1) {
    ElMessage.success("TTL必须为正整数（秒）或 -1（永久） ")
    return
  }

  await invoke_then('ttl', {id: share.conn.id, ttl: seconds, key: share.redisKey})
  ElMessage.success("设置TTL成功")
}

function resetParam(){
  tableKeyword.value = ''
  hashKey.value = ''
  withHashKey.value = false
}
async function refreshKey(reset = true) {
  fieldSetInit() // 关闭字段编辑

  if (reset) {
    resetParam()
  }

  loading.value = true
  try {
    const data = await invoke_then('get', {id: share.conn.id, key: share.redisKey, hashKey: hashKey.value})
    redisValue.value = data
    if (hashKey.value) {
      withHashKey.value = true
    } else {
      withHashKey.value = false
    }
  } finally {
    loading.value = false
  }
}

// 删除键
onMounted(() => bus.on(KEY_DELETE, deleteKey))
onUnmounted(() => bus.off(KEY_DELETE, deleteKey))

function deleteKey() {
  redisValue.value = null
}

function delKey() {
  commonDeleteKey(share.conn.id, share.redisKey)
}

// 保存值
async function setValue() {
  const params = {
    key: share.redisKey,
    value: redisValue.value.newValue || redisValue.value.value,
    ttl: redisValue.value.ttl
  }
  await invoke_then('set', {id: share.conn.id, ...params});
  ElMessage.success('保存成功')
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// 字段新增
const fieldAddRef = useTemplateRef('fieldAddRef')
function fieldAdd(){
  fieldAddRef.value?.open({
    mode: 'field',
    type: redisValue.value.type,
    ...share.redisKey,
  })
}

// 字段编辑
const fieldSetIndex = ref(-1)
const fieldSetRef = useTemplateRef('fieldSetRef')
function fieldSetInit() {
  fieldSetIndex.value = -1
  fieldSetRef.value?.close()
}
function fieldSet(row, index) {
  fieldSetIndex.value = index
  const params = {
    fieldKey: row.key || '',
    fieldValue: row.value,
    fieldScore: row.score || 0,
    srcFieldValue: row.value,
    type: redisValue.value.type,
    key: share.redisKey,
  }
  if (redisValue.value.type === 'list') {
    // 此处不要直接取索引，而是重新去计算下（因为表格可能被关键字过滤过）
    params.fieldIndex = redisValue.value.value.indexOf(row.value)
  } else {
    params.fieldIndex = -1
  }
  fieldSetRef.value.open(params)
}

function rowClassName({row, rowIndex}){
  return `table-row-index-${rowIndex}`; // 给每行加一个带有索引的class
}

function rowClick(row, column, event) {
  // 编辑字段值没有开启时，忽略行点击事件
  if (fieldSetIndex.value === -1) return

  // 从点击事件的当前元素（即 <tr>）获取 class
  const trElement = event.currentTarget;
  const classList = trElement.classList;
  for (let className of classList) {
    if (className.startsWith('table-row-index-')) {
      const rowIndex = parseInt(className.split('-')[3]); // 提取索引数字
      fieldSet(row, rowIndex)
      break;
    }
  }
}

// 字段删除
async function fieldDel(row) {
  const param = {fieldKey: row.key, fieldValue: row.value , key: share.redisKey}
  if (redisValue.value.type === 'list') {
    param.fieldIndex = redisValue.value.value.indexOf(row.value)
  } else {
    param.fieldIndex = -1  // 其他类型使用不到，但接口需传递
  }
  await invoke_then('field_del',{id: share.conn.id, param});
  ElMessage.success('删除成功')
  await refreshKey()
}
</script>

<template>
  <div class="redis-value" v-loading="loading">
    <template v-if="share.redisKey && redisValue">
      <div class="key">
        <el-input type="text" v-model="share.redisKey.key" readonly style="flex: 1">
          <template #prepend>
            {{capitalize(redisValue.type)}}
          </template>
          <template #append>
            <me-button info="复制" icon="el-icon-document-copy" @click="copy(share.redisKey.key)" placement="top"/>
          </template>
        </el-input>

        <el-input type="text" placeholder="可选输入" clearable style="width: 200px; margin-left: 10px"
                  v-model="hashKey" v-if="redisValue.type == 'hash'"
                  @keyup.enter="refreshKey(false)">
          <template #prepend>Hash键</template>
        </el-input>

        <div class="me-flex">
          <!-- 宽度170可以完全显示1天：86400秒 -->
          <el-input v-model.number="redisValue.ttl" style="width: 170px; margin: 0 10px;">
            <template #prepend>TTL</template>
            <template #append v-if="canEdit">
              <me-button info="点击修改键的过期时间（单位为秒，-1代表永久）"
                         icon="el-icon-select" @click="setTTL"
                         :disabled="!share.redisKey.key" placement="top-end"/>
            </template>
          </el-input>

          <el-button-group>
            <me-button info="刷新" icon="el-icon-refresh"
                       @click="refreshKey(false)" :disabled="!share.redisKey.key"
                       placement="top"/>
            <me-button info="删除键" icon="el-icon-delete"
                       v-if="canEdit" type="danger"
                       @click="delKey"
                       :disabled="!share.redisKey.key" placement="top"/>
          </el-button-group>
        </div>
      </div>

      <div class="value">
        <!-- json显示 -->
        <template v-if="viewType === 'json'">
          <me-code :value="showValue" @update:value="(newValue) => redisValue.newValue=newValue" :read-only="!canSave"/>

          <div class="btn-rb" v-if="canSave">
            <me-button class="save" info="保存" type="danger" icon="me-icon-save" @click="setValue" placement="top"/>
          </div>

          <el-button-group class="btn-rt" >
            <el-button>Size: {{ showSize }}</el-button>
            <me-button info="复制" icon="el-icon-document-copy" @click="copy(showValue)"/>
            <me-button info="默认开启美化，开启后针对hash/list/set/json等进行格式化，关闭后显示原始值toString"
                       placement="bottom-end"
                       icon="el-icon-magic-stick"
                       :type="isPretty ? 'info' : ''"
                       @click="isPretty = !isPretty"/>
          </el-button-group>
        </template>

        <!-- 表格显示 -->
        <div class="me-flex" style="flex-direction: column; height: 100%" v-else>
          <div class="me-flex" style="width: 100%">
            <el-input v-model="tableKeyword" placeholder="模糊筛选" clearable style="width: 300px"/>
            <el-button icon="el-icon-plus" @click="fieldAdd">插入行</el-button>
          </div>
          <div class="table-view">
            <el-table :data="filterDataList" border stripe ref="table" height="100%"
                      :row-class-name="rowClassName" @row-click="rowClick">
              <el-table-column label="#" type="index" width="50" align="center" show-overflow-tooltip>
                <template #default="scope">
                  <div v-if="fieldSetIndex != scope.$index">{{scope.$index + 1}}</div>
                  <me-icon v-else icon="el-icon-edit" :style="{color: share.color, display: 'block'}" ></me-icon>
                </template>
              </el-table-column>

              <el-table-column label="键"   prop="key"   show-overflow-tooltip v-if="redisValue.type === 'hash'"/>
              <el-table-column label="值"   prop="value" show-overflow-tooltip/>
              <el-table-column label="分数" prop="score" show-overflow-tooltip v-if="redisValue.type === 'zset'"/>

              <el-table-column label="操作" :width="canEdit ? 100 : 60" fixed="right" align="center">
                <template #default="scope">
                  <div class="me-flex" :style="{justifyContent: canEdit ? 'space-between' : 'center'}">
                    <me-icon info="复制" icon="el-icon-document-copy" class="icon-btn"  @click.stop="copy(scope.row.value) "/>
                    <me-icon info="编辑" icon="el-icon-edit" class="icon-btn"  @click.stop="fieldSet(scope.row, scope.$index)" v-if="canEdit"/>
                    <el-popconfirm :hide-after="0" title="确定删除吗？" @confirm.stop="fieldDel(scope.row)" v-if="canEdit">
                      <template #reference>
                        <me-icon info="删除" icon="el-icon-delete" class="icon-btn"/>
                      </template>
                    </el-popconfirm>
                  </div>
                </template>
              </el-table-column>
            </el-table>
            <!-- 字段编辑 -->
            <FieldSet ref="fieldSetRef" @success="refreshKey" @closed="fieldSetInit" class="field-set"/>
          </div>
        </div>

        <!-- string类型不显示，带有hashKey不显示, 命中黑名单的hash类型不显示-->
        <div class="btn-rb" v-if="!(stringTypeOrWithHashKey || hashType && showValue.startsWith('['))">
          <el-segmented v-model="viewType" :options="viewTypeList">
            <template #default="scope">
              <me-icon name="JSON展示" icon="me-icon-json"  hint placement="top" v-if="scope.item === 'json'"/>
              <me-icon name="表格展示" icon="me-icon-table" hint placement="top" v-else/>
            </template>
          </el-segmented>
        </div>
      </div>
    </template>
    <el-empty v-else description="未选择任何键"></el-empty>

    <!-- 字段新增 -->
    <FieldAdd ref="fieldAddRef" @success="refreshKey"/>
  </div>
</template>

<style scoped lang="scss">
.redis-value {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .key {
    :deep(.el-input-group__prepend) {
      padding: 0 16px;
    }
    :deep(.el-input-group__append) {
      padding: 0 18px;
    }

    display: flex;
    justify-content: space-between;
  }

  .value {
    margin-top: 10px;
    position: relative;
    flex-grow: 1;
    overflow: hidden;

    .btn-rt {
      //background-color: #272822;
      position: absolute;
      right: 0;
      top: 0;
    }

    .btn-rb {
      position: absolute;
      right: 0;
      bottom: 0;
      z-index: 10;  // 当表格数据较多时，可以显示在上方
    }

    .table-view {
      margin-top: 10px;
      flex-grow: 1;
      height: 0;
      width: 100%;
      position: relative;

      :deep(.el-table) {
        .field-set-row {
          --el-table-tr-bg-color: var(--el-color-warning-light-9);
        }

        .field-setting {
          cursor: pointer;
        }
      }

      .field-set {
        position: absolute;
        top: 0;
        right: 0;
        z-index: 20;
        width: 60%;
        height: 100%;
      }
    }
  }
}
</style>
