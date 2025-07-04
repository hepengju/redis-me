import { createPinia } from 'pinia'
const pinia = createPinia()

export default function (app) {
  app.use(pinia)
}