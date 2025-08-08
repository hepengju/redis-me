<script setup>
</script>

<template>
  <div class="redis-terminal">
    <me-xterm class="terminal"></me-xterm>
  </div>
</template>

<style scoped lang="scss">
.redis-terminal {
  height: 100%;
  overflow: hidden;

  .terminal {
    height: 100%;
  }
}
</style>