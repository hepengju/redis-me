<script setup>
import api from '@/api/index.js'
import NodeList from '@/views/ark/extops/redis-me/ext/NodeList.vue'
// 共享数据
const share = inject('share')

const autoBroadcast = ref(true)
const node  = ref('')
const hint = `
① 自动广播开启时 CONFIG SET 和 SLOWLOG RESET 命令会在所有节点执行<br>
② 正常情况下无需指定节点，仅在查看特定节点配置等特殊场景可手动指定节点
`.trim()

const prefix = computed(() =>
  node.value ? `\x1B[1;3;32m${node.value}> \x1B[0m` : '\x1B[1;3;32m$ \x1B[0m'
)

// 定制化执行命令
async function execCommand(command) {
  try {
    const res = await api.ark.extops.redis.execCommand(share.env, {command, node: node.value, autoBroadcast: autoBroadcast.value})
    if (res.code == 200) {
      const result = replaceEnter(res.data)
      return `\x1b[35;1m${result}\x1b[0m`
    } else {
      return `\x1b[31;1m(error) ${res.msg}\x1b[0m`
    }
  } catch (e) {
    return `\x1b[31;1m(error) ${e}\x1b[0m`
  }
}

function replaceEnter(data) {
  if (data == null || data == undefined) {
    return ''
  } else if (Array.isArray(data)) {
    return data.map(d => replaceEnter(d)).join('\r\n')
  } else {
    return data?.split('\n').join('\r\n')
  }
}
</script>

<template>
  <div class="redis-terminal">
    <me-xterm class="terminal" :exec-command="execCommand" :prefix/>
    <div class="node me-flex">
      <el-tooltip raw-content :content="hint" placement="top">
        <el-icon style="font-size: 16px;">
          <el-icon-question-filled/>
        </el-icon>
      </el-tooltip>
      <el-checkbox v-model="autoBroadcast" label="自动广播" border style="margin: 0 10px"/>
      <node-list v-model="node" clearable/>
    </div>
  </div>
</template>

<style scoped lang="scss">
.redis-terminal {
  height: 100%;
  overflow: hidden;
  position: relative;

  .terminal {
    height: 100%;
  }

  .node {
    position: absolute;
    right: 0;
    top: 0;
  }
}
</style>
