<script setup>
import MeIcon from '@/components/MeIcon.vue'
import useGlobalStore from '@/utils/store.js'
import {capitalize} from 'lodash'
import {copy, humanSize} from '@/utils/util.js'

// 全局对象
const global = useGlobalStore()

// 值的显示方式
const viewTypeList = ['json', 'table']
const viewType = ref('json')
const hashKey = ref('')
const isPretty = ref(true)
const withHashKey = ref(false)
const tableKeyword = ref('')

// 计算属性
const stringTypeOrWithHashKey = computed(() => 'string' === global.redisValue?.type || withHashKey.value)
const showValue = computed(() => {
  const rv = global.redisValue
  if (rv === null || rv === undefined) return ''
  if (rv.value === null || rv.value === undefined) return ''

  if (isPretty.value) {
    if (stringTypeOrWithHashKey.value) {
      const str = rv.value.toString()
      try {
        return str.startsWith('{') || str.startsWith('[') ? JSON.stringify(JSON.parse(str), null, 2) : str
      } catch (e) {
        return str
      }
    } else {
      return JSON.stringify(rv.value, null, 2)
    }
  } else {
    return 'hash' === rv.type && !withHashKey.value ? JSON.stringify(rv.value) : rv.value.toString()
  }
})

// 表格数据
const dataList = computed(() => {
  const rv = global.redisValue
  if (rv === null || rv === undefined) return []
  if (rv.value === null || rv.value === undefined) return []

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

function expireKey(){
  console.log('expireKey')
}
function getValue(){}
function setValue(){}
function delKey(){}

function rowCopyValue(){}
function rowEditValue(){}
function rowDeleteValue(){}
</script>

<template>
  <div class="redis-value">
    <template v-if="global.redisValue">
      <div class="key">
        <el-input type="text" v-model="global.redisKey.key" readonly style="flex: 1">
          <template #prepend>
            {{capitalize(global.redisValue.type)}}
          </template>
          <template #append>
            <me-button info="复制" icon="el-icon-document-copy" @click="copy(global.redisKey.key)" placement="top"/>
          </template>
        </el-input>

        <el-input type="text" placeholder="可选输入" style="width: 200px; margin-left: 10px"
                  v-model="hashKey" v-if="global.redisValue.type == 'hash'"
                  @keyup.enter="getValue('')">
          <template #prepend>Hash键</template>
        </el-input>

        <me-flex>
          <!-- 宽度170可以完全显示1天：86400秒 -->
          <el-input v-model.number="global.redisValue.ttl" style="width: 170px; margin: 0 10px;">
            <template #prepend>TTL</template>
            <template #append v-if="!global.readonly">
              <me-button info="点击修改键的过期时间（单位为秒，-1代表永久）"
                         icon="el-icon-select" @click="expireKey"
                         style="color: var(--el-color-danger)"
                         :disabled="!global.redisKey.key" placement="top-end"/>
            </template>
          </el-input>

          <el-button-group>
            <me-button info="刷新值" icon="el-icon-refresh" @click="getValue('')" :disabled="!global.redisKey.key" placement="top"/>
            <me-button info="删除键" icon="el-icon-delete" v-if="!global.readonly" type="danger"  @click="delKey" :disabled="!global.redisKey.key" placement="top"/>
          </el-button-group>
        </me-flex>
      </div>

      <div class="value">
        <me-code :value="showValue"
                 @update:value="(newValue) => global.redisValue.newValue=newValue"
                 v-if="viewType === 'json'"
                 mode="application/json"/>

        <me-flex style="flex-direction: column" v-else>
          <me-flex class="table-header">
            <el-input v-model="tableKeyword" placeholder="模糊筛选" style="width: 200px"/>
            <el-button icon="el-icon-plus">插入行</el-button>
          </me-flex>
          <el-table :data="filterDataList" style="margin-top: 10px" border stripe>
            <el-table-column label="#" type="index" width="50" align="center" show-overflow-tooltip/>

            <el-table-column label="键"   prop="key"   show-overflow-tooltip v-if="global.redisValue.type === 'hash'"/>
            <el-table-column label="值"   prop="value" show-overflow-tooltip/>
            <el-table-column label="分数" prop="score" show-overflow-tooltip v-if="global.redisValue.type === 'zset'"/>

            <el-table-column label="操作" width="100" fixed="right" align="center">
              <template #default="scope">
                <me-flex>
                  <me-icon info="复制" icon="el-icon-document-copy" class="icon-btn"  @click="rowCopyValue(scope.row) "/>
                  <me-icon info="编辑" icon="el-icon-edit" class="icon-btn"  @click="rowEditValue(scope.row, scope.$index)"/>
                  <el-popconfirm :hide-after="0" title="确定删除吗？" @confirm="rowDeleteValue(scope.row, scope.$index)">
                    <template #reference>
                      <me-icon info="删除" icon="el-icon-delete" class="icon-btn"/>
                    </template>
                  </el-popconfirm>
                </me-flex>
              </template>
            </el-table-column>
          </el-table>
        </me-flex>

        <el-button-group class="btn-rt" v-if="stringTypeOrWithHashKey">
          <el-button>Size: {{ humanSize(global.redisValue.rawValue.length) }}</el-button>
          <me-button info="复制" icon="el-icon-document-copy" @click="copy(showValue)"/>
          <me-button info="默认开启美化，开启后针对hash/list/set/json等进行格式化，关闭后显示原始值toString"
                     placement="bottom-end"
                     icon="el-icon-magic-stick"
                     :type="isPretty ? 'info' : ''"
                     @click="isPretty = !isPretty"/>
        </el-button-group>

        <div class="btn-rb" v-if="stringTypeOrWithHashKey && !global.readonly">
          <me-button class="save" info="保存" type="danger" icon="me-icon-save" @click="setValue"/>
        </div>

        <div class="btn-rb" v-if="!stringTypeOrWithHashKey">
          <el-segmented v-model="viewType" :options="viewTypeList">
            <template #default="scope">
              <me-icon name="JSON展示" icon="me-icon-json"  hint placement="top" v-if="scope.item === 'json'"/>
              <me-icon name="表格展示" icon="me-icon-table" hint placement="top" v-else/>
            </template>
          </el-segmented>
        </div>
      </div>
    </template>
    <el-empty v-else description="键不存在 或 未选择任何键"></el-empty>
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
      position: absolute;
      right: 0;
      top: 0;
    }

    .btn-rb {
      position: absolute;
      right: 0;
      bottom: 0;
    }
  }
}
</style>