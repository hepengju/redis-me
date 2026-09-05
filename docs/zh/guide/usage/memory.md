# 内存分析

RedisME 的内存分析基于Redis的`memory usage`命令实现，方便寻找大键。

## 功能简述

- 大键查询: 分析满足条件的键，显示键类型、名称、大小等信息，支持模糊匹配
- 大键操作: 复制键名称，查看值，删除键，多选批量删除键
- 扫描过程: 进度环可暂停/继续，右侧按钮在「开启分析 / 停止」间切换；表格边扫边展示
- 参数配置: 支持配置每次扫描数量、轮间睡眠、大小阈值
- 文件夹快速内存分析：右键点击左侧键的文件夹，快速分析其内部键的内存使用情况

![main.png](../../../public/images/memory/main.png)
![param.png](../../../public/images/memory/param.png)
![folder.png](../../../public/images/memory/folder.png)
