<script setup>
import {useVirtualList} from '@vueuse/core'
import {humanSize, invoke_then} from '@/utils/util.js'

defineExpose({open})

function open(data) {
  keyList.value = []
  visible.value = true
  form.value.match = data.match
  keyMemory()
}

// 共享数据
const share = inject('share')

// 表单数据
const visible = ref(false)
const loading = ref(false)
const form = ref({
  match: '',
  addKeyType: false,
  sizeLimit: 0,
  countLimit: 10000,
  scanCount: 10000,
  scanTotal: 0,
  sleepMillis: 0
})

// 内存分析
const keyList = ref([])
async function keyMemory() {
  loading.value = true
  try {
    const data = await invoke_then('memory_usage', {id: share.conn.id, param: form.value})
    keyList.value = data
  } finally {
    loading.value = false
  }
}

const totalSize = computed(() => keyList.value.map(item => item.size).reduce((sum, cur) => sum + cur, 0))

// 虚拟列表
const items = computed(() => keyList.value)
const {list, containerProps, wrapperProps} = useVirtualList(
  items, {itemHeight: 14},
)
</script>

<template>
  <el-dialog title="目录内存分析" v-model="visible" :width="600">

    <el-form label-position="top">
      <el-form-item label="键名表达式">
        <!-- 此处保留可编辑，使用更加方便 -->
        <el-input type="text" v-model="form.match" disabled/>
      </el-form-item>

      <el-form-item :label="`总数：${keyList.length}，大小：${humanSize(totalSize)}` + (totalSize >= form.countLimit ? `（数据量达到扫描限制：${form.countLimit}）` : '')" :loading="loading">
        <div v-bind="containerProps" :style="{height: '300px', width: '100%'}">
          <div v-bind="wrapperProps">
            <div v-for="item in list" :key="item.index" class="key me-flex">
              <div class="single-line-ellipsis">{{ item.data.key }}</div>
              <div>{{ humanSize(item.data.size)}}</div>
            </div>
          </div>
        </div>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>

<style scoped lang="scss">
.key {
  font-size: 14px;
  line-height: 14px;
  padding: 3px 4px;
  color: var(--el-color-info);
}
</style>

