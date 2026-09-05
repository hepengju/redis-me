//! 终端命令返回值格式化，对齐 redis-cli 多种输出模式：
//! - `Standard`：`cliFormatReplyTTY`（默认交互）
//! - `Raw`：`cliFormatReplyRaw`（`--raw`）
//! - `Csv`：`cliFormatReplyCSV`（`--csv`）
//! - `Json`：`cliFormatReplyJson`（`--json`）

use crate::utils::model::CliOutputMode;
use crate::utils::redis_cli_format::format_quoted;
use redis::Value;

#[derive(Copy, Clone, PartialEq)]
enum AggregateKind {
    Array,
    Set,
    Push,
}

/// 终端命令返回值入口；`output_mode` 为 `None` 时等同 `Standard`
pub fn redis_value_to_cli_display(
    value: Value,
    output_mode: Option<CliOutputMode>,
    cmd: &str,
    args: &[Vec<u8>],
) -> String {
    let mode = output_mode.unwrap_or(CliOutputMode::Standard);
    let verbatim_cmd = command_uses_verbatim_tty(cmd, args);
    let mut out = match mode {
        // 标准模式：部分命令强制 Raw 展示（redis-cli `cliSendCommand` → `output_raw=1`）
        CliOutputMode::Standard if verbatim_cmd => cli_format_raw(value),
        CliOutputMode::Standard => cli_format_tty(value, ""),
        CliOutputMode::Raw => cli_format_raw(value),
        CliOutputMode::Csv => cli_format_csv(value),
        CliOutputMode::Json => cli_format_json(value),
    };
    // 仅 TTY 格式化会在标量末尾多加 `\n`；verbatim / Raw 等保留原样（如 INFO 末尾 `\r\n`）
    if mode == CliOutputMode::Standard && !verbatim_cmd && out.ends_with('\n') {
        out.pop();
    }
    out
}

// ---------------------------------------------------------------------------
// 命令名硬编码（对齐 redis-cli `cliSendCommand` 中 `output_raw = 1` 分支）
// ---------------------------------------------------------------------------

fn arg_eq(args: &[Vec<u8>], i: usize, expected: &str) -> bool {
    args.get(i)
        .is_some_and(|b| String::from_utf8_lossy(b).eq_ignore_ascii_case(expected))
}

/// 标准 TTY 下是否对回复走 Raw 格式化（不加引号、原样换行）
fn command_uses_verbatim_tty(cmd: &str, args: &[Vec<u8>]) -> bool {
    if cmd.eq_ignore_ascii_case("info") || cmd.eq_ignore_ascii_case("lolwut") {
        return true;
    }
    if cmd.eq_ignore_ascii_case("debug") && args.len() >= 1 {
        return arg_eq(args, 0, "htstats")
            || arg_eq(args, 0, "htstats-key")
            || arg_eq(args, 0, "client-eviction");
    }
    if cmd.eq_ignore_ascii_case("memory") && args.len() >= 1 {
        return arg_eq(args, 0, "malloc-stats") || arg_eq(args, 0, "doctor");
    }
    if cmd.eq_ignore_ascii_case("cluster") && args.len() == 1 {
        return arg_eq(args, 0, "nodes") || arg_eq(args, 0, "info");
    }
    if cmd.eq_ignore_ascii_case("client") && args.len() >= 1 {
        return arg_eq(args, 0, "list") || arg_eq(args, 0, "info");
    }
    if cmd.eq_ignore_ascii_case("latency") {
        if args.len() == 2 && arg_eq(args, 0, "graph") {
            return true;
        }
        if args.len() == 1 && arg_eq(args, 0, "doctor") {
            return true;
        }
    }
    // Redis Cluster Proxy: PROXY INFO
    cmd.eq_ignore_ascii_case("proxy") && args.len() >= 1 && arg_eq(args, 0, "info")
}

// ---------------------------------------------------------------------------
// TTY（Standard）
// ---------------------------------------------------------------------------

