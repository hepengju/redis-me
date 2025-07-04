<script>
import {apiConnList} from '@/utils/api.js'
import Setting from '@/views/key/detail/Setting.vue'
import SaveConn from '@/views/key/detail/SaveConn.vue'
import {nanoid} from 'nanoid'
import {randomString} from '@/utils/util.js'
import {CONN_REFRESH} from '@/utils/const.js'
import useGlobalStore from '@/utils/store.js'
import {mapStores} from 'pinia'

export default {
  components: {Setting, Conn: SaveConn},
  data() {
    return {
      connList: [],          // 连接列表
      conn: null,            // 当前连接

      dialog: {
        conn: false,         // 编辑连接
        setting: false,      // 基础设置
      },
    }
  },
  computed: {
    ...mapStores(useGlobalStore)
  },
  watch: {
    conn(newValue, _) {
      console.log('watch', newValue)
      this.global.conn = newValue
      this.$bus.emit(CONN_REFRESH)
    }
  },
  mounted() {
    this.getConnList()
  },
  methods: {
    // 获取连接
    getConnList() {
      this.connList = apiConnList()
      if (this.connList.length > 0) {
        this.conn = this.connList[0]
      }
    },

    // 保存连接
    saveConn(form, mode) {
      if (mode === 'add') {
        form.id = nanoid()
        if (!form.name) {
          form.name = form.host + '@' + form.port
        }

        if (this.connList.find(c => c.name === form.name)) {
          form.name += ' (' + randomString(3) + ')'
        }
        this.connList.push(form)
        this.$message.success('新增成功')
      } else if (mode === 'edit') {
        this.conn = form
        this.$message.success('保存成功')
      }
    },

    // 扩展命令
    handleCommand(command) {
      if (command === 'addConn') {
        this.dialog.conn = true
        this.$nextTick(() => this.$refs.connRef.open('add'))
      } else if (command === 'editConn') {
        this.dialog.conn = true
        this.$nextTick(() => this.$refs.connRef.open('edit', this.conn))
      } else if (command === 'deleteConn') {
        this.$confirm(`确认删除连接【${this.conn.name}】吗`, {type: 'warning'})
            .then(() => {
              const index = this.connList.findIndex(c => c.id === this.conn.id)
              if (index > -1) {
                this.connList.splice(index, 1)
              }
              this.conn = null
              this.$message.success('删除成功')
            })
            .catch(() => {
            })
      } else if (command === 'refreshConn') {
        this.$bus.emit(EVENT.CONN_REFRESH)
      } else if (command === 'setting') {
        this.dialog.setting = true
      }
    },
  },
}
</script>

<template>
  <div class="key-header">
    <el-select v-model="conn" placeholder="请选择连接" class="conn"
               filterable :disabled="connList.length == 0" value-key="id">
      <el-option v-for="item in connList" :label="item.name" :value="item" :key="item.id">
        <div :style="{color: item?.color}">{{ item.name }}</div>
      </el-option>

      <template #label="{ value }">
        <div :style="{color: conn?.color}">{{ value.name }}</div>
      </template>
      <template #prefix>
        <me-icon icon="me-icon-redis"/>
      </template>
    </el-select>

    <div class="btns">
      <el-dropdown placement="bottom-end" @command="handleCommand">
        <el-button type="success" icon="el-icon-operation"/>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="refreshConn" :disabled="conn === null"><me-icon name="刷新连接" icon="el-icon-refresh"/></el-dropdown-item>
            <el-dropdown-item command="addConn"><me-icon name="新增连接" icon="el-icon-plus"/></el-dropdown-item>
            <el-dropdown-item command="editConn" :disabled="conn === null"><me-icon name="编辑连接" icon="el-icon-edit"/></el-dropdown-item>
            <el-dropdown-item command="deleteConn" :disabled="conn === null"><me-icon name="删除连接" icon="el-icon-delete"/></el-dropdown-item>
            <el-dropdown-item command="appLog" divided><me-icon name="命令日志" icon="el-icon-stopwatch"/></el-dropdown-item>
            <el-dropdown-item command="setting"><me-icon name="基础设置" icon="el-icon-setting"/></el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>

  <!-- 每次编辑需要初始化表格，所以关闭后销毁 -->
  <Conn ref="connRef" v-if="dialog.conn" @success="saveConn" @closed="dialog.conn = false"/>

  <!-- 启动时需要初始化下主题和语言，因此组件要一致存在 -->
  <Setting :dialog="dialog"/>

</template>

<style scoped lang="scss">
.key-header {
  display: flex;

  .conn {
    flex-shrink: 1;
  }

  .btns {
    margin-left: 10px;
    flex-shrink: 0;
  }
}

// 避免点击后，鼠标浮动上去的outline（缺点：Tab键聚集到此按钮没有outline了）
.el-dropdown .el-button:focus-visible {
  outline: none;
}
</style>