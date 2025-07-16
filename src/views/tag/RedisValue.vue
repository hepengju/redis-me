<script setup>
import useGlobalStore from '@/utils/store.js'
import {capitalize} from 'lodash'
import {copy} from '@/utils/util.js'

// 全局对象
const global = useGlobalStore()

const showValue = ref('')
const showSize = ref(0)
const showSave = ref(true)
const magicValue = ref(true)
const hashKey = ref('')
function expireKey(){
  console.log('expireKey')
}
function getValue(){}
function setKey(){}
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
              <me-button info="点击修改键的过期时间（单位为秒，-1代表永久）" icon="el-icon-select" @click="expireKey"
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
                 mode="application/json" :read-only="!showSave"></me-code>
        <el-button-group class="btn">
          <el-button>Size: {{ showSize }}</el-button>
          <me-button info="复制" icon="el-icon-document-copy" @click="copy(showValue)" placement="bottom"/>
          <me-button info="默认开启美化，开启后针对hash/list/set/json等进行格式化，关闭后显示原始值toString"
                     placement="bottom-end"
                     icon="el-icon-magic-stick"
                     :style="magicValue ? {'backgroundColor': '#f4de29 !important', 'color': 'black' } : {}"
                     @click="magicValue = !magicValue"/>
        </el-button-group>
        <el-button-group class="save" v-if="!global.readonly">
          <me-button type="danger" icon="me-icon-save" v-if="showSave" @click="setKey" placement="top"
                     info="保存"></me-button>
          <!-- TODO 编辑Hash
          <el-button type="danger" icon="el-icon-edit" v-if="showEdit" @click="editHash"></el-button>
          -->
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
      background-color: #272822;
      position: absolute;
      right: 0;
      top: 0;
    }

    .save {
      background-color: #272822;
      position: absolute;
      right: 0;
      bottom: 0;
    }
  }
}
</style>