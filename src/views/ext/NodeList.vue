<script setup lang="ts">
import {inject} from 'vue'

const node = defineModel()
const share = inject('share')
</script>

<template>
  <el-select v-model="node" style="width: 220px" placeholder="指定节点【可选】" v-if="share.nodeList.length > 0">
    <el-option v-for="item in share.nodeList" :key="item.node" :value="item.node">
      <el-tag :type="item.isMaster ? 'primary' : 'info'" hit>{{item.node}} ({{item.isMaster ? '主' : '从'}})</el-tag>
    </el-option>
  </el-select>
</template>
