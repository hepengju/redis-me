<script>
export default {
  props: {
    filterKeys: {type: Array, default: []}
  },

  methods: {
    getKey() {

    }
  }
}
</script>

<template>
  <div v-for="item in filterKeys" @click="getKey(item)" >
    <el-link icon="el-icon-key" underline="never">
      <span class="key">{{ item.key }}</span>
    </el-link>
  </div>
</template>

<style scoped lang="scss">
.key {
  //overflow: hidden;
  white-space: nowrap;
  //text-overflow: ellipsis;
}
</style>