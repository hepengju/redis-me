import {useClipboard} from '@vueuse/core'
import {ElMessage} from 'element-plus'

export default function (app) {
  app.directive('copy', copy)
}

// v-copy
const copy = {
  mounted(el, binding) {
    el.$value = binding.value
    el.handler = () => {
      useClipboard({legacy: true}).copy(el.$value)
      ElMessage({message: '复制成功', type: 'success'})
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