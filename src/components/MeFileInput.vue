<script setup>
import {open} from '@tauri-apps/plugin-dialog';

const model = defineModel({ type: String })

async function openDialog() {
  const file = await open({multiple: false, directory: false,});
  if (file) {
    model.value = file
  }
}
</script>
<template>
  <el-input v-bind="$attrs" v-model="model">
    <template #append>
      <el-button type="primary" @click="openDialog">...</el-button>
    </template>
  </el-input>
</template>