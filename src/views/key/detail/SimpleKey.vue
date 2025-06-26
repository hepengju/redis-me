<template>
  <div v-for="item in filterKeys" class="key">
    {{item.key}}
  </div>
</template>

<script setup>

const keys = reactive([
  {
    "key": "1696776643269361666",
    "bytes": "MTY5Njc3NjY0MzI2OTM2MTY2Ng=="
  },
  {
    "key": "2024-10-28:wsd:http://10.105.100.84:5000/wsd:API_WSD_000005-v2",
    "bytes": "MjAyNC0xMC0yODp3c2Q6aHR0cDovLzEwLjEwNS4xMDAuODQ6NTAwMC93c2Q6QVBJX1dTRF8wMDAwMDUtdjI="
  },
  {
    "key": "2024-10-29:wsd:http://10.105.100.84:5000/edb:API_WSD_000048-v2",
    "bytes": "MjAyNC0xMC0yOTp3c2Q6aHR0cDovLzEwLjEwNS4xMDAuODQ6NTAwMC9lZGI6QVBJX1dTRF8wMDAwNDgtdjI="
  },
  {
    "key": "2024-10-29:wsd:http://10.105.100.84:5000/edb:API_WSD_000056-v2",
    "bytes": "MjAyNC0xMC0yOTp3c2Q6aHR0cDovLzEwLjEwNS4xMDAuODQ6NTAwMC9lZGI6QVBJX1dTRF8wMDAwNTYtdjI="
  },
  {
    "key": "2024-10-29:wss:http://10.105.100.84:5000/wss:API_WSS_000018-v2",
    "bytes": "MjAyNC0xMC0yOTp3c3M6aHR0cDovLzEwLjEwNS4xMDAuODQ6NTAwMC93c3M6QVBJX1dTU18wMDAwMTgtdjI="
  },
  {
    "key": "2024-10-29:wss:http://10.105.100.84:5000/wss:API_WSS_000090-v2",
    "bytes": "MjAyNC0xMC0yOTp3c3M6aHR0cDovLzEwLjEwNS4xMDAuODQ6NTAwMC93c3M6QVBJX1dTU18wMDAwOTAtdjI="
  },
  {
    "key": "2024-10-30:wss:http://10.105.100.84:5000/wss:API_WSS_000020-v2",
    "bytes": "MjAyNC0xMC0zMDp3c3M6aHR0cDovLzEwLjEwNS4xMDAuODQ6NTAwMC93c3M6QVBJX1dTU18wMDAwMjAtdjI="
  }
])
const filterKeys = computed(() => keys)

</script>
<style scoped lang="scss">
.key {
  margin: 1px 10px;
  cursor: pointer;
  font-size: 14px;
  color: var(--el-color-primary);

  // 省略号
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>