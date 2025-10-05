<script setup>
import { invoke } from '@tauri-apps/api/core';
import {mockApiCommands} from "@/utils/api-mock.js";


const apiCommand = ref({
  command: 'greet',
  param: {
    name: 'RedisME'
  }
})
const param = ref('{"name": "RedisME"}')

function selectChange(item) {
  param.value = JSON.stringify(item.param, null, 2)
  apiCommand.value =  item
}

const result = ref('')
const hint = ref('')
const loading = ref(false)

function invokeCommand(){
  let paramJson = {}
  if (param.value) {
    try {
      paramJson = JSON.parse(param.value)
    } catch (e) {
      hint.value = "参数解析错误（确认是否Json格式）"
      result.value = "" + e
      return
    }
  }

  loading.value = true
  invoke(apiCommand.value.command, paramJson)
      .then(data => {
        loading.value = false
        hint.value = "命令执行成功"
        result.value = data ? JSON.stringify(data, null, 2) : ''
      })
      .catch(error => {
        loading.value = false
        hint.value = "命令执行报错"
        result.value = error
      })
}

</script>

<template>
  <div class="redis-tauri">
    <div class="header">
      <el-form>
        <el-form-item label="命令">
          <el-select v-model="apiCommand" value-key="command" @change="selectChange"
                     filterable allow-create>
            <el-option key="greet" label="greet" :value="{command: 'greet', param: {name: 'RedisME'}}"></el-option>
            <el-option v-for="item in mockApiCommands"
                       :key="item.command"
                       :label="item.command"
                       :value="item"/>
          </el-select>
        </el-form-item>
        <el-form-item label="参数">
          <el-input type="textarea" :rows="10" v-model="param" placeholder="json格式参数"/>
        </el-form-item>

        <el-form-item label="提示">
          <div class="me-flex" style="width: 100%">
            <el-text type="success">{{hint}}</el-text>
            <el-button type="primary" @click="invokeCommand">验证</el-button>
          </div>
        </el-form-item>
      </el-form>
    </div>
    <div class="body" v-loading="loading">
      <me-code v-model:value="result" read-only/>
    </div>

  </div>
</template>

<style scoped lang="scss">
.redis-tauri {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .body {
    flex-grow: 1;
    height: 0;
    border: 2px solid skyblue;
    //padding: 10px;
    //margin-top: 10px;
  }
}
</style>