<script>
export default {
  props: {
    vertical: {type: Boolean, default: false},
    justifyContent: {type: String, default: 'space-between'},
    alignItems: {type: String, default: ''}
  },
  computed: {
    style() {
      return ({
        display: 'flex',
        flexDirection: this.vertical ? 'column' : 'row',
        justifyContent: this.justifyContent,
        alignItems: this.alignItems,
      })
    }
  }
}
</script>

<template>
  <div :style="style">
    <slot></slot>
  </div>
</template>
