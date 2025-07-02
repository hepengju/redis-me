<script setup lang="ts">
import store from '@/utils/store.ts'
import {nanoid} from 'nanoid'
import {ref, reactive, toRaw, useTemplateRef} from 'vue'
import {randomString} from "@/utils/util.ts";
import {ElMessage} from 'element-plus'

const form: RedisProperties = reactive({
  id: '',
  name: '',

  host: '',
  port: '',
  username: '',
  password: '',

  readonly: false,
  cluster: false,
  ssl: false,
  sslOption: {
    key: '',
    cert: '',
    ca: '',
  },

  color: '',
  order: 0,
})


const rules = {
  host: [{required: true, message: '请输入主机'}],
  port: [{required: true, message: '请输入端口'}]
}

// 打开对话框
const mode = ref('add')
const formRef = useTemplateRef('formRef')
function open(value: string) {
  mode.value = value
  if (value === 'edit') {
    Object.assign(form, toRaw(store.conn))
  }
}

// 确定
function submitForm() {
  formRef.value.validate(valid => {
    if (!valid) return
    if (mode.value === 'add') {
      form.id = nanoid()
      if (!form.name) {
        form.name = form.host + '@' + form.port
      }

      if (store.connList.find(c => c.name === form.name)) {
        form.name += ' (' + randomString(3) + ')'
      }

      store.connList.push(toRaw(form))
      ElMessage({type: 'success', message: '新增成功'})
    } else if (mode.value === 'edit') {
      Object.assign(store.conn, toRaw(form))
      ElMessage({type: 'success', message: '保存成功'})
    }
    store.dialog.conn = false
  })
}

// 暴露方法
defineExpose({open})
</script>

<template>
  <el-dialog :title="mode === 'add' ? '新增连接' : '编辑连接'"
             v-model="store.dialog.conn" width="600" append-to-body destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="right" label-width="auto">
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
            <el-color-picker v-model="form.color"/>
          </el-form-item>
        </el-col>
        <el-col :span="19">
          <el-checkbox v-model="form.readonly">只读</el-checkbox>
          <el-checkbox v-model="form.cluster">集群</el-checkbox>
          <el-checkbox v-model="form.ssl">SSL</el-checkbox>
          <!--
          <el-form-item label="排序">
            <el-input-number v-model="form.order" :min="1"/>
          </el-form-item>-->
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
        <el-button @click="store.dialog.conn = false">取消</el-button>
        <el-button type="primary" @click="submitForm">确定</el-button>
      </div>
    </template>
  </el-dialog>
</template>