<script setup lang="ts">
import store from '@/utils/store.js'
import MeIcon from '@/components/MeIcon.vue'

const filterKeys = []
const redisKeyList = []
function handleCommand(){

}

function scanKey(){

}
function scanMore(){

}
function scanAll(){

}
</script>

<template>
  <div class="key-footer">
      <el-select v-model="store.db" filterable value-key="index" style="width: 100px" @change="scanKey">
        <el-option v-for="item in store.dbList"
                   :label="item.label"
                   :value="item"
                   :key="item.index"/>
      </el-select>

      <el-text class="tip" size="large" type="primary">{{ filterKeys.length }} / {{ redisKeyList.length }}</el-text>

      <div class="btns">
        <me-icon name="加载更多"       icon="me-icon-load-more" hint placement="top" @click="scanMore"/>
        <me-icon name="加载剩余所有键" icon="me-icon-load-all"  hint placement="top" @click="scanAll"/>
        <el-dropdown placement="top-end" @command="handleCommand">
          <me-icon icon="el-icon-more-filled"></me-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="import" ><me-icon name="导入数据" icon="el-icon-download"/></el-dropdown-item>
              <el-dropdown-item command="batch" divided><me-icon name="批量删除" icon="el-icon-warning"/></el-dropdown-item>
              <el-dropdown-item command="flush"><me-icon name="清空数据" icon="me-icon-flush"/></el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
  </div>
</template>

<style scoped lang="scss">
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
</style>