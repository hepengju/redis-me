import '@/App.css'
import MeButton from '@/components/MeButton.vue'
import MeCode from '@/components/MeCode.vue'
import MeIcon from '@/components/MeIcon.vue'
import MeFileInput from '@/components/MeFileInput.vue'
import MeXterm from '@/components/MeXterm.vue'
import MeContext from '@/components/MeContext.vue'
import MeTable from '@/components/MeTable.vue'
import MeDialog from '@/components/MeDialog.vue'

export default function (app) {
  app.component('me-icon', MeIcon)
  app.component('me-button', MeButton)
  app.component('me-code', MeCode)
  app.component('me-xterm', MeXterm)
  app.component('me-context', MeContext)
  app.component('me-file-input', MeFileInput)
  app.component('me-table', MeTable)
  app.component('me-dialog', MeDialog)
}