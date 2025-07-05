<script setup>
import {cloneDeep} from 'lodash'
import {ref, useTemplateRef} from 'vue'

const emit = defineEmits(['success', 'closed'])

// 表单和校验规则
const form = ref({
  id: '',
  name: '',

  host: '127.0.0.1',
  port: '6379',
  username: '',
  password: '',

  readonly: false,
  cluster: false,
  ssl: false,
  sslOption: {
    key: '',
    cert: '',
    ca: ''
  },

  color: '#409eff',
  order: 0
})
const rules = {
  host: [{required: true, message: '请输入主机'}],
  port: [{required: true, message: '请输入端口'}]
}
const predefineColors = [
    '#409eff',  // primary
    '#67c23a',  // success
    '#e6a23c',  // warning
    '#f56c6c',  // danger
    '#909399',  // info
]

// 外部打开对话框
defineExpose({open})
const visible = ref(false)
const mode = ref('add')
function open(modeValue, data) {
  visible.value = true
  mode.value = modeValue
  if (data) {
    Object.assign(form.value, cloneDeep(data))
  }
}

// 提交表单
const formRef = useTemplateRef('formRef')
function submit() {
  formRef.value.validate(valid => {
    if (!valid) return
    emit('success', form.value, mode.value)
    visible.value = false
  })
}
</script>
<template>
  <el-dialog :title="mode === 'add' ? '新增连接' : '编辑连接'" @closed="emit('closed')"
             v-model="visible" width="600" append-to-body destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="right" label-width="60">
      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="地址" prop="host">
            <el-input v-model.trim="form.host" placeholder="127.0.0.1"/>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="端口" prop="port">
            <el-input v-model.number="form.port" placeholder="6379"/>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="用户">
            <el-input v-model.trim="form.username" placeholder="ACL in Redis >= 6.0"/>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="密码">
            <el-input v-model.trim="form.password" placeholder="auth"/>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="名称" prop="name">
        <el-input v-model.trim="form.name" placeholder="默认自动根据地址和端口生成"/>
      </el-form-item>

      <el-row :gutter="24">
        <el-col :span="5">
          <el-form-item label="颜色">
            <el-color-picker v-model="form.color" :predefine="predefineColors"/>
          </el-form-item>
        </el-col>
        <el-col :span="19">
          <el-checkbox v-model="form.readonly">只读</el-checkbox>
          <el-checkbox v-model="form.cluster">集群</el-checkbox>
          <el-checkbox v-model="form.ssl">SSL</el-checkbox>
        </el-col>
      </el-row>

      <div v-show="form.ssl">
        <el-divider content-position="left">SSL设置</el-divider>
        <el-form-item label="私钥">
          <me-file-input v-model="form.sslOption.key" placeholder="SSL Private Key Pem (key)"/>
        </el-form-item>
        <el-form-item label="公钥">
          <me-file-input v-model="form.sslOption.cert" placeholder="SSL Public Key Pem (key)"/>
        </el-form-item>
        <el-form-item label="授权">
          <me-file-input v-model="form.sslOption.ca" placeholder="SSL Certificate Authority (CA)"/>
        </el-form-item>
      </div>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="submit">确定</el-button>
      </div>
    </template>
  </el-dialog>
</template>