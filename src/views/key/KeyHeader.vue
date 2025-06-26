<script setup lang="ts">
// 获取连接
const connName = ref('')
const connList = ref([])

</script>

<template>
  <div class="container">
    <el-select v-model="connName" filterable class="conn" :disabled="connList.length == 0" placeholder="请选择连接">
      <el-option v-for="item in connList" :label="item.name" :value="item.name"></el-option>
    </el-select>

    <div class="btns">
      <el-tooltip content="新建连接">
        <el-button type="primary"><el-icon><el-icon-plus/></el-icon></el-button>
      </el-tooltip>
      <el-dropdown style="margin-left: 10px" size="small" placement="bottom-end">
        <el-button type="success"><el-icon><el-icon-operation/></el-icon></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item>        <el-icon><my-icon-shutdown/>            </el-icon><span>关闭连接</span></el-dropdown-item>
            <el-dropdown-item>        <el-icon><el-icon-edit/>                </el-icon><span>编辑连接</span></el-dropdown-item>
            <el-dropdown-item>        <el-icon><el-icon-delete/>              </el-icon><span>删除连接</span></el-dropdown-item>
            <el-dropdown-item>        <el-icon><el-icon-copy-document/>       </el-icon><span>复制连接</span></el-dropdown-item>


            <el-dropdown-item divided><el-icon><el-icon-data-board/>          </el-icon><span>标记颜色</span></el-dropdown-item>
            <el-dropdown-item>        <el-icon><my-icon-memory />             </el-icon><span>内存分析</span></el-dropdown-item>
            <el-dropdown-item>        <el-icon><my-icon-hour-glass/>          </el-icon><span>慢查询</span></el-dropdown-item>

            <el-dropdown-item divided><el-icon><el-icon-download/>            </el-icon><span>导入键</span></el-dropdown-item>
            <el-dropdown-item>        <el-icon><el-icon-warn-triangle-filled/></el-icon><span>删除所有键</span></el-dropdown-item>


            <el-dropdown-item divided><el-icon><el-icon-setting/>             </el-icon><span>基础设置</span></el-dropdown-item>
            <el-dropdown-item>        <el-icon><el-icon-odometer/>            </el-icon><span>命令日志</span></el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped lang="scss">
.container {
  display: flex;

  .conn {
    flex-shrink: 1;
  }

  .btns {
    margin-left: 10px;
    flex-shrink: 0;
  }
}
</style>