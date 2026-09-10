package com.redisme.codec;

import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator;
import com.fasterxml.jackson.databind.node.ArrayNode;

import java.io.PrintStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Scanner;
import java.util.Set;

/**
 * RedisME 自定义编解码：Redisson 客户端序列化值 ↔ 可编辑 JSON。
 *
 * 零依赖瘦 jar（仅编译期需要 Jackson）：运行时反射调用 lib 目录中 Redisson 的 codec，
 * 与 Redisson 客户端写入的字节完全兼容；兼容任意 Redisson 3.16+ / 4.x 版本，JDK 8+ 即可运行。
 * codec 自动探测：依次尝试 Kryo5Codec（4.x 默认）、MarshallingCodec（3.x 默认），
 * 用环境变量 REDISSON_CODEC_CLASS 指定配置中实际使用的 codec 类名可跳过探测。
 * Kryo 对非本 codec 的字节也可能“解成功”（例如把 Marshalling 的 List 读成 Float），
 * 因此探测时会再 encode 一次，往返长度不一致则视为该 codec 不匹配，继续试下一个。
 *
 * 目录约定（启动脚本同级）：
 *   redisson-codec.jar  本编解码入口
 *   lib/*.jar           项目运行依赖（redisson、kryo/jboss-marshalling、netty-buffer、jackson 等；
 *                       Maven 可用 dependency:copy-dependencies 一次拷全）
 *   lib/classes         项目业务 classes（含包目录；反序列化需要业务类如 Person）
 *
 * 协议（与 codec.py / codec.js / JdkCodec 一致）：
 *   {本入口} decode {wire_base64}
 *   {本入口} encode {utf8_text_base64}   → stdout 输出 wire base64
 *   Base64 超过 8000 字符时参数 2 为 --stdin，从 stdin 读一行
 *
 * 实现要点：
 * 1. 反射调用 codec 的 getValueDecoder/getValueEncoder（writeClassAndObject 语义），
 *    无需手工复刻各 codec 的序列化配置。
 * 2. 根类型信息手工包裹为 ["类全名", 值]（Jackson 对根值不写默认类型信息，且会把
 *    JDK 不可变集合类名映射为可变集合，导致 decode/encode 不对称）；嵌套层用 Jackson
 *    默认类型信息，保证 List&lt;Person&gt; 等泛型结构 encode 回写时元素类型不丢失
 *    （否则会退化为 LinkedHashMap）。
 * 3. JDK 不可变集合（List.of/Set.of/Map.of 产生的 ImmutableCollections$ListN 等）
 *    Jackson 无法实例化，encode 时替换为 ArrayList/LinkedHashSet/LinkedHashMap；
 *    Kryo 流中写的是具体类名，Redisson 端读取不受影响。
 * 4. 每个候选 codec 使用独立 ByteBuf，避免上一个 codec（尤其 Kryo Input 预读）
 *    把 readerIndex 推到末尾，导致下一个 codec 读到空缓冲。
 */
public final class RedissonCodec {

    /** 探测顺序：Redisson 4.x 默认 Kryo5Codec，3.x 默认 MarshallingCodec */
    private static final String[] DEFAULT_CODEC_CLASSES = {
            "org.redisson.codec.Kryo5Codec",
            "org.redisson.codec.MarshallingCodec"};

    /**
     * 嵌套层类型信息的 JSON mapper（WRAPPER_ARRAY，如 ["com.xxx.Person", {...}]）。
     * 根类型信息由本类手工包裹/解包，不依赖 Jackson 默认 typing 的根行为。
     */
    private static final ObjectMapper MAPPER = createMapper();

    /** 可能被 Jackson 用作集合类型包裹名的可变集合类名 */
    private static final Set<String> MUTABLE_WRAPPER_NAMES = new HashSet<String>(Arrays.asList(
            "java.util.ArrayList", "java.util.LinkedHashSet", "java.util.LinkedHashMap"));

