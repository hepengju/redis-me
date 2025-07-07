<script setup>
import {apiConnList} from '@/utils/api.js'
import {ref} from 'vue'
import useGlobalStore from '@/utils/store.js'
import {PREDEFINE_COLORS} from '@/utils/util.js'

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

function descContentStyle(conn) {
  return {color: conn.color, width: '150px'}
}
</script>

<template>
  <div class="redis-conn">
    <el-descriptions v-for="conn in connList"
                     :column="1" border class="desc" label-width="80">
      <el-descriptions-item class-name="single-line-ellipsis">
        <template #label>
          <me-icon name="名称" icon="el-icon-tickets"/>
        </template>
        <div :style="descContentStyle(conn)" class="single-line-ellipsis">{{ conn.name }}</div>
      </el-descriptions-item>
      <el-descriptions-item>
        <template #label>
          <me-icon name="主机" icon="el-icon-data-board"/>
        </template>
        <span :style="descContentStyle(conn)" class="single-line-ellipsis">{{ conn.host }}@{{ conn.port }}</span>
      </el-descriptions-item>
      <el-descriptions-item>
        <template #label>
          <me-icon name="其他" icon="el-icon-memo"/>
        </template>
          <el-color-picker size="small" v-model="conn.color" :predefine="PREDEFINE_COLORS"/>
          <el-tag style="margin-left: 10px" type="info" v-if="conn.ssl">ssl</el-tag>
          <el-tag style="margin-left: 10px" type="info" v-if="conn.cluster">cluster</el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <div class="add">
      <el-button plain icon="el-icon-plus">新增连接</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-conn {
  border: var(--el-border);
  height: 100%;

  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;

  .desc {
    margin: 10px;
    width: 250px;
    //height: 150px;
    border: var(--el-border);
    cursor: pointer;

    &:hover {
      border-color: var(--el-color-primary);
    }
  }

  .add {
    margin: 10px;
    width: 250px;
    height: 122px;

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