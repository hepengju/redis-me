<script setup>
import useGlobalStore from '@/utils/store.js'
import {capitalize} from 'lodash'

// 全局对象
const global = useGlobalStore()

const isEnvEdit = ref(true)
const expire = ref(-1)
const showValue = ref('')
const showSize = ref(0)
const showSave = ref(true)
const magicValue = ref(true)
const hashKey = ref('')
function getValue(){}
function setKey(){}
function delKey(){}
</script>

<template>
  <div class="redis-value">
    <template v-if="global.redisValue">
      <div class="key">
        <el-input type="text" v-model="global.redisKey.key" readonly style="flex: 1">
          <template #prepend>{{capitalize(global.redisValue.type)}}</template>
          <template #append>
            <el-button icon="el-icon-document-copy" v-copy="global.redisKey.key"/>
          </template>
        </el-input>

        <el-input type="text" placeholder="可选输入" style="width: 200px; margin-left: 10px"
                  v-model="hashKey" v-if="global.redisValue.type == 'hash'"
                  @keyup.enter="getValue('')">
          <template #prepend>Hash键</template>
        </el-input>

        <me-flex>
          <el-input type="number" v-model="global.redisValue.ttl" style="width: 150px; margin: 0 10px;" >
            <template #prepend>TTL</template>
            <template #append v-if="isEnvEdit">
              <el-tooltip content="点击修改键的过期时间（单位为秒）" placement="top" :show-after="500">
                <el-button icon="el-icon-select" @click="expire" :disabled="!global.redisKey.key"/>
              </el-tooltip>
            </template>
          </el-input>

          <el-button-group style="width: 90px">
            <el-button icon="el-icon-refresh" @click="getValue('')" :disabled="!global.redisKey.key"></el-button>
            <el-button type="danger" icon="el-icon-delete" @click="delKey" :disabled="!global.redisKey.key"></el-button>
          </el-button-group>
        </me-flex>
      </div>

      <div class="value">
        <me-code :value="showValue" @update:value="(newValue) => global.redisValue.newValue=newValue" mode="application/json" :read-only="!showSave"></me-code>
        <el-button-group class="btn">
          <el-button>Size: {{showSize}}</el-button>
          <el-button icon="el-icon-document-copy" v-copy="showValue" ></el-button>
          <el-tooltip content="默认开启美化，开启后针对hash/list/set/zset及json字符串进行格式化，关闭后显示原始值toString">
            <el-button icon="el-icon-magic-stick" text :style="magicValue ? {'backgroundColor': '#f4de29 !important', 'color': 'black' } : {}" @click="magicValue = !magicValue"></el-button>
          </el-tooltip>
        </el-button-group>
        <el-button-group class="save" v-if="isEnvEdit">
          <me-button type="danger" icon="me-icon-save" v-if="showSave" @click="setKey" placement="top" info="保存"></me-button>
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