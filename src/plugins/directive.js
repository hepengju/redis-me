import {useClipboard} from '@vueuse/core'
import {meOk} from '@/utils/util.js'

export default function (app) {
  app.directive('copy', copy)
}

// v-copy
const copy = {
  mounted(el, binding) {
    el.$value = binding.value
    el.handler = () => {
      useClipboard({legacy: true}).copy(el.$value)
      meOk('复制成功')
    }
    el.addEventListener('click', el.handler)
  },
  updated(el, binding){
    el.$value = binding.value
  },
  unmounted(el){
    el.removeEventListener('click', el.handler)
  }
}