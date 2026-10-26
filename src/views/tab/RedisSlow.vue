<script setup lang="ts">
// #region 导入
import type { FormItemRule } from 'element-plus'
import { computed, inject, nextTick, reactive, ref, useTemplateRef, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import type { MeColumn } from '@/components/me-table-column'
import MeWebsite from '@/components/MeWebsite.vue'
import { shareProvideKey } from '@/types/me-interface'
import type { RedisSlowLog } from '@/types/tauri-specta'
// 官网参考: https://redis.ac.cn/docs/latest/commands/slowlog-get/
import { meCopy, meCommands, meOk } from '@/utils/util'
import NodeList from '@/views/ext/NodeList.vue'
// #endregion

// #region 核心状态
const { t } = useI18n()
// 共享数据
const share = inject(shareProvideKey)!
const canEdit = computed(() => !share.readonly)

const slowerThan = ref(10000)
const slowerMaxLen = ref(128)
const slowerGetCount = ref(Math.min(slowerMaxLen.value, 200))
const keyword = ref('')
const loading = ref(false)
const dataList = ref<RedisSlowLog[]>([])
const node = ref('')

// 最小为1
watchEffect(() => {
  if (slowerGetCount.value < 1) slowerGetCount.value = 1
})

// 列描述：展示与导出文本单一来源；关键词（command/client/clientName）与节点列头筛选均由 MeTable 内部处理；排序交给 MeTable（default-sort 时间倒序，与后端返回顺序一致）
const slowColumns = computed<MeColumn<RedisSlowLog>[]>(() => [
  { key: 'time', prop: 'time', title: t('redisSlow.time'), width: 180 },
  {
    key: 'cost',
    prop: 'cost',
    title: t('redisSlow.cost'),
    width: 90,
    align: 'right',
    formatter: row => `${Math.round(row.cost ?? 0)} ms`,
  },
  {
    key: 'command',
    prop: 'command',
    title: t('redisSlow.command'),
    minWidth: 200,
    searchable: true,
  },
  {
    key: 'clientName',
    prop: 'clientName',
    title: t('redisSlow.clientName'),
    width: 140,
    searchable: true,
  },
  { key: 'client', prop: 'client', title: t('redisSlow.client'), width: 180, searchable: true },
  // 集群下才需要区分节点
  ...(share.conn?.cluster
    ? [
        {
          key: 'node',
          prop: 'node',
          title: t('redisSlow.node'),
          width: 180,
          // 列头筛选：MeTable 自动去重生成选项并内部过滤
          filterable: true,
        },
      ]
    : []),
])

async function apiConfigGet() {
  const data = await meCommands.configGet(share.conn!.id, 'slowlog*', node.value)
  slowerThan.value = Number.parseInt(String(data['slowlog-log-slower-than'] ?? '0'), 10)
  slowerMaxLen.value = Number.parseInt(String(data['slowlog-max-len'] ?? '0'), 10)
}

async function apiSlowLog() {
  const data = await meCommands.slowLog(share.conn!.id, slowerGetCount.value, node.value)
  dataList.value = data || []
}

async function refresh() {
  loading.value = true
  try {
    await apiConfigGet()
    await apiSlowLog()
  } finally {
    loading.value = false
  }
}
refresh()
// #endregion

// #region 编辑操作
// 编辑慢参数
const formRef = useTemplateRef('formRef')
const editShow = ref(false)
const editLoading = ref(false)
const form = reactive({ slowerThan: 10, slowerMaxLen: 128 })
const commandList = computed(() => [
  `CONFIG SET slowlog-log-slower-than ${form.slowerThan === -1 ? -1 : form.slowerThan * 1000}`,
  `CONFIG SET slowlog-max-len ${form.slowerMaxLen}`,
])
const slowerThanNote = computed(() => {
  if (form.slowerThan === -1) return t('redisSlow.slowerThanDisabled')
  if (form.slowerThan === 0) return t('redisSlow.slowerThanRecordAll')
  return ''
})

function openEditDialog() {
  form.slowerThan = slowerThan.value / 1000 // 微秒转毫秒
  form.slowerMaxLen = slowerMaxLen.value
  nextTick(() => {
    editShow.value = true
  })
}

async function saveSlowParam() {
  formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    editLoading.value = true
    try {
      // 保存慢日志阈值（毫秒转微秒）
      await meCommands.configSet(
        share.conn!.id,
        'slowlog-log-slower-than',
        String(form.slowerThan === -1 ? -1 : form.slowerThan * 1000),
        '*',
      )
      // 保存慢日志最大长度
      await meCommands.configSet(share.conn!.id, 'slowlog-max-len', String(form.slowerMaxLen), '*')
      meOk(t('redisSlow.saveOk'))
      await refresh()
      editShow.value = false
    } finally {
      editLoading.value = false
    }
  })
}

