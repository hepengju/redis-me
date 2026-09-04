import '@/App.css'
import type { App } from 'vue'

import MeButton from '../components/MeButton.vue'
import MeCode from '../components/MeCode.vue'
import MeContext from '../components/MeContext.vue'
import MeDialog from '../components/MeDialog.vue'
import MeFileInput from '../components/MeFileInput.vue'
import MeIcon from '../components/MeIcon.vue'
import MeScanControl from '../components/MeScanControl.vue'
import MeTable from '../components/MeTable.vue'
import MeTabPane from '../components/MeTabPane.vue'
import MeWebsite from '../components/MeWebsite.vue'
import MeXterm from '../components/MeXterm.vue'

export default function setupMe(app: App): void {
  app.component('me-icon', MeIcon)
  app.component('me-scan-control', MeScanControl)
  app.component('me-button', MeButton)
  app.component('me-code', MeCode)
  app.component('me-xterm', MeXterm)
  app.component('me-context', MeContext)
  app.component('me-file-input', MeFileInput)
  app.component('me-table', MeTable)
  app.component('me-dialog', MeDialog)
  app.component('me-tab-pane', MeTabPane)
  app.component('me-website', MeWebsite)
}