/// 参考 redis-cli `cliIsMultilineValueTTY`
fn is_multiline_tty(value: &Value) -> bool {
    match value {
        Value::Array(arr) | Value::Set(arr) => {
            if arr.is_empty() {
                false
            } else if arr.len() > 1 {
                true
            } else {
                is_multiline_tty(&arr[0])
            }
        }
        Value::Map(pairs) => {
            if pairs.is_empty() {
                false
            } else if pairs.len() > 1 {
                true
            } else {
                is_multiline_tty(&pairs[0].1)
            }
        }
        Value::Push { data, .. } => {
            if data.is_empty() {
                false
            } else if data.len() > 1 {
                true
            } else {
                is_multiline_tty(&data[0])
            }
        }
        _ => false,
    }
}

fn index_width(count: usize) -> usize {
    let mut n = count.max(1);
    let mut width = 0;
    while n > 0 {
        width += 1;
        n /= 10;
    }
    width
}

fn child_prefix(prefix: &str, idxlen: usize) -> String {
    format!("{}{}", prefix, " ".repeat(idxlen + 2))
}

fn strip_trailing_newline(s: &mut String) {
    if s.ends_with('\n') {
        s.pop();
    }
}

fn format_index_line(entry_prefix: &str, human_idx: usize, numsep: char, idxlen: usize) -> String {
    format!(
        "{}{:>idxlen$}{numsep} ",
        entry_prefix,
        human_idx,
        idxlen = idxlen
    )
}

fn cli_format_tty(value: Value, prefix: &str) -> String {
    match value {
        Value::Nil => "(nil)\n".into(),
        Value::BulkString(bytes) => format!("{}\n", format_quoted(&bytes)),
        Value::Okay => "OK\n".into(),
        Value::SimpleString(s) => format!("{s}\n"),
        Value::Int(i) => format!("(integer) {i}\n"),
        Value::Double(d) => format!("(double) {d}\n"),
        Value::Boolean(b) => format!("{}\n", if b { "(true)" } else { "(false)" }),
        Value::VerbatimString { text, .. } => format!("{text}\n"),
        Value::BigNumber(n) => format!("(integer) {n}\n"),
        Value::ServerError(e) => format!("(error) {e}\n"),
        Value::Attribute { data, .. } => cli_format_tty(*data, prefix),
        Value::Array(arr) => format_aggregate_tty(AggregateKind::Array, arr, prefix),
        Value::Set(set) => format_aggregate_tty(AggregateKind::Set, set, prefix),
        Value::Push { data, .. } => format_aggregate_tty(AggregateKind::Push, data, prefix),
        Value::Map(pairs) => format_map_tty(pairs, prefix),
        _ => format!("{value:?}\n"),
    }
}

fn format_aggregate_tty(kind: AggregateKind, elements: Vec<Value>, prefix: &str) -> String {
    if elements.is_empty() {
        let msg = match kind {
            AggregateKind::Array => "(empty array)\n",
            AggregateKind::Set => "(empty set)\n",
            AggregateKind::Push => "(empty push)\n",
        };
        return msg.into();
    }

    let idxlen = index_width(elements.len());
    let nested_prefix = child_prefix(prefix, idxlen);
    let numsep = if kind == AggregateKind::Set { '~' } else { ')' };

    let mut out = String::new();
    for (i, element) in elements.into_iter().enumerate() {
        let human_idx = i + 1;
        let entry_prefix = if i == 0 { "" } else { prefix };
        out.push_str(&format_index_line(entry_prefix, human_idx, numsep, idxlen));
        out.push_str(&cli_format_tty(element, &nested_prefix));
    }
    out
}

