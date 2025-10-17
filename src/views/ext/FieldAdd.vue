<script setup>
import {ElMessage, ElMessageBox} from 'element-plus'
import {capitalize, cloneDeep} from 'lodash'
import {invoke_then} from "@/utils/util.js";

const emit = defineEmits(['success', 'closed'])
defineExpose({open})
function open(data) {
  visible.value = true
  Object.assign(form.value, cloneDeep(initForm))
  Object.assign(form.value, data)
}

// 共享数据
const share = inject('share')

// 表单数据
const visible = ref(false)
const isSaving = ref(false)
const initForm = readonly({
  mode: 'key',  // key-新增键, field-新增字段
  key: '',
  bytes: '',
  type: 'string',
  seconds: -1,
  value: '',

  listPushMethod: 'rpush',
  listPushOptions: [
    {label: '尾部追加', value: 'rpush'},
    {label: '插入头部', value: 'lpush'}
  ],
  fieldValueList: [
    {
      fieldKey: '',
      fieldValue: '',
      fieldScore: 0,
    }
  ]
})
const form = ref(cloneDeep(initForm))

const rules = {
  key: [{required: true, message: '请输入键名'}],
  type: [{required: true, message: '请选择类型'}],
  seconds: [{required: true, message: '请输入TTL'}],
  value: [{required: true, message: '值不允许为空'}],
  fieldValueList: [
    {
      validator: (rule, value, callback) => {
        if (form.value.type === 'hash') {
          const count = form.value.fieldValueList.filter(d => d.fieldKey === '' || d.fieldValue === '').length
          if (count > 0) {
            callback(new Error('哈希键和值不允许为空'))
          }
        } else {
          const count = form.value.fieldValueList.filter(d => d.fieldValue === '').length
          if (count > 0) {
            callback(new Error('值不允许为空'))
          }
        }
        callback()
      }
    }]
}

function deleteElement(index) {
  form.value.fieldValueList.splice(index, 1)
}

function newElement(index) {
  const newValue = {
    fieldKey: '',
    fieldValue: '',
    fieldScore: 0,
  }
  form.value.fieldValueList.splice(index + 1, 0, newValue)
}

// 提交数据
const formRef = useTemplateRef('formRef')
function submit(){
  formRef.value.validate(async valid => {
    if (!valid) return

    isSaving.value = true
    try {
      const res = await invoke_then({id: share.conn.id, params: form.value})
      if (res.code == 200) {
        visible.value = false
        emit('success', form.value)
        ElMessage({message: '新增成功', type: 'success'})
      } else {
        ElMessageBox.alert(res.msg, '提示', {type: 'error'})
      }
    } finally {
      isSaving.value = false
    }
  })
}

const hint = computed(() => {
  if (form.value.type === 'hash') return '(哈希键: 值)'
  if (form.value.type === 'zset') return '(值: 分数)'
  return ''
})
</script>

<template>
  <el-dialog :title="'新增' + (form.mode === 'key' ? '键': '字段')"
             v-model="visible" :width="600" @closed="emit('closed')"
             destroy-on-close close-on-press-escape close-on-click-modal draggable>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-row :gutter="20" v-if="form.mode === 'key'">
        <el-col :span="12">
          <el-form-item label="类型" prop="type">
            <el-select v-model="form.type" style="width: 100%">
              <el-option label="String" value="string"/>
              <el-option label="Hash"   value="hash"/>
              <el-option label="List"   value="list"/>
              <el-option label="Set"    value="set"/>
              <el-option label="ZSet"   value="zset"/>
            </el-select>
          </el-form-item>
        </el-col>

        <el-col :span="12">
          <el-form-item label="TTL" prop="seconds">
            <el-input v-model.number="form.seconds">
              <template #append>
                <el-tooltip content="-1代表永久" placement="top">
                  <div>秒</div>
                </el-tooltip>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="键名" prop="key">
        <el-input type="text" v-model="form.key" :disabled="form.mode === 'field'">
          <template #prepend v-if="form.mode === 'field'">
            {{capitalize(form.type)}}
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="值" prop="value" v-if="form.mode === 'key' && form.type === 'string'">
        <el-input type="textarea" :rows="6" v-model="form.value" clearable/>
      </el-form-item>

      <el-form-item label="类型" v-if="form.mode === 'field' && form.type === 'list'">
        <el-segmented v-model="form.listPushMethod" :options="form.listPushOptions"/>
      </el-form-item>

      <el-form-item :label="'元素 ' + hint" prop="fieldValueList" v-if="form.type !== 'string'">
        <div v-for="(item, index) in form.fieldValueList" class="me-flex" style="margin-bottom: 10px; width: 100%" key="id">
          <el-input type="text" v-model="item.fieldKey"   placeholder="哈希键" style="margin-right: 10px" v-if="form.type === 'hash'" :validate-event="false"/>
          <el-input type="text" v-model="item.fieldValue" placeholder="值"     style="margin-right: 10px" :validate-event="false"/>
          <el-input-number :controls="false" v-model="item.fieldScore"         style="margin-right: 10px" v-if="form.type === 'zset'" :validate-event="false"/>
          <el-button icon="el-icon-delete" circle @click="deleteElement(index)" v-if="form.fieldValueList.length > 1"/>
          <el-button icon="el-icon-plus"   circle @click="newElement(index)"/>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible=false" >取 消</el-button>
      <el-button type="primary" :loading="isSaving" @click="submit()">保 存</el-button>
    </template>
  </el-dialog>
</template>
