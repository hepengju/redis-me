import {bus} from '@/utils/util.js'

// 安装给全局实例使用
export default function (app) {
  // 添加全局事件总线
  // on监听, emit发生
  // 参考: https://www.npmjs.com/package/mitt
  app.config.globalProperties.$bus = bus
}