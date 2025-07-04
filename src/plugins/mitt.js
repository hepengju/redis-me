import mitt from 'mitt'
const emitter = mitt()
export default function (app) {
  // 添加全局事件总线
  // on监听, emit发生
  // 参考: https://www.npmjs.com/package/mitt
  app.config.globalProperties.$bus = emitter
}