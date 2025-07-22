<script setup>
import {apiConnList} from '@/utils/api.js'
import useGlobalStore from '@/utils/store.js'
import {bus, CONN_REFRESH, PREDEFINE_COLORS} from '@/utils/util.js'
import SaveConn from '@/views/conn/SaveConn.vue'
import {nextTick, useTemplateRef} from 'vue'

// 全局属性
const global = useGlobalStore()

// 获取连接列表
function getConnList() {
  global.connList = apiConnList()
}
getConnList()

function colorStyle(conn) {
  return {color: conn.color}
}

// 选中连接
function selectConn(conn) {
  global.conn = conn
  bus.emit(CONN_REFRESH)
}

// 新增、编辑连接
const dialog = reactive({
  conn: false
})
const connRef = useTemplateRef('conn')
function addConn() {
  dialog.conn = true
  nextTick(() => connRef.value.open('add'))
}
function editConn(conn) {
  dialog.conn = true
  nextTick(() => connRef.value.open('edit', conn))
}
function doNothing(){}
</script>

<template>
  <div class="redis-conn">
    <el-descriptions class="desc" v-for="conn in global.connList" :column="1" border label-width="80" @click="selectConn(conn)">
      <el-descriptions-item class-name="single-line-ellipsis">
        <template #label>
          <me-icon name="名称" icon="el-icon-tickets"/>
        </template>
        <div :style="colorStyle(conn)" class="single-line-ellipsis" style="width: 150px">{{ conn.name }}</div>
      </el-descriptions-item>
      <el-descriptions-item>
        <template #label>
          <me-icon name="主机" icon="el-icon-data-board"/>
        </template>
        <span :style="colorStyle(conn)" class="single-line-ellipsis" style="width: 150px">{{ conn.host }}@{{ conn.port }}</span>
      </el-descriptions-item>
      <el-descriptions-item>
        <template #label>
          <me-icon name="其他" icon="el-icon-memo"/>
        </template>
          <div class="me-flex"  @click.stop="doNothing">
            <div>
              <el-color-picker size="small" v-model="conn.color" :predefine="PREDEFINE_COLORS"/>
              <!--
              <el-tag style="margin-left: 10px" type="info" v-if="conn.ssl">SSL</el-tag>
              <el-tag style="margin-left: 10px" type="info" v-if="conn.cluster">集群</el-tag>
              -->
            </div>
            <div class="me-flex" :style="colorStyle(conn)">
              <me-icon name="编辑" icon="el-icon-edit"   hint placement="top" @click="editConn(conn)"/>
              <me-icon name="删除" icon="el-icon-delete" hint placement="top" style="margin-left: 10px" @click="global.deleteConn(conn)"/>
            </div>
          </div>
      </el-descriptions-item>
    </el-descriptions>

    <div class="add" @click="addConn">
      <el-button size="large" plain icon="el-icon-plus">新增连接</el-button>
    </div>

    <SaveConn ref="conn" v-if="dialog.conn" @closed="dialog.conn = false"/>
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

    .icon-main {
      &:hover {
        color: pink !important;
      }
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