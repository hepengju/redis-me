import MeButton from '@/components/MeButton.vue'
import MeCode from '@/components/MeCode.vue'
import MeIcon from '@/components/MeIcon.vue'
import MeFileInput from '@/components/MeFileInput.vue'
import '@/App.css'

export default function (app) {
  app.component('me-icon', MeIcon)
  app.component('me-button', MeButton)
  app.component('me-code', MeCode)
  app.component('me-file-input', MeFileInput)
}