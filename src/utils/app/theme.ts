/** 界面语言、暗色主题 */
import { useDark } from '@vueuse/core'
import { computed } from 'vue'

// 是否是中文模式
export const isZh = computed(() => {
  const language =
    meTauri.settings.language === 'system' ? meTauri.systemLanguage : meTauri.settings.language
  return language?.startsWith('zh') ?? false
})

// 是否黑色主题
export const isDark = useDark()