const rules = computed(() => ({
  slowerThan: [
    { required: true, message: t('redisSlow.slowerThanRequired') },
    {
      validator: (
        _rule: FormItemRule,
        value: unknown,
        callback: (error?: string | Error) => void,
      ) => {
        if (Number(value) < -1) {
          callback(new Error(t('redisSlow.slowerThanRequired')))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  slowerMaxLen: [{ required: true, message: t('redisSlow.slowerMaxLenRequired') }],
}))
// #endregion
</script>

<template>
  <div class="redis-slow">
    <div class="me-flex header">
      <div class="me-flex">
        <el-dropdown placement="bottom-start" :hide-on-click="false" :teleported="false">
          <el-button icon="el-icon-data-board">{{ t('redisSlow.slowParam') }}</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item>
                <el-input :value="slowerThan / 1000" style="width: 150px" disabled>
                  <template #prepend>
                    <el-tooltip
                      placement="top-end"
                      :content="t('redisSlow.slowerThanHint')"
                      :show-after="1000">
                      <div>{{ t('redisSlow.slowerThan') }}</div>
                    </el-tooltip>
                  </template>
                  <template #append>ms</template>
                </el-input>
              </el-dropdown-item>

              <el-dropdown-item>
                <el-input v-model.number="slowerMaxLen" style="width: 150px" disabled>
                  <template #prepend>
                    <el-tooltip
                      placement="top-end"
                      :content="t('redisSlow.slowerMaxLenHint')"
                      :show-after="1000">
                      <div>{{ t('redisSlow.slowerMaxLen') }}</div>
                    </el-tooltip>
                  </template>
                  <template #append>{{ t('redisSlow.unit') }}</template>
                </el-input>
              </el-dropdown-item>

              <el-dropdown-item>
                <el-input v-model.number="slowerGetCount" style="width: 150px">
                  <template #prepend>{{ t('redisSlow.slowerGetCount') }}</template>
                  <template #append>{{ t('redisSlow.unit') }}</template>
                </el-input>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <me-button
          icon="el-icon-edit"
          :info="t('redisSlow.editSlowParam')"
          style="margin-left: 10px"
          v-if="canEdit"
          placement="top"
          @click="openEditDialog" />
        <node-list v-model="node" clearable style="margin-left: 10px" @change="refresh" />
        <me-website to="slowlog" />
      </div>

      <div>
        <el-input
          v-model="keyword"
          :placeholder="t('redisSlow.keyword')"
          style="width: 300px; margin-right: 10px"
          clearable />
        <el-button icon="el-icon-search" @click="refresh" type="primary" :loading="loading" />
      </div>
    </div>
    <div class="table">
      <me-table
        v-loading="loading"
        :data="dataList"
        :keyword="keyword"
        :columns="slowColumns"
        :default-sort="{ prop: 'time', order: 'descending' }"
        export-name="slowlog" />
    </div>

    <!-- 编辑慢参数弹框 -->
    <el-dialog
      :title="t('redisSlow.editSlowParam')"
      v-model="editShow"
      align-center
      width="450px"
      destroy-on-close
      draggable>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="t('redisSlow.slowerThan')" prop="slowerThan">
          <div style="width: 100%">
            <el-input-number
              v-model="form.slowerThan"
              :min="-1"
              :precision="0"
              style="width: 150px" />
            <el-text type="info" style="margin-left: 30px">
              <template v-if="slowerThanNote">（{{ slowerThanNote }}）</template>
              <template v-else> {{ form.slowerThan * 1000 }} μs </template>
            </el-text>
          </div>
        </el-form-item>

        <el-form-item :label="t('redisSlow.slowerMaxLen')" prop="slowerMaxLen">
          <el-input-number
            v-model="form.slowerMaxLen"
            :min="1"
            :precision="0"
            :max="1000000"
            style="width: 150px" />
        </el-form-item>

        <el-form-item :label="t('redisConfig.command')">
          <div v-for="(cmd, index) in commandList" :key="index">
            <el-text @click="meCopy(cmd)" style="cursor: pointer" :style="{ color: share.color }">{{
              cmd
            }}</el-text>
            <br v-if="index < commandList.length - 1" />
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="me-dialog-footer">
          <!-- 慢参数 CONFIG SET 固定广播所有节点（仅集群显示） -->
          <me-icon
            v-if="share.conn?.cluster"
            class="footer-tip"
            icon="el-icon-info-filled"
            :name="t('clusterUpdateAllTip')" />
          <div class="footer-btns">
            <el-button @click="editShow = false">{{ t('cancel') }}</el-button>
            <el-button type="primary" :loading="editLoading" @click="saveSlowParam">{{
              t('save')
            }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.redis-slow {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .header {
    :deep(.el-input-group__prepend) {
      //padding: 0 14px;
      width: 60px;
    }
    :deep(.el-input-group__append) {
      width: 40px;
    }
  }

  .table {
    margin-top: 10px;
    flex-grow: 1;
    height: 0;
  }
}
</style>
