<script setup>
import useGlobalStore from '@/utils/store.js'
import {capitalize} from 'lodash'
import {copy, humanSize} from '@/utils/util.js'

// 全局对象
const global = useGlobalStore()

// 值的显示方式
const hashKey = ref('')
const isPretty = ref(true)
const isHashValue = ref(false)
const isTable = ref(false)

// 计算属性
const stringTypeOrHashValue = computed(() => 'string' === global.redisValue?.type || isHashValue.value)
const showValue = computed(() => {
  const rv = global.redisValue
  console.log(rv)
  console.log(JSON.stringify(rv?.value, null, 2))

  if (isPretty.value) {
    if (stringTypeOrHashValue.value) {
      const str = rv?.value?.toString()
      try {
        return str.startsWith('{') || str.startsWith('[') ? JSON.stringify(JSON.parse(str), null, 2) : str
      } catch (e) {
        return str
      }
    } else {
      return JSON.stringify(rv?.value, null, 2)
    }
  } else {
    return 'hash' === rv?.type && !isHashValue.value ? JSON.stringify(rv.value) : rv.value?.toString()
  }
})


function showEdit(){

}
function expireKey(){
  console.log('expireKey')
}
function getValue(){}
function setValue(){}
function delKey(){}
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
            <me-button hint="刷新值" icon="el-icon-refresh" @click="getValue('')" :disabled="!global.redisKey.key"></me-button>
            <me-button hint="删除键" v-if="!global.readonly" type="danger" icon="el-icon-delete" @click="delKey" :disabled="!global.redisKey.key"></me-button>
          </el-button-group>
        </me-flex>
      </div>

      <div class="value">
        <me-code :value="showValue" @update:value="(newValue) => global.redisValue.newValue=newValue"
                 mode="application/json" :read-only="global.readonly || !stringTypeOrHashValue"></me-code>
        <el-button-group class="btn">
          <el-button>Size: {{ humanSize(global.redisValue.rawValue.length) }}</el-button>
          <me-button info="复制" icon="el-icon-document-copy" @click="copy(showValue)" placement="bottom"/>
          <me-button info="默认开启美化，开启后针对hash/list/set/json等进行格式化，关闭后显示原始值toString"
                     placement="bottom-end"
                     icon="el-icon-magic-stick"
                     :style="isPretty ? {'backgroundColor': '#f4de29 !important', 'color': 'black' } : {}"
                     @click="isPretty = !isPretty"/>
        </el-button-group>

        <el-button-group class="save" v-if="!global.readonly">
          <me-button info="保存" placement="top" type="danger" icon="me-icon-save" @click="setValue"
                     v-if="stringTypeOrHashValue"/>
          <me-button info="切换表格显示" placement="top" icon="el-icon-edit" @click="showEdit" v-else
                     :style="isTable ? {'backgroundColor': '#f4de29 !important', 'color': 'black' } : {}"
          />
        </el-button-group>
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

    .btn {
      position: absolute;
      right: 0;
      top: 0;
    }

    .save {
      position: absolute;
      right: 0;
      bottom: 0;
    }
  }
}
</style>