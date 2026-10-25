#!/bin/sh
# ==========================================================================
# RedisME Redisson 编解码一键组装脚本（Linux / macOS）
#
# 换机器/新同事只需两步：
#   1. 在你的 Java 项目根目录执行：
#        <解压目录>/redisson/setup.sh --collect --with-classes
#      自动把依赖 jar 收进 lib/、业务 classes 收进 lib/classes/
#   2. 执行安装（把所有内容装到固定目录，并打印可粘贴的命令）：
#        <解压目录>/redisson/setup.sh --install
#
# 选项：
#   --collect         在当前目录执行 mvn，收集依赖 jar 到 lib/
#   --with-classes    mvn compile 后把 target/classes 拷入 lib/classes/
#   --install         把包内容安装到固定目录并打印 RedisME 命令路径
#   --dest <目录>     覆盖默认安装目录（默认 $HOME/redis/custom/redisson）
#
# 约定：所有机器使用同一安装目录，RedisME 里的命令路径每台机器一致，
#       配置只需粘贴一次。
# ==========================================================================

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LIBDIR="$SCRIPT_DIR/lib"
PROJECT_DIR=$(pwd)
DEFAULT_DEST="$HOME/redis/custom/redisson"
DEST=""
DO_COLLECT=""
DO_CLASSES=""
DO_INSTALL=""

usage() {
    cat <<EOF

RedisME Redisson 编解码一键组装

  第 1 步（在 Java 项目根目录）:  setup.sh --collect --with-classes
  第 2 步:                       setup.sh --install

选项:
  --collect          在当前目录执行 mvn，收集依赖 jar 到 lib/
  --with-classes     一并 mvn compile 并拷贝业务 classes 到 lib/classes/
  --install          安装到固定目录（默认 \$HOME/redis/custom/redisson）
  --dest <目录>      覆盖默认安装目录
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --collect) DO_COLLECT=1 ;;
        --with-classes) DO_CLASSES=1 ;;
        --install) DO_INSTALL=1 ;;
        --dest) DEST="$2"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "[setup] 未知参数: $1  （setup.sh --help 查看用法）" >&2; exit 2 ;;
    esac
    shift
done

[ -n "$DEST" ] || DEST="$DEFAULT_DEST"

if [ -z "$DO_COLLECT" ] && [ -z "$DO_INSTALL" ]; then
    echo "[setup] 什么都没做。常用: setup.sh --collect --with-classes && setup.sh --install" >&2
    usage
    exit 2
fi

cd "$SCRIPT_DIR" || exit 1

# ---------- 1. 收集依赖 jar（mvn 在调用者当前目录跑，产物落绝对路径 lib/） ----------
if [ -n "$DO_COLLECT" ]; then
    command -v mvn >/dev/null 2>&1 || {
        echo "[setup] 未找到 mvn，请安装 Maven 并加入 PATH 后重试" >&2
        exit 1
    }
    [ -f "$PROJECT_DIR/pom.xml" ] || echo "[setup] 警告: $PROJECT_DIR 下没有 pom.xml（mvn 会向上查找；Gradle 项目请手动拷 jar 到 lib/）"

    mkdir -p "$LIBDIR"
    echo "[setup] mvn -q dependency:copy-dependencies -DoutputDirectory=$LIBDIR ..."
    (
        cd "$PROJECT_DIR" || exit 1
        if [ -n "$DO_CLASSES" ]; then
            mvn -q compile || { echo "[setup] mvn compile 失败" >&2; exit 1; }
        fi
        mvn -q dependency:copy-dependencies -DincludeScope=runtime "-DoutputDirectory=$LIBDIR" || {
            echo "[setup] mvn dependency:copy-dependencies 失败" >&2
            exit 1
        }
    ) || exit 1

    if [ -z "$(find "$LIBDIR" -maxdepth 1 -name '*.jar' -print -quit 2>/dev/null)" ]; then
        echo "[setup] 警告: 项目未产出任何依赖 jar。请确认在 Maven 项目根目录执行，或手动把依赖 jar 拷入 lib/"
    fi

    # jackson-databind 不是 Redisson 的传递依赖，copy-dependencies 常拷不到；从本地仓库补最新版
    if ! ls "$LIBDIR"/jackson-databind-*.jar >/dev/null 2>&1; then
        JB=$(find "$HOME/.m2/repository/com/fasterxml/jackson/core/jackson-databind" \
                -name 'jackson-databind-*.jar' 2>/dev/null | sort -V | tail -1)
        if [ -n "$JB" ]; then
            cp -f "$JB" "$LIBDIR/"
            echo "[setup] 已从本地仓库补入 jackson-databind"
        else
            echo "[setup] 警告: lib/ 缺 jackson-databind 且本地仓库没有，请手动补入（2.10+）。下载地址:"
            echo "        https://repo1.maven.org/maven2/com/fasterxml/jackson/core/jackson-databind/"
        fi
    fi

    # ---------- 2. 业务 classes ----------
    if [ -n "$DO_CLASSES" ]; then
        if [ -d "$PROJECT_DIR/target/classes" ]; then
            mkdir -p "$LIBDIR/classes"
            echo "[setup] 拷贝业务 classes 到 lib/classes ..."
            cp -R "$PROJECT_DIR/target/classes/." "$LIBDIR/classes/"
        else
            echo "[setup] 警告: 未找到 target/classes，跳过业务 classes（反序列化业务对象时需要）"
        fi
    fi

    # ---------- 环境提示 ----------
    if [ -n "$JAVA_HOME" ] && [ -x "$JAVA_HOME/bin/java" ] || command -v java >/dev/null 2>&1; then
        :
    else
        echo "[setup] 警告: 未找到 java，RedisME 运行脚本时需要 JDK/JRE 8+（设 JAVA_HOME 或加入 PATH）"
    fi

    echo "[setup] 依赖收集完成（$LIBDIR）"
fi

# ---------- 3. 安装到固定目录 ----------
if [ -n "$DO_INSTALL" ]; then
    echo "[setup] 安装到: $DEST"
    mkdir -p "$DEST/lib/classes"
    cp -f redisson-codec.jar "$DEST/" || {
        echo "[setup] 未找到 redisson-codec.jar，请确认包内容完整" >&2
        exit 1
    }
    cp -f run-redisson-codec.sh "$DEST/"
    cp -f run-redisson-codec.cmd "$DEST/" 2>/dev/null
    cp -f README.md "$DEST/" 2>/dev/null
    if [ -d "$LIBDIR" ]; then
        cp -R "$LIBDIR/." "$DEST/lib/"
    fi
    chmod +x "$DEST/run-redisson-codec.sh"

    echo ""
    echo "  把下面这行填进 RedisME「设置 -> 自定义编解码 -> 命令」："
    echo ""
    echo "      $DEST/run-redisson-codec.sh"
    echo ""
    echo "  建议勾选 Auto 识别；所有机器沿用同一目录，之后换机器只需重跑本脚本。"
fi

exit 0
