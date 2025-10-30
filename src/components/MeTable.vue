<script setup>
import {computed} from "vue";

const {data} = defineProps({
  data: {type: Array, default: () => []},
})

// 前端分页表
const currentPage = ref(1)
const pageSize = ref(20)
const pageData = computed(() => {
  return data.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value)
})

function handleChange(page, size){
  currentPage.value = page
  pageSize.value = size
}

function updatePageSize(size){
  currentPage.value = 1
  pageSize.value = size
}
</script>

<template>
  <div class="me-table">
    <div class="me-table-main">
      <el-table v-bind="$attrs" :data="pageData" height="100%">
        <slot></slot>
      </el-table>
    </div>
    <el-pagination
      style="margin: 10px 0 0 5px"
      size="small"
      background
      @change="handleChange"
      :page-size="pageSize"
      :page-sizes="[20,50,100]"
      @update:page-size="updatePageSize"
      :total="data.length"
      layout="total, sizes, prev, pager, next, jumper"
    />
  </div>
</template>

<style scoped lang="scss">
.me-table {
  height: 100%;
  //border: 2px solid red;

  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .me-table-main {
    flex: 1
  }
}
</style>