    /** 候选 codec（懒加载反射句柄） */
    private static final CodecRef[] REFS = buildRefs();

    /** decode 成功 / encode 选定的 codec（同进程内 RedisME 先 decode 后 encode） */
    private static CodecRef active;

    // netty ByteBuf 反射句柄（延迟初始化）
    private static Class<?> byteBufClass;
    private static Method wrappedBufferMethod;
    private static Method releaseMethod;
    private static Method readableBytesMethod;
    private static Method readBytesMethod;

    private RedissonCodec() {
    }

    public static void main(String[] args) {
        // Java 8 无 PrintStream(Charset) 重载，用字符集名称
        try {
            System.setOut(new PrintStream(System.out, true, "UTF-8"));
            System.setErr(new PrintStream(System.err, true, "UTF-8"));
        } catch (java.io.UnsupportedEncodingException ignored) {
            // UTF-8 必然存在，不会走到这里
        }
        if (args.length < 2) {
            fail("usage: RedissonCodec decode|encode <base64|--stdin>");
        }
        try {
            String mode = args[0];
            String b64 = readB64Arg(args);
            if ("decode".equals(mode)) {
                decode(b64);
            } else if ("encode".equals(mode)) {
                encode(b64);
            } else {
                fail("unknown mode: " + mode);
            }
        } catch (Throwable e) {
            fail(e);
        }
    }

    private static ObjectMapper createMapper() {
        ObjectMapper mapper = new ObjectMapper()
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .activateDefaultTyping(
                        LaissezFaireSubTypeValidator.instance,
                        ObjectMapper.DefaultTyping.NON_FINAL,
                        JsonTypeInfo.As.WRAPPER_ARRAY);
        // jackson-datatype-jsr310 存在才注册（非 Redisson 必需依赖，避免强制要求）
        try {
            Object module = Class.forName("com.fasterxml.jackson.datatype.jsr310.JavaTimeModule")
                    .getDeclaredConstructor().newInstance();
            mapper.registerModule((com.fasterxml.jackson.databind.Module) module);
        } catch (Throwable ignored) {
            // 无 jsr310 时 java.time 类型按普通对象处理
        }
        return mapper;
    }

    private static CodecRef[] buildRefs() {
        String forced = System.getenv("REDISSON_CODEC_CLASS");
        if (forced != null && !forced.trim().isEmpty()) {
            return new CodecRef[] { new CodecRef(forced.trim()) };
        }
        CodecRef[] refs = new CodecRef[DEFAULT_CODEC_CLASSES.length];
        for (int i = 0; i < DEFAULT_CODEC_CLASSES.length; i++) {
            refs[i] = new CodecRef(DEFAULT_CODEC_CLASSES[i]);
        }
        return refs;
    }

    /** 单个 Redisson codec 的懒加载反射句柄 */
    private static final class CodecRef {
        final String className;
        Throwable initError;
        Throwable decodeError;
        Object decoder;
        Object encoder;
        Method decodeMethod;
        Method encodeMethod;
        boolean inited;

        CodecRef(String className) {
            this.className = className;
        }

        /** 初始化反射句柄；类不存在/构造失败返回 false（探测下一个） */
        boolean ready() {
            if (!inited) {
                inited = true;
                try {
                    Object codec = Class.forName(className).getDeclaredConstructor().newInstance();
                    decoder = codec.getClass().getMethod("getValueDecoder").invoke(codec);
                    encoder = codec.getClass().getMethod("getValueEncoder").invoke(codec);
                    // codec 返回的 Decoder/Encoder 多为匿名内部类，反射调用需在
                    // 公开的接口上找方法，否则报 cannot access a member
                    decodeMethod = findMethod(decoder.getClass(), "decode", "org.redisson.client.protocol.Decoder");
                    encodeMethod = findMethod(encoder.getClass(), "encode", "org.redisson.client.protocol.Encoder");
                } catch (Throwable t) {
                    initError = unwrap(t);
                }
            }
            return initError == null;
        }

