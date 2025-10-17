<script setup>
import {ElMessage, ElMessageBox} from 'element-plus'
import {cloneDeep} from "lodash";
const emit = defineEmits(['success', 'closed'])
defineExpose({open, close})

// 共享数据
const share = inject('share')

// 表单数据
const visible = ref(false)
const isSaving = ref(false)
const initForm = readonly({
  key: '',
  bytes: '',
  type: 'string',

  srcFieldValue: '', // set/zset 需要先删除原始值再新增新的值

  fieldIndex: 0,
  fieldKey: '',
  fieldValue: '',
  fieldScore: 0,
})
const form = ref(cloneDeep(initForm))

function open(data) {
  visible.value = true
  Object.assign(form.value, cloneDeep(initForm))
  Object.assign(form.value, data)
}

function close() {
  visible.value = false
}

const rules = {
  fieldValue: [{required: true, message: '值不能为空'}],
  fieldScore: [{required: true, message: '请输入分数'}],
}

// 取消
function cancel() {
  visible.value = false
  emit('closed')
}

// 提交
const formRef = useTemplateRef('formRef')
function submit() {
  formRef.value.validate(async valid => {
    if (!valid) return

    isSaving.value = true
    try {
      // const res = await api.ark.extops.redis.fieldSet(share.env, form.value)
      const res = {}
      if (res.code == 200) {
        visible.value = false
        emit('success')
        ElMessage({message: '编辑成功', type: 'success'})
      } else {
        ElMessageBox.alert(res.msg, '提示', {type: 'error'})
      }
    } finally {
      isSaving.value = false
    }
  })
}
</script>

<template>
  <el-card header="编辑字段" v-show="visible" class="field-set">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top"
             style="display: flex; flex-direction: column; height: 100%">
      <el-form-item label="哈希键" v-if="form.type === 'hash'">
        <el-input v-model="form.fieldKey" disabled/>
      </el-form-item>
      <el-form-item label="索引" v-if="form.type === 'list'">
        <el-input v-model="form.fieldIndex" disabled/>
      </el-form-item>
      <el-form-item label="分数" prop="fieldScore" v-if="form.type === 'zset'">
        <el-input-number :controls="false" v-model="form.fieldScore" align="left" style="width: 100%"/>
      </el-form-item>
      <el-form-item label="值" prop="fieldValue" style="display: flex; flex-direction: column; flex: 1">
        <me-code v-model:value="form.fieldValue" style="flex: 1"/>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="cancel">取 消</el-button>
      <el-button type="primary" :loading="isSaving" @click="submit">更 新</el-button>
    </template>
  </el-card>
</template>

<style scoped lang="scss">
.field-set {
  display: flex;
  flex-direction: column;

  :deep(.el-card__body) {
    padding: 20px 20px 0 20px; // 覆盖掉最外部的自定义样式
    flex-grow: 1; // 自动延伸
  }

  :deep(.el-card__footer) {
    border-top: none; // 去掉默认的顶部线条
    text-align: right; // 按钮右对齐
  }
}
</style>
