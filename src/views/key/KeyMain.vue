<script setup>
import {computed, reactive} from 'vue'
import SearchKey from './detail/SearchKey.vue'
import SimpleKey from './detail/SimpleKey.vue'

// 查询
const searchData = reactive({
  keyword: '',  // 关键字
  exact: false, // 是否精确查询

  // 限制Redis的key类型
  keyTypeList: ['string', 'hash', 'list', 'set', 'zset'],
  keyType: '',
})

// 键列表
const keyList = reactive([])
const filterKeyList = computed(() => {
    return []
})

// 底部扩展
const footerData = reactive({
  db: 'db0',

})
</script>

<template>
  <div class="key-main">
    <SearchKey/>
    <div class="key-list" :v-loading="false" element-loading-text="扫描中...">
      <SimpleKey/>
    </div>
  </div>
</template>

<style scoped lang="scss">
.key-main {
  //border: 2px solid red;
  flex-grow: 1;

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
}
</style>