        String simpleName() {
            int i = className.lastIndexOf('.');
            return i < 0 ? className : className.substring(i + 1);
        }
    }

    /** 优先在公开的接口类上找方法（匿名内部类实现无法直接反射调用） */
    private static Method findMethod(Class<?> runtimeClass, String name, String ifaceName) {
        try {
            Class<?> iface = Class.forName(ifaceName);
            if (iface.isAssignableFrom(runtimeClass)) {
                for (Method m : iface.getMethods()) {
                    if (m.getName().equals(name)) {
                        return m;
                    }
                }
            }
        } catch (ClassNotFoundException ignored) {
            // 接口不存在时退回运行时类查找
        }
        for (Method m : runtimeClass.getMethods()) {
            if (m.getName().equals(name)) {
                return m;
            }
        }
        throw new IllegalStateException("method not found: " + runtimeClass.getName() + "." + name);
    }

    private static void initByteBuf() throws Exception {
        if (byteBufClass != null) {
            return;
        }
        byteBufClass = Class.forName("io.netty.buffer.ByteBuf");
        wrappedBufferMethod = Class.forName("io.netty.buffer.Unpooled")
                .getMethod("wrappedBuffer", byte[].class);
        releaseMethod = byteBufClass.getMethod("release");
        readableBytesMethod = byteBufClass.getMethod("readableBytes");
        readBytesMethod = byteBufClass.getMethod("readBytes", byte[].class);
    }

    private static boolean forced() {
        String forced = System.getenv("REDISSON_CODEC_CLASS");
        return forced != null && !forced.trim().isEmpty();
    }

    /** wire base64 → 编辑器 JSON：["根类全名", 值]；嵌套层由 Jackson 携带类型信息 */
    private static void decode(String wireBase64) throws Throwable {
        initByteBuf();
        byte[] bytes = Base64.getDecoder().decode(wireBase64);
        Throwable lastError = null;
        for (CodecRef ref : REFS) {
            if (!ref.ready()) {
                lastError = ref.initError;
                continue;
            }
            Object buf = wrappedBufferMethod.invoke(null, bytes);
            try {
                Object obj = ref.decodeMethod.invoke(ref.decoder, buf, null);
                if (!roundtripMatches(ref, obj, bytes)) {
                    lastError = ref.decodeError;
                    continue;
                }
                active = ref;
                ArrayNode root = MAPPER.createArrayNode();
                root.add(obj == null ? "null" : obj.getClass().getName());
                root.add(stripRootWrapper(MAPPER.valueToTree(obj), obj));
                System.out.print(MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(root));
                return;
            } catch (Throwable t) {
                Throwable cause = unwrap(t);
                // 依赖缺失（如 MarshallingCodec 缺 jboss-marshalling）视为该 codec 不可用，继续探测
                if (cause instanceof NoClassDefFoundError || cause instanceof ClassNotFoundException) {
                    ref.initError = cause;
                }
                ref.decodeError = cause;
                lastError = cause;
            } finally {
                releaseMethod.invoke(buf);
            }
        }
        fail(codecHint("解码失败", lastError));
    }

    /**
     * Kryo 对任意字节也可能 readClassAndObject 成功（只消费对象头部、其余被 Input 预读丢掉），
     * 再 encode 一次：长度对不上就说明不是该 codec 写出来的。
     * 只比长度、不比逐字节：HashSet/HashMap 迭代顺序可能变，但总长度应一致。
     */
    private static boolean roundtripMatches(CodecRef ref, Object obj, byte[] original) {
        try {
            byte[] encoded = toByteArray(ref.encodeMethod.invoke(ref.encoder, obj));
            if (encoded.length == original.length) {
                return true;
            }
            ref.decodeError = new IllegalStateException(
                    "往返长度不一致（输入 " + original.length + " 字节，写成 " + encoded.length
                            + " 字节，可能不是该 codec）");
            return false;
        } catch (Throwable t) {
            Throwable cause = unwrap(t);
            if (cause instanceof NoClassDefFoundError || cause instanceof ClassNotFoundException) {
                ref.initError = cause;
            }
            ref.decodeError = cause;
            return false;
        }
    }