fn format_map_tty(pairs: Vec<(Value, Value)>, prefix: &str) -> String {
    if pairs.is_empty() {
        return "(empty hash)\n".into();
    }

    let idxlen = index_width(pairs.len());
    let nested_prefix = child_prefix(prefix, idxlen);

    let mut out = String::new();
    for (i, (key, val)) in pairs.into_iter().enumerate() {
        let human_idx = i + 1;
        let entry_prefix = if i == 0 { "" } else { prefix };
        out.push_str(&format_index_line(entry_prefix, human_idx, '#', idxlen));

        let mut key_part = cli_format_tty(key, &nested_prefix);
        strip_trailing_newline(&mut key_part);
        out.push_str(&key_part);
        out.push_str(" => ");

        if is_multiline_tty(&val) {
            out.push('\n');
            out.push_str(&nested_prefix);
        }
        out.push_str(&cli_format_tty(val, &nested_prefix));
    }
    out
}

// ---------------------------------------------------------------------------
// Raw（--raw）
// ---------------------------------------------------------------------------

/// 数组/集合元素分隔符，对应 redis-cli `config.mb_delim` 默认 `\n`
const RAW_MB_DELIM: &str = "\n";

fn raw_string(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

fn cli_format_raw(value: Value) -> String {
    match value {
        Value::Nil => String::new(),
        Value::BulkString(bytes) => raw_string(&bytes),
        Value::Okay => raw_string(b"OK"),
        Value::SimpleString(s) => raw_string(s.as_bytes()),
        Value::Int(i) => i.to_string(),
        Value::Double(d) => d.to_string(),
        Value::Boolean(b) => {
            if b {
                "(true)".into()
            } else {
                "(false)".into()
            }
        }
        Value::VerbatimString { text, .. } => text,
        Value::BigNumber(n) => n.to_string(),
        Value::ServerError(e) => format!("{e}\n"),
        Value::Attribute { data, .. } => cli_format_raw(*data),
        Value::Array(arr) | Value::Set(arr) | Value::Push { data: arr, .. } => {
            format_raw_sequence(&arr)
        }
        Value::Map(pairs) => format_raw_map(&pairs),
        _ => format!("{value:?}"),
    }
}

fn format_raw_sequence(items: &[Value]) -> String {
    items
        .iter()
        .cloned()
        .map(cli_format_raw)
        .collect::<Vec<_>>()
        .join(RAW_MB_DELIM)
}

fn format_raw_map(pairs: &[(Value, Value)]) -> String {
    pairs
        .iter()
        .map(|(k, v)| {
            format!(
                "{} {}",
                cli_format_raw(k.clone()),
                cli_format_raw(v.clone())
            )
        })
        .collect::<Vec<_>>()
        .join(RAW_MB_DELIM)
}

// ---------------------------------------------------------------------------
// CSV（--csv）
// ---------------------------------------------------------------------------

fn cli_format_csv(value: Value) -> String {
    match value {
        Value::Nil => "NULL".into(),
        Value::BulkString(bytes) => format_quoted(&bytes),
        Value::Okay => format_quoted(b"OK"),
        Value::SimpleString(s) => format_quoted(s.as_bytes()),
        Value::Int(i) => i.to_string(),
        Value::Double(d) => d.to_string(),
        Value::Boolean(b) => {
            if b {
                "true".into()
            } else {
                "false".into()
            }
        }
        Value::VerbatimString { text, .. } => format_quoted(text.as_bytes()),
        Value::BigNumber(n) => n.to_string(),
        Value::ServerError(e) => format!("ERROR,{}", format_quoted(e.to_string().as_bytes())),
        Value::Attribute { data, .. } => cli_format_csv(*data),
        // Map 无独立 CSV 类型，展平为逗号分隔列表（与 redis-cli 一致）
        Value::Array(arr) | Value::Set(arr) | Value::Push { data: arr, .. } => arr
            .into_iter()
            .map(cli_format_csv)
            .collect::<Vec<_>>()
            .join(","),
        Value::Map(pairs) => pairs
            .into_iter()
            .flat_map(|(k, v)| [k, v])
            .map(cli_format_csv)
            .collect::<Vec<_>>()
            .join(","),
        _ => format!("{value:?}"),
    }
}

// ---------------------------------------------------------------------------
// JSON（--json）
// ---------------------------------------------------------------------------

/// RFC 7159 字符串转义（redis-cli `jsonStringOutput` / `escapeJsonString`）
fn json_string_from_bytes(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    serde_json::to_string(text.as_ref()).unwrap_or_else(|_| "\"\"".into())
}

fn json_string_from_str(text: &str) -> String {
    serde_json::to_string(text).unwrap_or_else(|_| "\"\"".into())
}

fn cli_format_json(value: Value) -> String {
    match value {
        Value::Nil => "null".into(),
        Value::BulkString(bytes) => json_string_from_bytes(&bytes),
        Value::Okay => json_string_from_str("OK"),
        Value::SimpleString(s) => json_string_from_str(&s),
        Value::Int(i) => i.to_string(),
        Value::Double(d) => d.to_string(),
        Value::Boolean(b) => {
            if b {
                "true".into()
            } else {
                "false".into()
            }
        }
        Value::VerbatimString { text, .. } => json_string_from_str(&text),
        Value::BigNumber(n) => n.to_string(),
        Value::ServerError(e) => format!("error:{}", json_string_from_str(&e.to_string())),
        Value::Attribute { data, .. } => cli_format_json(*data),
        Value::Array(arr) | Value::Set(arr) | Value::Push { data: arr, .. } => {
            let body = arr
                .into_iter()
                .map(cli_format_json)
                .collect::<Vec<_>>()
                .join(",");
            format!("[{body}]")
        }
        Value::Map(pairs) => {
            let body = pairs
                .into_iter()
                .map(|(k, v)| format!("{}:{}", json_format_map_key(k), cli_format_json(v)))
                .collect::<Vec<_>>()
                .join(",");
            format!("{{{body}}}")
        }
        _ => json_string_from_str(&format!("{value:?}")),
    }
}

/// JSON 对象 key 必须是字符串；非字符串 key 先转 JSON 再按需加引号（redis-cli 同逻辑）
fn json_format_map_key(key: Value) -> String {
    match &key {
        Value::BulkString(_)
        | Value::SimpleString(_)
        | Value::Okay
        | Value::VerbatimString { .. } => cli_format_json(key),
        _ => {
            let rendered = cli_format_json(key);
            if rendered.starts_with('"') {
                rendered
            } else {
                json_string_from_str(&rendered)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use CliOutputMode::{Csv, Json, Raw, Standard};

    fn display(value: Value, mode: CliOutputMode) -> String {
        redis_value_to_cli_display(value, Some(mode), "", &[])
    }

    fn display_cmd(value: Value, mode: CliOutputMode, cmd: &str, args: &[&[u8]]) -> String {
        let args: Vec<Vec<u8>> = args.iter().map(|b| b.to_vec()).collect();
        redis_value_to_cli_display(value, Some(mode), cmd, &args)
    }

    #[test]
    fn test_tty_scalars() {
        assert_eq!(display(Value::Nil, Standard), "(nil)");
        assert_eq!(
            display(Value::BulkString(b"hello".to_vec()), Standard),
            "\"hello\""
        );
        assert_eq!(display(Value::Int(42), Standard), "(integer) 42");
        assert_eq!(display(Value::Boolean(true), Standard), "(true)");
    }

    #[test]
    fn test_tty_array_numbered() {
        assert_eq!(
            display(
                Value::Array(vec![Value::Nil, Value::BulkString(b"a".to_vec()),]),
                Standard
            ),
            "1) (nil)\n2) \"a\""
        );
        assert_eq!(display(Value::Array(vec![]), Standard), "(empty array)");
    }

    #[test]
    fn test_raw_mode() {
        assert_eq!(display(Value::Nil, Raw), "");
        assert_eq!(display(Value::BulkString(b"hello".to_vec()), Raw), "hello");
        assert_eq!(display(Value::Int(7), Raw), "7");
        assert_eq!(
            display(
                Value::Array(vec![
                    Value::BulkString(b"a".to_vec()),
                    Value::BulkString(b"b".to_vec()),
                ]),
                Raw
            ),
            "a\nb"
        );
    }

    #[test]
    fn test_csv_mode() {
        assert_eq!(display(Value::Nil, Csv), "NULL");
        assert_eq!(display(Value::BulkString(b"hi".to_vec()), Csv), "\"hi\"");
        assert_eq!(
            display(Value::Array(vec![Value::Nil, Value::Int(1)]), Csv),
            "NULL,1"
        );
    }

    #[test]
    fn test_json_mode() {
        assert_eq!(display(Value::Nil, Json), "null");
        assert_eq!(display(Value::BulkString(b"hi".to_vec()), Json), "\"hi\"");
        assert_eq!(display(Value::Int(3), Json), "3");
        assert_eq!(display(Value::Boolean(false), Json), "false");
        assert_eq!(
            display(Value::Array(vec![Value::Nil, Value::Int(1)]), Json),
            "[null,1]"
        );
        assert_eq!(
            display(
                Value::Map(vec![(
                    Value::BulkString(b"k".to_vec()),
                    Value::BulkString(b"v".to_vec()),
                )]),
                Json
            ),
            "{\"k\":\"v\"}"
        );
    }

    #[test]
    fn test_verbatim_tty_commands() {
        let info = b"# Server\r\nredis_version:7.0.0\r\n";
        assert_eq!(
            display_cmd(Value::BulkString(info.to_vec()), Standard, "info", &[]),
            "# Server\r\nredis_version:7.0.0\r\n"
        );
        assert_eq!(
            display_cmd(
                Value::BulkString(b"line1\nline2".to_vec()),
                Standard,
                "get",
                &[b"key"]
            ),
            "\"line1\\nline2\""
        );
        assert_eq!(
            display_cmd(
                Value::BulkString(b"node1\nnode2".to_vec()),
                Standard,
                "cluster",
                &[b"nodes"]
            ),
            "node1\nnode2"
        );
        // 下拉选 Raw 时 verbatim 命令仍保留末尾换行
        assert_eq!(
            display_cmd(Value::BulkString(info.to_vec()), Raw, "info", &[]),
            "# Server\r\nredis_version:7.0.0\r\n"
        );
        // 嵌套在数组内仍走 TTY 引号
        assert_eq!(
            display(
                Value::Array(vec![Value::BulkString(b"a\nb".to_vec())]),
                Standard
            ),
            "1) \"a\\nb\""
        );
    }

    #[test]
    fn test_command_uses_verbatim_tty() {
        assert!(command_uses_verbatim_tty("INFO", &[]));
        assert!(command_uses_verbatim_tty("cluster", &[b"nodes".to_vec()]));
        assert!(!command_uses_verbatim_tty("get", &[b"key".to_vec()]));
        assert!(!command_uses_verbatim_tty("cluster", &[b"slots".to_vec()]));
    }

    #[test]
    fn test_tty_map_and_set() {
        assert_eq!(
            display(
                Value::Map(vec![(
                    Value::BulkString(b"k".to_vec()),
                    Value::BulkString(b"v".to_vec()),
                )]),
                Standard
            ),
            "1# \"k\" => \"v\""
        );
        assert_eq!(
            display(
                Value::Set(vec![Value::BulkString(b"m1".to_vec())]),
                Standard
            ),
            "1~ \"m1\""
        );
        assert_eq!(display(Value::Set(vec![]), Standard), "(empty set)");
        assert_eq!(display(Value::Map(vec![]), Standard), "(empty hash)");
    }

    #[test]
    fn test_default_mode_is_standard() {
        assert_eq!(
            redis_value_to_cli_display(Value::Nil, None, "", &[]),
            "(nil)"
        );
    }
}
