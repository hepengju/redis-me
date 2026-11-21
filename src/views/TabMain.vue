<script setup lang="ts">
import { computed, inject, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'

import { shareProvideKey } from '@/types/me-interface'
import {
  DEFAULT_TABS_VISIBLE,
  TAB_NAMES,
  isTabAvailable,
  isTabName,
  normalizeTabsVisible,
  resolveTabsVisible,
  type TabAvailabilityCtx,
  type TabName,
} from '@/utils/app/tabs'
import { isConnMinimalMode } from '@/utils/conn'
import RedisChart from '@/views/tab/RedisChart.vue'
import RedisInfo from '@/views/tab/RedisInfo/index.vue'
import RedisACL from '@/views/tab/RedisInfo/RedisACL.vue'
import RedisClient from '@/views/tab/RedisInfo/RedisClient.vue'
import RedisConfig from '@/views/tab/RedisInfo/RedisConfig.vue'
import RedisMemory from '@/views/tab/RedisMemory.vue'
import RedisMonitor from '@/views/tab/RedisMonitor.vue'
import RedisNotify from '@/views/tab/RedisNotify.vue'
import RedisPubsub from '@/views/tab/RedisPubsub.vue'
import RedisSearch from '@/views/tab/RedisSearch.vue'
import RedisSlow from '@/views/tab/RedisSlow.vue'
import RedisTerminal from '@/views/tab/RedisTerminal.vue'
import RedisValue from '@/views/tab/RedisValue/index.vue'
import RedisWorkbench from '@/views/tab/RedisWorkbench.vue'

const share = inject(shareProvideKey)!
const { t } = useI18n()

/** 「恢复默认」菜单项的命令值，与页签名不会重名 */
const RESET_COMMAND = 'reset-tabs'

/** 页签注册表：键值/信息不 lazy（切连接后立即要可见），其余首次进入再挂载 */
const TAB_META: Record<TabName, { icon: string; component: Component; lazy?: boolean }> = {
  info: { icon: 'el-icon-calendar', component: RedisInfo },
  value: { icon: 'el-icon-memo', component: RedisValue },
  terminal: { icon: 'me-icon-terminal', component: RedisTerminal, lazy: true },
  memory: { icon: 'me-icon-memory', component: RedisMemory, lazy: true },
  slow: { icon: 'me-icon-slow', component: RedisSlow, lazy: true },
  pubsub: { icon: 'me-icon-pubsub', component: RedisPubsub, lazy: true },
  chart: { icon: 'el-icon-data-line', component: RedisChart, lazy: true },
  acl: { icon: 'el-icon-user', component: RedisACL, lazy: true },
  config: { icon: 'el-icon-wallet', component: RedisConfig, lazy: true },
  search: { icon: 'el-icon-search', component: RedisSearch, lazy: true },
  workbench: { icon: 'me-icon-copy-command', component: RedisWorkbench, lazy: true },
  client: { icon: 'me-icon-conn', component: RedisClient, lazy: true },
  notify: { icon: 'el-icon-bell', component: RedisNotify, lazy: true },
  monitor: { icon: 'el-icon-monitor', component: RedisMonitor, lazy: true },
}

/** 可用性：极简模式只留键值/终端/工作台；其余按 INFO / ACL / RediSearch / MEMORY USAGE 能力位 */
const ctx = computed<TabAvailabilityCtx>(() => ({
  minimal: isConnMinimalMode(share.conn),
  infoSupported: share.capabilities.infoSupported,
  searchSupported: share.capabilities.redisSearchSupported,
  memorySupported: share.capabilities.memoryUsageSupported,
  aclSupported: share.capabilities.aclSupported,
}))

/** 可见集合持久化在全局设置里；渲染顺序统一按注册顺序（与下拉菜单一致），集合只决定开关 */
const visibleNames = computed(() => resolveTabsVisible(meTauri.settings.tabsVisible))

/** 「更多页签」菜单：按注册顺序列出可用页签，勾选只切换对号，项的位置不随勾选变化 */
const availableTabs = computed(() => TAB_NAMES.filter(name => isTabAvailable(name, ctx.value)))

/** 页签栏：可见且当前连接可用的页签；全不可用时兜底第一个可用页签，避免页签栏空白 */
const paneTabs = computed(() => {
  const list = availableTabs.value.filter(name => visibleNames.value.includes(name))
  return list.length ? list : availableTabs.value.slice(0, 1)
})

function isVisible(name: TabName): boolean {
  return visibleNames.value.includes(name)
}

/** 只剩一个页签时不允许取消，保证页签栏不空 */
function isOnlyVisible(name: TabName): boolean {
  return isVisible(name) && paneTabs.value.length <= 1
}

/** 当前已是默认集合时「恢复默认」置灰 */
const isDefaultVisible = computed(
  () =>
    visibleNames.value.length === DEFAULT_TABS_VISIBLE.length &&
    visibleNames.value.every((name, index) => name === DEFAULT_TABS_VISIBLE[index]),
)

function setVisible(list: TabName[]): void {
  meTauri.settings.tabsVisible = normalizeTabsVisible(list, DEFAULT_TABS_VISIBLE)
}

/** 恢复默认页签集合；当前页签被隐藏时由 paneTabs 的 watch 落到第一个页签 */
function resetTabs(): void {
  if (isDefaultVisible.value) return
  setVisible([...DEFAULT_TABS_VISIBLE])
}

/** 更多页签菜单：未显示则加入可见集合并切过去，已显示则从可见集合移除 */
function onTabMenuCommand(command: string | number | object): void {
  if (command === RESET_COMMAND) {
    resetTabs()
    return
  }
  if (!isTabName(command) || !isTabAvailable(command, ctx.value)) return
  if (!isVisible(command)) {
    setVisible([...visibleNames.value, command])
    share.tabName = command
    return
  }
  const list = paneTabs.value
  if (list.length <= 1) return
  // 隐藏当前页签时切到左邻，无左邻取右邻
  const idx = list.indexOf(command)
  // 基于可见集合而不是页签栏：可见集合里可能还有当前连接用不上的页签（如连了无 INFO 权限的服务），必须保留
  setVisible(visibleNames.value.filter(name => name !== command))
  if (share.tabName === command) {
    const remain = list.filter(name => name !== command)
    share.tabName = remain[Math.max(0, idx - 1)] ?? 'value'
  }
}

// 跨页跳转（值区创建索引、搜索点键、内存/工作台回键值、信息页 openTab）目标未显示时自动打开
watch(
  () => share.tabName,
  name => {
    if (!isTabName(name)) return
    if (!isTabAvailable(name, ctx.value)) {
      // 目标页签当前连接用不上（跳转入口的能力位条件漏判）：回落到第一个页签，不让页签区空白
      share.tabName = paneTabs.value[0] ?? 'value'
      return
    }
    if (!visibleNames.value.includes(name)) setVisible([...visibleNames.value, name])
  },
)

// 能力或可见集合变化后当前页签被过滤掉时，落到第一个页签
watch(
  paneTabs,
  list => {
    if (!list.some(name => name === share.tabName)) share.tabName = list[0] ?? 'value'
  },
  { immediate: true },
)
</script>

<template>
  <div class="redis-tab-wrap">
    <el-tabs v-model="share.tabName" class="redis-tab">
      <me-tab-pane
        v-for="name in paneTabs"
        :key="name"
        :name
        :icon="TAB_META[name].icon"
        :lazy="TAB_META[name].lazy">
        <component :is="TAB_META[name].component" />
      </me-tab-pane>
    </el-tabs>

    <!-- 页签按需显示：勾选即显示并切换，取消即隐藏；页签多时可滚动 -->
    <el-dropdown
      class="tab-menu-entry"
      trigger="click"
      placement="bottom-end"
      max-height="70vh"
      :hide-on-click="false"
      @command="onTabMenuCommand">
      <button type="button" class="tab-menu-btn">
        <me-icon icon="el-icon-more-filled" />
      </button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="name in availableTabs"
            :key="name"
            :command="name"
            :disabled="isOnlyVisible(name)">
            <me-icon :icon="TAB_META[name].icon" :name="t('tabMain.' + name)" />
            <me-icon v-if="isVisible(name)" icon="el-icon-check" class="tab-menu-check" />
          </el-dropdown-item>
          <el-dropdown-item divided :command="RESET_COMMAND" :disabled="isDefaultVisible">
            <me-icon icon="el-icon-refresh-left" :name="t('tabMain.resetVisible')" />
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<style scoped lang="scss">
.redis-tab-wrap {
  position: relative;
  height: 100%;
}

.redis-tab {
  // border: 1px solid var(--el-border-color);
  // border-radius: var(--el-border-radius-base);
  padding: 0 5px 0 3px;

  height: 100%;

  :deep(.el-tab-pane) {
    height: 100%;
  }

  :deep(.el-tabs__item) {
    height: 30px;
    align-items: start;
    padding: 0 12px;
  }

  :deep(.el-tabs__header) {
    margin: 0 0 10px;
    padding-top: 2px;
  }

  // EP 的 nav-wrap 内置 margin-bottom:-1px，页签栏实际占位 2+30-1=31px，
  // 比左侧连接栏 32px 少 1px，导致右列输入框顶边比左列高 1px；归零后左右完全对齐。
  // 右侧留出 30px 给「更多页签」入口，宽度不够时 EP 的左右箭头停在入口左侧，不会钻到按钮下面
  :deep(.el-tabs__nav-wrap) {
    margin-bottom: 0;
    margin-right: 30px;
  }

  // 宽度不够时 EP 显示的左右滚动箭头默认定位在 40px 高的行内（line-height:40px），
  // 而页签已改为 30px 高、内容顶部对齐，箭头会明显偏低；
  // 这里让箭头行高与页签文字（约 20px 高）垂直居中对齐
  :deep(.el-tabs__nav-prev),
  :deep(.el-tabs__nav-next) {
    top: 2px; // 抵消 header 的 padding-top，与页签内容同一基准线
    height: 20px;
    line-height: 20px;
    font-size: 14px;
  }
}

// 更多页签入口：与 30px 高的页签行垂直居中（header 的 padding-top: 2px 已计入）
.tab-menu-entry {
  position: absolute;
  top: 6px;
  right: 5px;
}

.tab-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;

  &:hover {
    background: var(--el-fill-color-light);
    color: var(--el-color-primary);
  }
}

// 已显示的页签在菜单里打勾，靠右对齐；文字较长时也能与名称留出间距
.tab-menu-check {
  margin-left: auto;
  padding-left: 8px;
  color: var(--el-color-primary);
}
</style>