    /**
     * 去除 valueToTree 可能给根值加上的类型包裹（形如 ["java.util.ArrayList", 值]，
     * 对可变集合/POJO 会出现；JDK 不可变集合因专用序列化器不会出现）；根类型已由外层保留。
     * 仅当包裹名等于实际类名或为已知可变集合映射名时才去除，避免误伤真实数据。
     */
    private static JsonNode stripRootWrapper(JsonNode node, Object obj) {
        if (obj != null && node.isArray() && node.size() == 2 && node.get(0).isTextual()) {
            String wrapper = node.get(0).asText();
            if (wrapper.equals(obj.getClass().getName()) || MUTABLE_WRAPPER_NAMES.contains(wrapper)) {
                return node.get(1);
            }
        }
        return node;
    }

    /** 编辑器 JSON → wire base64 */
    private static void encode(String textBase64) throws Throwable {
        initByteBuf();
        String text = new String(Base64.getDecoder().decode(textBase64), StandardCharsets.UTF_8).trim();
        JsonNode tree = MAPPER.readTree(text);
        if (!(tree.isArray() && tree.size() == 2 && tree.get(0).isTextual())) {
            fail("JSON 格式应为 [\"类全名\", 值]，如 [\"java.util.ArrayList\", [...]]");
        }
        Class<?> clazz = resolveClass(tree.get(0).asText());
        JsonNode valueNode = tree.get(1);
        Object obj;
        if (clazz == null) {
            obj = null;
        } else if (Modifier.isFinal(clazz.getModifiers())) {
            obj = MAPPER.treeToValue(valueNode, clazz); // final 类型（String/Integer 等）无类型包裹
        } else {
            // 非 final 类型 Jackson 默认 typing 要求 [类全名, 值] 包裹，与 decode 的裸值对称补回
            ArrayNode wrapped = MAPPER.createArrayNode();
            wrapped.add(clazz.getName());
            wrapped.add(valueNode);
            obj = MAPPER.treeToValue(wrapped, clazz);
        }
        CodecRef ref = active;
        if (ref == null) {
            // 直接 encode（未经 decode）：取第一个可用 codec
            for (CodecRef r : REFS) {
                if (r.ready()) {
                    ref = r;
                    break;
                }
            }
        }
        if (ref == null) {
            fail(codecHint("无可用 codec", REFS[0].initError));
        }
        try {
            System.out.print(toBase64(ref.encodeMethod.invoke(ref.encoder, obj)));
        } catch (Throwable t) {
            Throwable first = unwrap(t);
            // 依赖缺失视为该 codec 不可用，自动探测模式下继续尝试其余候选
            if (forced() || active != null
                    || !(first instanceof NoClassDefFoundError || first instanceof ClassNotFoundException)) {
                fail(first);
            }
            ref.initError = first;
            Throwable lastError = first;
            for (CodecRef r : REFS) {
                if (r == ref || !r.ready()) {
                    continue;
                }
                try {
                    System.out.print(toBase64(r.encodeMethod.invoke(r.encoder, obj)));
                    return;
                } catch (Throwable t2) {
                    lastError = unwrap(t2);
                }
            }
            fail(codecHint("编码失败", lastError));
        }
    }

    private static String toBase64(Object out) throws Exception {
        return Base64.getEncoder().encodeToString(toByteArray(out));
    }

    private static byte[] toByteArray(Object out) throws Exception {
        try {
            int len = (Integer) readableBytesMethod.invoke(out);
            byte[] bytes = new byte[len];
            readBytesMethod.invoke(out, (Object) bytes);
            return bytes;
        } finally {
            releaseMethod.invoke(out);
        }
    }

