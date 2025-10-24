<script setup>
import {useVirtualList} from '@vueuse/core'
import {ElMessage} from 'element-plus'
import {cloneDeep} from 'lodash'
import {invoke_then} from "@/utils/util.js";

const emit = defineEmits(['success', 'closed'])
defineExpose({open})
function open(data) {
  visible.value = true
  showScan.value = true
  Object.assign(form.value, cloneDeep(initForm))
  Object.assign(form.value, data)
}

// 共享数据
const share = inject('share')

// 表单数据
const visible = ref(false)
const loading = ref(false)
const initForm = readonly({
  match: '',
  keyList: [],
  deleteDirect: false
})
const form = ref(cloneDeep(initForm))

watch(() => form.value.match, () => {
  showScan.value = true
  form.value.keyList = []
})

const rules = {
  match: [{required: true, message: '键名表达式不能为空'}]
}

// 提交数据
const formRef = useTemplateRef('formRef')
function submit() {
  formRef.value.validate(async valid => {
    if (!valid) return

    loading.value = true
    try {
      await invoke_then('batch_del', {id: share.conn.id, param: form.value})
      ElMessage.success("删除成功")
      emit('success')
      visible.value = false
    } finally {
      loading.value = false
    }
  })
}

// 扫描受影响的键
const showScan = ref(true)
async function scanKey() {
  loading.value = true
  try {
    const params = {
      match: form.value.match,
      type: '',
      count: 0,
      loadAll: true,
      cursor: null,
    }
    const data = await invoke_then('scan', {id: share.conn.id, param: params})
    form.value.keyList = data.keyList
    showScan.value = false
  } finally {
    loading.value = false
  }
}

// 虚拟列表
const items = computed(() => form.value.keyList)
const {list, containerProps, wrapperProps} = useVirtualList(
  items, {itemHeight: 14},
)
</script>

<template>
  <el-dialog title="批量删除键"
             v-model="visible" :width="600"
             @closed="emit('closed')">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="键名表达式">
        <!-- 此处保留可编辑，使用更加方便 -->
        <el-input type="text" v-model="form.match"/>
        <el-checkbox v-model="form.deleteDirect" v-if="form.keyList.length === 0">直接匹配删除</el-checkbox>
      </el-form-item>

      <el-form-item :label="`受影响的键名（${form.keyList.length}）`" v-if="!showScan">
        <div v-bind="containerProps" :style="{height: '400px', width: '100%'}">
          <div v-bind="wrapperProps">
            <div v-for="item in list" :key="item.index" class="key single-line-ellipsis">
              {{ item.data.key }}
            </div>
          </div>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible=false" >取 消</el-button>
      <el-button type="primary" :loading="loading" @click="submit" v-if="form.deleteDirect">确认删除</el-button>
      <template v-else>
        <el-button type="primary" :loading="loading" @click="scanKey" v-if="showScan">查看受影响的键名</el-button>
        <el-button type="primary" :loading="loading" @click="submit" v-else :disabled="form.keyList.length == 0">确认删除{{form.keyList.length}}个键</el-button>
      </template>
    </template>
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
