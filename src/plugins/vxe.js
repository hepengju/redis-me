import VxeUIBase from 'vxe-pc-ui'
import 'vxe-pc-ui/es/style.css'

import VxeUITable from 'vxe-table'
import 'vxe-table/es/style.css'

export default function (app) {
  app.use(VxeUIBase)
  app.use(VxeUITable)
}