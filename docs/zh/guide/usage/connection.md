# 连接

[RedisME](https://www.hepengju.com) 的连接管理简洁明了，优雅大方。

## 功能简述

- **连接列表**：模糊筛选，**颜色定制**，关键属性展示，支持拖动排序，复制连接等
- **导出导入**：导出现有连接到json文件及导入json文件
- **新增连接**：支持SSH、SSL、只读、集群、哨兵等配置，测试连接
  - **SSH**：SSH隧道模式适用于Redis服务器在内网，无法直接访问，需要通过跳板机访问；**单机 / 集群 / 哨兵**均可使用
  - **SSL**：Redis服务器开启了TLS/SSL端口时使用，可能需要提供客户端证书和私钥
  - **集群**：只需填写任一节点的地址，自动识别集群中的所有节点
  - **哨兵**：多个哨兵任选其一即可，地址、端口、密码请填写哨兵配置
  - **只读**：所有编辑、删除、写入按钮被隐藏。可通过锁图标**动态切换只读/可写模式**

![table.png](../../../public/images/connnection/table.png)
![readonly.png](../../../public/images/connnection/readonly.png)
![simple.png](../../../public/images/connnection/simple.png)
![ssh.png](../../../public/images/connnection/ssh.png)
![ssl.png](../../../public/images/connnection/ssl.png)
![sentinel.png](../../../public/images/connnection/sentinel.png)