    /** 汇总候选 codec 状态，引导用户补齐 lib 目录 */
    private static String codecHint(String prefix, Throwable lastError) {
        StringBuilder sb = new StringBuilder(prefix);
        boolean hasRefError = false;
        for (CodecRef ref : REFS) {
            Throwable err = ref.initError != null ? ref.initError : ref.decodeError;
            if (err != null) {
                hasRefError = true;
                sb.append("; ").append(ref.simpleName()).append(": ").append(messageOf(err));
            }
        }
        if (!hasRefError && lastError != null) {
            sb.append(": ").append(messageOf(lastError));
        }
        sb.append(" — 请把项目依赖 jar 拷入 lib 目录（如 mvn dependency:copy-dependencies），"
                + "并用环境变量 REDISSON_CODEC_CLASS 指定配置中实际使用的 codec 类名");
        return sb.toString();
    }

    private static String messageOf(Throwable e) {
        String msg = e.getMessage();
        return (msg == null || msg.isEmpty()) ? e.getClass().getSimpleName() : msg;
    }

    private static Throwable unwrap(Throwable e) {
        if (e instanceof InvocationTargetException && e.getCause() != null) {
            return e.getCause();
        }
        return e;
    }

    /**
     * 解析根类名；Jackson 无法实例化 List.of/Set.of/Map.of 等产生的 JDK 不可变集合类，
     * 替换为可构造的等价集合（Kryo 写回具体类名，Redisson 端读取不受影响）。
     */
    private static Class<?> resolveClass(String name) throws ClassNotFoundException {
        if ("null".equals(name)) {
            return null;
        }
        if ("java.util.ImmutableCollections$ListN".equals(name)
                || "java.util.ImmutableCollections$List12".equals(name)
                || "java.util.Collections$EmptyList".equals(name)
                || "java.util.Collections$SingletonList".equals(name)) {
            return ArrayList.class;
        }
        if ("java.util.ImmutableCollections$SetN".equals(name)
                || "java.util.ImmutableCollections$Set12".equals(name)
                || "java.util.Collections$EmptySet".equals(name)
                || "java.util.Collections$SingletonSet".equals(name)) {
            return LinkedHashSet.class;
        }
        if ("java.util.ImmutableCollections$MapN".equals(name)
                || "java.util.ImmutableCollections$Map1".equals(name)
                || "java.util.Collections$EmptyMap".equals(name)
                || "java.util.Collections$SingletonMap".equals(name)) {
            return LinkedHashMap.class;
        }
        return Class.forName(name);
    }

    private static String readB64Arg(String[] args) {
        String arg = stripArgQuotes(args[1]);
        if ("--stdin".equals(arg)) {
            // base64 均为 ASCII，默认字符集读取即可（Java 8 无 Scanner 字符集构造器）
            Scanner scanner = new Scanner(System.in);
            try {
                return scanner.nextLine().trim();
            } finally {
                scanner.close();
            }
        }
        return arg;
    }

    private static String stripArgQuotes(String raw) {
        String s = raw.trim();
        if (s.length() >= 2 && s.charAt(0) == '"' && s.charAt(s.length() - 1) == '"') {
            return s.substring(1, s.length() - 1).trim();
        }
        return s;
    }

    private static void fail(String message) {
        System.err.println(message);
        System.exit(1);
    }

    private static void fail(Throwable e) {
        e = unwrap(e);
        String msg = messageOf(e);
        if (e instanceof ClassNotFoundException || e instanceof NoClassDefFoundError) {
            msg += " — 请把包含该类的 jar 放入 lib 目录（redisson/kryo/netty-buffer/jackson 等），"
                    + "业务类放入 lib/classes";
        }
        System.err.println(msg);
        System.exit(1);
    }
}
