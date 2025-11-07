<script setup>
import {cloneDeep} from 'lodash'
import {nanoid} from 'nanoid'
import {ref, useTemplateRef} from 'vue'
import {meInvoke, PREDEFINE_COLORS, meRandomString, meOk} from '@/utils/util.js'

const emit = defineEmits(['success', 'closed'])

// 表单和校验规则
const form = reactive({
  id: '',
  name: '',

  host: '127.0.0.1',
  port: 6379,
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
})

const rules = {
  host: [{required: true, message: '请输入主机'}],
  port: [{required: true, message: '请输入端口'}]
}

// 外部打开对话框
defineExpose({open})
const visible = ref(false)
const mode = ref('add')
function open(modeValue, data) {
  visible.value = true
  mode.value = modeValue
  if (data) {
    const newData = cloneDeep(data)
    // 新增时给了数据，则是复制连接。id和name需要重置
    if (modeValue === 'add') {
      newData.id = nanoid()
      newData.name = data.name + '-副本'
    }
    Object.assign(form, newData)
  }
}

// 提交表单
const share = inject('share')
const formRef = useTemplateRef('formRef')
function submit() {
  formRef.value.validate(valid => {
    if (!valid) return
    //emit('success', form.value, mode.value)
    if (mode.value === 'add') {
      form.id = nanoid()
      autoGenName()
      share.connList.push(form)
      meOk('新增成功')
      emit('success', form, mode.value)
    } else if (mode.value === 'edit') {
      autoGenName()
      const conn = share.connList.filter(c => c.id === form.id)[0]
      Object.assign(conn, cloneDeep(form))
      meOk('保存成功')
      emit('success', form, mode.value)
    }
    visible.value = false
  })
}

// 自动生成名称
function autoGenName() {
  if (!form.name) {
    form.name = form.host + ':' + form.port
  }

  if (share.connList.find(c => c.name === form.name && c.id !== form.id)) {
    form.name += ' (' + meRandomString(3) + ')'
  }
}

// 测试连接
const loading = ref(false)
function testConn() {
  formRef.value.validate(async valid => {
    if (!valid) return
    loading.value = true
    try {
      await meInvoke('test_conn', {redisConn: form})
      meOk('测试连接成功')
    } finally {
      loading.value = false
    }
  });
}
</script>

<template>
  <el-dialog :title="mode === 'add' ? '新增连接' : '编辑连接'" @closed="emit('closed')"
             v-model="visible" width="600" append-to-body destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="right" label-width="60">
      <el-form-item label="名称" prop="name">
        <el-input v-model.trim="form.name" placeholder="【可选】默认自动根据地址和端口生成"/>
      </el-form-item>

      <el-row :gutter="24">
        <el-col :span="12">
          <el-form-item label="地址" prop="host">
            <el-input v-model.trim="form.host" placeholder="127.0.0.1"/>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="端口" prop="port">
            <el-input-number :min="1" :max="65535" v-model="form.port"
                             :controls='false' align="left" style="width: 100%"
                             placeholder="6379"/>
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
            <el-input type="password" v-model.trim="form.password" placeholder="password"/>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="24">
        <el-col :span="5">
          <el-form-item label="颜色">
            <el-color-picker v-model="form.color" :predefine="PREDEFINE_COLORS"/>
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
        <el-form-item label="公钥">
          <me-file-input v-model="form.sslOption.cert" placeholder="PEM格式公钥文件 (Cert)"/>
        </el-form-item>
        <el-form-item label="私钥">
          <me-file-input v-model="form.sslOption.key" placeholder="PEM格式私钥文件 (Key)"/>
        </el-form-item>
        <el-form-item label="授权">
          <me-file-input v-model="form.sslOption.ca" placeholder="PEM格式授权文件 (CA)"/>
        </el-form-item>
      </div>
    </el-form>
    <template #footer>
      <div class="me-flex">
        <el-button type="primary" style="margin-left: 20px"
                   :loading="loading"
                   @click="testConn">测试连接</el-button>
        <div>
          <el-button @click="visible = false">取消</el-button>
          <el-button type="primary" @click="submit">确定</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>