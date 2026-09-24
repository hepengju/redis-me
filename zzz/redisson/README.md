# RedissonCodec —— 在 RedisME 中查看/编辑 Redisson 序列化的值

Redisson 客户端默认使用二进制序列化（4.x 默认 Kryo5Codec，3.x 默认 MarshallingCodec）写入 Redis，
这类值在 RedisME 中只能看到 Hex。本工具通过 RedisME 的**自定义编解码**功能，把 Redisson 序列化的值
转成可编辑的 JSON 展示，并支持编辑后写回（字节级兼容，Redisson 端可正常读取）。

## 特性

- **零依赖瘦 jar**（约 10KB）：不打包任何第三方库，运行时复用你项目自带的 Redisson/Kryo/Jackson jar，
  因此天然匹配你的 Redisson 版本与序列化配置
- **codec 自动探测**：依次尝试 `Kryo5Codec` → `MarshallingCodec`，decode 后再 encode 校验往返长度，避免 Kryo 把别的 codec 的字节误读成无关类型
- **类型保真**：`List<Person>` 等泛型结构编辑回写后元素类型不丢失
- **兼容性**：JDK / JRE 8+ 即可运行；Redisson 3.16+ / 4.x 均支持

## 目录结构

```
redisson/
├── redisson-codec.jar          编解码入口（无需改动）
├── run-redisson-codec.cmd      Windows 启动脚本（RedisME 命令填这个）
├── run-redisson-codec.sh       Linux / macOS 启动脚本
├── lib/                        ← 你需要填充：
│   ├── *.jar                   项目的全部运行依赖 jar
│   └── classes/                项目的业务 classes（含包目录）
└── source/                     源码工程（仅在需要重新构建时使用）
```

## 使用步骤

### 1. 填充 lib 目录

把你项目中 Redisson 用到的依赖 jar 全部拷入 `lib/`。
用 Maven 最简单，在你的项目目录执行：

```bash
mvn dependency:copy-dependencies -DoutputDirectory=<本目录>/redisson/lib
```

> 注意：`jackson-databind` **不是** Redisson 的传递依赖，若上面命令没有拷到它，
> 请手动补入（RedisME 展示 JSON 依赖它，版本 2.10+ 即可）。

Gradle 可用 `copyDependencies` 类插件，或直接把打包产物 lib 目录里的 jar 拷入。

### 2. 拷贝业务 classes

Redisson 反序列化你的业务对象（如 `Person`）需要对应的 class 文件。
把项目编译输出目录**内部**的内容拷入 `lib/classes`，保持包目录结构，例如：

```bash
# Maven 项目
cp -r target/classes/. <本目录>/redisson/lib/classes/
```

结果应为 `lib/classes/com/yourcompany/xxx/Person.class` 这样的结构。

### 3. 在 RedisME 中配置

打开 RedisME「设置 → 自定义编解码 → 添加」：

- **命令**：`run-redisson-codec.cmd`（Windows）或 `run-redisson-codec.sh`（其他系统）的完整路径
- 保存后，在键值详情页即可看到 Redisson 值被解析为 JSON

### 4.（可选）指定 codec

如果你的 Redisson `Config` 里显式配置了其他 codec（自动探测失败或想跳过探测），
设置环境变量 `REDISSON_CODEC_CLASS` 为其类全名后再启动 RedisME，例如：

```
REDISSON_CODEC_CLASS=org.redisson.codec.Kryo5Codec
```

## JSON 格式说明

展示格式为 `["根类全名", 值]`，例如：

```json
[
  "java.util.ArrayList",
  [
    ["com.example.Person", { "id": "1", "name": "zhangsan", "age": 33 }],
    ["com.example.Person", { "id": "2", "name": "lisi", "age": 44 }]
  ]
]
```

- 编辑时只改值的部分即可，**不要删除根类名和嵌套元素前面的类名**（回写依赖它们恢复类型）
- 新增嵌套对象时按同样格式 `["类全名", { ... }]` 书写

## 常见问题

**报错「请把包含该类的 jar 放入 lib 目录」/「无可用 codec」**
按提示补齐 `lib/` 中缺失的 jar。典型缺失：jackson-databind、kryo、netty-buffer、
jboss-marshalling / jboss-marshalling-river（3.x 默认 codec 需要）、objenesis、slf4j-api。
建议直接用 `mvn dependency:copy-dependencies` 一次拷全。

**解出来类型明显不对（例如 List 变成 `java.lang.Float`）**
Kryo5 可能对非 Kryo 字节“误读成功”。当前入口会再 encode 一次做往返长度校验，对不上就改试
`MarshallingCodec`。若仍不对，看项目 Redisson 版本：3.19 之前默认是 Marshalling，之后默认 Kryo5。
也可设环境变量跳过探测，例如：

```
REDISSON_CODEC_CLASS=org.redisson.codec.MarshallingCodec
```

**报 `ClassNotFoundException: com.xxx.YourClass`**
业务 classes 没放对：确认 `lib/classes` 下有完整包目录结构。

**stderr 有 SLF4J / sun.misc.Unsafe 警告**
可忽略，不影响功能（RedisME 只在失败时读取错误输出）。

**回写后 Redisson 端读取的类型变化？**
根部的 JDK 不可变集合（`List.of()` 等产生的 ImmutableCollections 类）回写后会变为
`ArrayList/LinkedHashSet/LinkedHashMap`（Jackson 无法实例化不可变集合）。
Kryo 流中记录的是具体类名，Redisson 按接口读取不受影响。

## 重新构建（开发者）

```bash
cd source
mvn clean package          # 产物 target/redisson-codec.jar（JDK 8 字节码，通用）
cp target/redisson-codec.jar ../
```
