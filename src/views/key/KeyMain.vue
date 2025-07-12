<script setup>
import MeIcon from '@/components/MeIcon.vue'
import {computed, reactive} from 'vue'
import KeySimple from './detail/KeySimple.vue'

// 查询框: SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]
const keyTypeList = ['STRING', 'HASH', 'LIST', 'SET', 'ZSET']
const keyType = ref('')    // scan类型
const exact   = ref(false) // 是否精确查询
const keyword = ref('')    // 关键字
const keyList = ref([])    // 键列表
const dbList  = ref([])    // db列表
const db      = ref('')    // 选择的db
const filterKeyList = computed(() => {
  return keyList.value.filter(key => key.indexOf(keyword.value) > -1)
})

// 扫描键
function scanKey(){}

// 弹框
const dialog = reactive({
  add: false,    // 新增键
  load: false,   // 导入键
  delete: false, // 删除健
})


const redisKeyList = []


function addKey(){}

function handleCommand() {
}

function scanMore() {
}

function scanAll() {
}
</script>

<template>
  <div class="key-main">
    <el-input class="key-search" v-model="keyword" placeholder="Enter 键进行搜索" @keyup.enter="scanKey" clearable>
      <template #prepend>
        <el-select v-model="keyType" style="width: 60px" placeholder="">
          <el-option v-for="item in keyTypeList"
                     :label="item"
                     :value="item"
                     :key="item"/>

          <template #label="{ label, value }">
            <span style="font-weight: bold">{{ value.slice(0, 1) }}</span>
          </template>
        </el-select>
<!--        <el-tooltip content="精确搜素">-->
<!--          <el-checkbox size="small" v-model="exact"/>-->
<!--        </el-tooltip>-->
      </template>
      <template #append>
        <el-button-group>
          <me-button info="刷新键" @click="scanKey" icon="el-icon-search"></me-button>
          <me-button info="新增键" @click="addKey" style="border-color: var(--el-button-border-color)" icon="el-icon-plus"></me-button>
        </el-button-group>
      </template>
    </el-input>

    <div class="key-list" :v-loading="false" element-loading-text="扫描中...">
      <KeySimple/>
    </div>

    <div class="key-footer">
      <el-select v-model="db" filterable value-key="index" style="width: 100px" @change="scanKey">
        <el-option v-for="item in dbList"
                   :label="item.label"
                   :value="item"
                   :key="item.index"/>
      </el-select>

      <el-text class="tip" size="large" type="primary">{{ filterKeyList.length }} / {{ keyList.length }}</el-text>

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
  </div>
</template>

<style scoped lang="scss">
.key-main {
  //border: 2px solid red;
  flex-grow: 1;

  .key-search {
    // 复选框显示尽量为方形
    :deep(.el-input-group__prepend) {
      padding: 0 12px;
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
    overflow: hidden auto; // 隐藏水平滚动条，仅显示竖直滚动条

    // 简单键列表和文件夹列表共享的属性
    //font-size: 12px;
    //color: var(--el-color-primary);

    :deep(.el-link) {
      font-size: 12px;
    }
  }

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
}
</style>