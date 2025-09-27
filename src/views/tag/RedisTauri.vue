<script setup>
import { invoke } from '@tauri-apps/api/core';

const command = ref('greet')
const param = ref('{"name": "RedisME"}')
const result = ref('')
const hint = ref('')

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

  invoke(command.value, paramJson)
      .then(data => {
        hint.value = "命令执行成功"
        result.value = data
      })
      .catch(error => {
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
          <el-input v-model="command" placeholder="请输入命令"></el-input>
        </el-form-item>
        <el-form-item label="参数">
          <el-input type="textarea" v-model="param" placeholder="请输入json格式参数"></el-input>
        </el-form-item>

        <el-form-item label="提示">
          <div class="me-flex" style="width: 100%">
            <el-text type="success">{{hint}}</el-text>
            <el-button type="primary" @click="invokeCommand">验证</el-button>
          </div>
        </el-form-item>
      </el-form>
    </div>
    <div class="body">
      {{result}}
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
    padding: 10px;
    margin-top: 10px;
  }
}
</style>