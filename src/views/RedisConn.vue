<script setup>
import {apiConnList} from '@/utils/api.js'
import {ref} from 'vue'
import useGlobalStore from '@/utils/store.js'

const global = useGlobalStore()
// 连接列表
const connList = ref([])

function getConnList() {
  connList.value = apiConnList()
  // if (connList.value.length > 0) {
  //   global.conn = connList.value[0]
  // }
}
getConnList()

const predefineColors = [
  '#409eff',  // primary
  '#67c23a',  // success
  '#e6a23c',  // warning
  '#f56c6c',  // danger
  '#909399',  // info
]

</script>

<template>
  <div class="redis-conn">
    <el-descriptions v-for="conn in connList"
                     :column="1" border class="desc" label-width="80">
      <el-descriptions-item>
        <template #label>
          <me-icon name="名称" icon="el-icon-tickets"/>
        </template>
        <span :style="{color: conn.color}">{{conn.name}}</span>
      </el-descriptions-item>
      <el-descriptions-item>
        <template #label>
          <me-icon name="主机" icon="el-icon-data-board"/>
        </template>
        <span :style="{color: conn.color}">{{conn.host}}@{{conn.port}}</span>
      </el-descriptions-item>
      <el-descriptions-item>
        <template #label>
          <me-icon name="其他" icon="el-icon-memo"/>
        </template>
        <el-color-picker v-model="conn.color" :predefine="predefineColors"/>
        <el-tag v-if="conn.ssl"><span :style="{color: conn.color}">ssl</span></el-tag>
        <el-tag v-if="conn.cluster"><span :style="{color: conn.color}">cluster</span></el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <div class="add">
      <el-button plain icon="el-icon-plus">新增连接</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-conn {
  border: 1px solid red;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;

  .desc {
    margin: 10px;
    width: 250px;
    height: 150px;
    border: var(--el-border);
    cursor: pointer;

    &:hover {
      border-color: var(--el-color-primary);
    }
  }

  .add {
    margin: 10px;
    width: 250px;
    height: 150px;

    display: flex;
    align-items: center;
    justify-content: center;

    .el-button {
      height: 100%;
      width: 100%;
    }
  }
}
</style>