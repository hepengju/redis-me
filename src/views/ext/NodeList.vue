<script setup lang="ts">
import {inject, onMounted} from 'vue'

const share = inject('share')
const node = defineModel()
const emit = defineEmits(['update:modelValue'])

const {initNode} = defineProps({
  initNode: {type: Boolean, default: false}
})

if (initNode && share.nodeList.length > 0) {
  emit('update:modelValue', share.nodeList[0].node)
}
</script>

<template>
  <el-select v-model="node" style="width: 220px" placeholder="指定节点【可选】" v-if="share.nodeList.length > 0">
    <el-option v-for="item in share.nodeList" :key="item.node" :value="item.node">
      <el-tag effect="dark" :type="item.isMaster ? 'primary' : 'info'" hit>{{item.node}} ({{item.isMaster ? '主' : '从'}})</el-tag>
    </el-option>
  </el-select>
</template>
