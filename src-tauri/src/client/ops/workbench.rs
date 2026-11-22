//! 工作台表格。只认命令名，不按回复形状猜。
//! FT.SEARCH 的向量字段由调用方按 FT.INFO 传入，按小端 FLOAT32 解开；其它二进制只写长度。

use redis::Value;

use crate::client::ops::search::{parse_ft_search_readable, vector_field_names};
use crate::model::{CliOutputMode, WorkbenchExec, WorkbenchTable};
use crate::support::tty::redis_value_to_cli_display;
use std::collections::HashSet;

const MAX_ROWS: usize = 1000;

/// 同一次执行：Raw 文本，外加点名命令的表。
pub fn finish_workbench(
    value: Value,
    mode: Option<CliOutputMode>,
    cmd: &str,
    args: &[Vec<u8>],
    vectors: &HashSet<String>,
) -> WorkbenchExec {
    let table = table_for(&value, cmd, args, vectors);
    WorkbenchExec {
        text: redis_value_to_cli_display(value, mode, cmd, args),
        table,
    }
}

/// `FT.SEARCH` 的索引名在第一个参数。向同一条连接再要一次 `FT.INFO`。
/// 失败就当没有向量字段：表仍能出，二进制只写长度。
pub fn vector_fields_for_search(
    cmd: &str,
    args: &[Vec<u8>],
    mut run: impl FnMut(&redis::Cmd) -> redis::RedisResult<Value>,
) -> HashSet<String> {
    if !cmd.eq_ignore_ascii_case("FT.SEARCH") {
        return HashSet::new();
    }
    let Some(index) = args.first().filter(|index| !index.is_empty()) else {
        return HashSet::new();
    };
    let mut info = redis::cmd("FT.INFO");
    info.arg(index);
    match run(&info) {
        Ok(value) => vector_field_names(&value),
        Err(_) => HashSet::new(),
    }
}

fn table_for(
    value: &Value,
    cmd: &str,
    args: &[Vec<u8>],
    vectors: &HashSet<String>,
) -> Option<WorkbenchTable> {
    let name = cmd.to_ascii_uppercase();
    if name == "CLIENT" && arg_is(args, 0, "LIST") {
        return client_list_table(value);
    }
    match name.as_str() {
        "FT.SEARCH" => search_table(value, args, vectors),
        "FT.AGGREGATE" => aggregate_table(value),
        "FT.INFO" => info_table(value),
        _ => None,
    }
}

fn arg_is(args: &[Vec<u8>], index: usize, expect: &str) -> bool {
    args.get(index)
        .and_then(|b| std::str::from_utf8(b).ok())
        .is_some_and(|s| s.eq_ignore_ascii_case(expect))
}

/// 合法文本原样。这里不猜向量，只在已知 VECTOR 字段上解开。别的二进制只写长度。
fn bulk_cell(bytes: &[u8]) -> String {
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_string();
    }
    format!("(binary {})", bytes.len())
}

fn show(value: &Value) -> String {
    match value {
        Value::Nil => String::new(),
        Value::Int(n) => n.to_string(),
        Value::Double(n) => n.to_string(),
        Value::Boolean(b) => b.to_string(),
        Value::BigNumber(n) => n.to_string(),
        Value::Okay => "OK".to_string(),
        Value::SimpleString(s) => s.clone(),
        Value::VerbatimString { text, .. } => text.clone(),
        Value::BulkString(b) => bulk_cell(b),
        Value::ServerError(e) => e.to_string(),
        Value::Array(items) | Value::Set(items) => items
            .iter()
            .map(show)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" "),
        Value::Map(items) => items
            .iter()
            .map(|(k, v)| format!("{} {}", show(k), show(v)))
            .collect::<Vec<_>>()
            .join(" "),
        Value::Push { data, .. } => data.iter().map(show).collect::<Vec<_>>().join(" "),
        Value::Attribute { data, .. } => show(data),
        _ => String::new(),
    }
}

/// RESP2 是批量字符串。RESP3 的 `CLIENT LIST` 是 `txt` 原文，redis-rs 收成 VerbatimString。
fn client_list_text(value: &Value) -> Option<&str> {
    match value {
        Value::BulkString(bytes) => std::str::from_utf8(bytes).ok(),
        Value::SimpleString(text) => Some(text.as_str()),
        Value::VerbatimString { text, .. } => Some(text.as_str()),
        _ => None,
    }
}

fn client_list_table(value: &Value) -> Option<WorkbenchTable> {
    let text = client_list_text(value)?;
    let mut columns = Vec::new();
    let mut parsed = Vec::new();
    for line in text.lines().filter(|line| !line.trim().is_empty()) {
        let mut pairs = Vec::new();
        for part in line.split(' ').filter(|part| !part.is_empty()) {
            let (key, val) = part.split_once('=')?;
            if !columns.iter().any(|col: &String| col == key) {
                columns.push(key.to_string());
            }
            pairs.push((key.to_string(), val.to_string()));
        }
        if pairs.is_empty() {
            return None;
        }
        parsed.push(pairs);
    }
    if columns.is_empty() {
        return None;
    }
    rows_from_pairs(columns, parsed, None)
}

fn search_table(
    value: &Value,
    args: &[Vec<u8>],
    vectors: &HashSet<String>,
) -> Option<WorkbenchTable> {
    // 前两个参数是索引和查询，不把查询词当成 WITHSCORES。
    let with_scores = args
        .iter()
        .skip(2)
        .any(|b| std::str::from_utf8(b).is_ok_and(|s| s.eq_ignore_ascii_case("WITHSCORES")));
    let page = parse_ft_search_readable(value.clone(), with_scores, vectors).ok()?;
    let mut columns = vec!["key".to_string()];
    if page.hits.iter().any(|hit| hit.score.is_some()) {
        columns.push("score".to_string());
    }
    for hit in &page.hits {
        for field in &hit.fields {
            if !columns.iter().any(|col| col == &field.field) {
                columns.push(field.field.clone());
            }
        }
    }
    let parsed = page
        .hits
        .into_iter()
        .map(|hit| {
            let mut pairs = vec![("key".to_string(), hit.key)];
            if let Some(score) = hit.score {
                pairs.push(("score".to_string(), score));
            }
            for field in hit.fields {
                pairs.push((field.field, field.value));
            }
            pairs
        })
        .collect();
    rows_from_pairs(columns, parsed, Some(0))
}

fn aggregate_rows(value: &Value) -> Option<&[Value]> {
    match value {
        Value::Array(items) => Some(items),
        Value::Map(items) => {
            let pair = items.iter().find(|(k, _)| show(k) == "results")?;
            match &pair.1 {
                Value::Array(rows) => Some(rows.as_slice()),
                _ => None,
            }
        }
        _ => None,
    }
}

fn aggregate_table(value: &Value) -> Option<WorkbenchTable> {
    let items = aggregate_rows(value)?;
    let start = usize::from(matches!(
        items.first(),
        Some(Value::Int(_) | Value::BigNumber(_))
    ));
    let mut columns = Vec::new();
    let mut parsed = Vec::new();
    for item in items.iter().skip(start) {
        let pairs = aggregate_row(item)?;
        for (key, _) in &pairs {
            if !columns.iter().any(|col: &String| col == key) {
                columns.push(key.clone());
            }
        }
        parsed.push(pairs);
    }
    if columns.is_empty() {
        return None;
    }
    rows_from_pairs(columns, parsed, None)
}

/// RESP2 行本身就是键值。RESP3 行把分组字段放在 `extra_attributes` 里。
fn aggregate_row(value: &Value) -> Option<Vec<(String, String)>> {
    if let Value::Map(items) = value
        && let Some((_, attrs)) = items
            .iter()
            .find(|(key, _)| show(key) == "extra_attributes")
    {
        let mut pairs = pair_list(attrs)?;
        if let Some((_, score)) = items.iter().find(|(key, _)| show(key) == "score")
            && !pairs.iter().any(|(key, _)| key == "score")
        {
            pairs.push(("score".to_string(), show(score)));
        }
        return Some(pairs);
    }
    pair_list(value)
}

fn info_table(value: &Value) -> Option<WorkbenchTable> {
    let pairs = pair_list(value)?;
    if pairs.is_empty() {
        return None;
    }
    let columns = vec!["field".to_string(), "value".to_string()];
    let parsed = pairs
        .into_iter()
        .map(|(key, val)| vec![("field".to_string(), key), ("value".to_string(), val)])
        .collect();
    rows_from_pairs(columns, parsed, None)
}

fn pair_list(value: &Value) -> Option<Vec<(String, String)>> {
    match value {
        Value::Array(items) => {
            if items.len() % 2 != 0 {
                return None;
            }
            Some(
                items
                    .chunks(2)
                    .map(|pair| (show(&pair[0]), show(&pair[1])))
                    .collect(),
            )
        }
        Value::Map(items) => Some(items.iter().map(|(k, v)| (show(k), show(v))).collect()),
        _ => None,
    }
}

fn rows_from_pairs(
    columns: Vec<String>,
    parsed: Vec<Vec<(String, String)>>,
    key_column: Option<u32>,
) -> Option<WorkbenchTable> {
    let truncated = parsed.len() > MAX_ROWS;
    let rows = parsed
        .into_iter()
        .take(MAX_ROWS)
        .map(|pairs| {
            columns
                .iter()
                .map(|col| {
                    pairs
                        .iter()
                        .find(|(key, _)| key == col)
                        .map(|(_, val)| val.clone())
                        .unwrap_or_default()
                })
                .collect()
        })
        .collect();
    Some(WorkbenchTable {
        columns,
        rows,
        key_column,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn b(s: &str) -> Value {
        Value::BulkString(s.as_bytes().to_vec())
    }

    #[test]
    fn client_list_resp3_verbatim_is_a_table() {
        let value = Value::VerbatimString {
            format: redis::VerbatimFormat::Text,
            text: "id=301 addr=127.0.0.1:1 name=RedisME flags=N\n".into(),
        };
        let table = client_list_table(&value).unwrap();
        assert_eq!(table.columns, ["id", "addr", "name", "flags"]);
        assert_eq!(table.rows, [vec!["301", "127.0.0.1:1", "RedisME", "N"]]);
    }

    #[test]
    fn client_list_uses_first_line_keys() {
        let value = b("id=1 addr=a name=\nid=2 addr=b flags=N");
        let table = client_list_table(&value).unwrap();
        assert_eq!(table.columns, ["id", "addr", "name", "flags"]);
        assert_eq!(table.rows[0], ["1", "a", "", ""]);
        assert_eq!(table.rows[1][3], "N");
        assert!(table.key_column.is_none());
    }

    #[test]
    fn vector_field_stays_in_the_table() {
        let value = Value::Array(vec![
            Value::Int(1),
            b("bikes:1"),
            Value::Array(vec![
                b("brand"),
                b("nHill"),
                b("vector_embeddings"),
                Value::BulkString(1.5f32.to_le_bytes().to_vec()),
            ]),
        ]);
        let mut vectors = HashSet::new();
        vectors.insert("vector_embeddings".to_string());
        let done = finish_workbench(value, Some(CliOutputMode::Raw), "FT.SEARCH", &[], &vectors);
        let table = done.table.unwrap();
        assert_eq!(table.columns, ["key", "brand", "vector_embeddings"]);
        assert_eq!(table.rows[0], ["bikes:1", "nHill", "[1.5]"]);
        assert_eq!(table.key_column, Some(0));
    }

    /// 0 和 0.5 的小端字节是合法 UTF-8。只有字段名在 schema 里才解开，不靠「非法 UTF-8」来猜。
    #[test]
    fn named_ascii_vector_is_decoded() {
        let mut bytes = Vec::new();
        bytes.extend(0.0f32.to_le_bytes());
        bytes.extend(0.5f32.to_le_bytes());
        let value = Value::Array(vec![
            Value::Int(1),
            b("bikes:1"),
            Value::Array(vec![
                b("brand"),
                b("nHill"),
                b("vector_embeddings"),
                Value::BulkString(bytes),
            ]),
        ]);
        let mut vectors = HashSet::new();
        vectors.insert("vector_embeddings".to_string());
        let table = search_table(&value, &[], &vectors).unwrap();
        assert_eq!(table.rows[0], ["bikes:1", "nHill", "[0, 0.5]"]);
    }

    /// 没标成向量的二进制，长度凑满 4 也不拆成浮点。
    #[test]
    fn unnamed_aligned_binary_stays_a_length() {
        let value = Value::Array(vec![
            Value::Int(1),
            b("doc"),
            Value::Array(vec![
                b("blob"),
                Value::BulkString(vec![0xff, 0xfe, 0xfd, 0xfc]),
            ]),
        ]);
        let table = search_table(&value, &[], &HashSet::new()).unwrap();
        assert_eq!(table.rows[0], ["doc", "(binary 4)"]);
    }

    #[test]
    fn odd_binary_is_a_length_not_garbage() {
        let value = Value::Array(vec![
            Value::Int(1),
            b("doc"),
            Value::Array(vec![b("blob"), Value::BulkString(vec![0xff, 0xfe])]),
        ]);
        let table = search_table(&value, &[], &HashSet::new()).unwrap();
        assert_eq!(table.rows[0], ["doc", "(binary 2)"]);
    }

    #[test]
    fn query_text_is_not_the_withscores_flag() {
        let value = Value::Array(vec![
            Value::Int(1),
            b("bikes:1"),
            Value::Array(vec![b("brand"), b("nHill")]),
        ]);
        let args = vec![b"idx".to_vec(), b"WITHSCORES".to_vec()];
        let table = search_table(&value, &args, &HashSet::new()).unwrap();
        assert_eq!(table.columns, ["key", "brand"]);
    }

    #[test]
    fn ft_search_withscores_adds_score() {
        let value = Value::Array(vec![
            Value::Int(1),
            b("bikes:1"),
            b("1.5"),
            Value::Array(vec![b("brand"), b("nHill")]),
        ]);
        let args = vec![b"idx".to_vec(), b"*".to_vec(), b"WITHSCORES".to_vec()];
        let table = search_table(&value, &args, &HashSet::new()).unwrap();
        assert_eq!(table.columns, ["key", "score", "brand"]);
        assert_eq!(table.rows[0], ["bikes:1", "1.5", "nHill"]);
    }

    #[test]
    fn ft_search_resp3_uses_id_and_attributes() {
        let value = Value::Map(vec![
            (b("total_results"), Value::Int(1)),
            (
                b("results"),
                Value::Array(vec![Value::Map(vec![
                    (b("id"), b("bikes:1")),
                    (
                        b("extra_attributes"),
                        Value::Map(vec![(b("brand"), b("nHill"))]),
                    ),
                ])]),
            ),
        ]);
        let table = search_table(&value, &[], &HashSet::new()).unwrap();
        assert_eq!(table.columns, ["key", "brand"]);
        assert_eq!(table.rows[0], ["bikes:1", "nHill"]);
        assert_eq!(table.key_column, Some(0));
    }

    #[test]
    fn ft_search_key_is_first_column() {
        let value = Value::Array(vec![
            Value::Int(1),
            b("bikes:1"),
            Value::Array(vec![b("brand"), b("nHill")]),
        ]);
        let table = search_table(&value, &[], &HashSet::new()).unwrap();
        assert_eq!(table.columns, ["key", "brand"]);
        assert_eq!(table.rows[0], ["bikes:1", "nHill"]);
        assert_eq!(table.key_column, Some(0));
    }

    #[test]
    fn get_is_not_a_table() {
        assert!(table_for(&b("hello"), "GET", &[], &HashSet::new()).is_none());
    }

    #[test]
    fn ft_aggregate_skips_the_count() {
        let value = Value::Array(vec![
            Value::Int(1),
            Value::Array(vec![b("condition"), b("new"), b("num"), b("3")]),
        ]);
        let table = aggregate_table(&value).unwrap();
        assert_eq!(table.columns, ["condition", "num"]);
        assert_eq!(table.rows, [vec!["new".to_string(), "3".to_string()]]);
    }

    #[test]
    fn ft_aggregate_resp3_unwraps_attributes() {
        let value = Value::Map(vec![
            (b("total_results"), Value::Int(1)),
            (
                b("results"),
                Value::Array(vec![Value::Map(vec![
                    (
                        b("extra_attributes"),
                        Value::Map(vec![(b("condition"), b("new")), (b("num"), b("3"))]),
                    ),
                    (b("score"), b("1")),
                ])]),
            ),
        ]);
        let table = aggregate_table(&value).unwrap();
        assert_eq!(table.columns, ["condition", "num", "score"]);
        assert_eq!(
            table.rows,
            [vec!["new".to_string(), "3".to_string(), "1".to_string()]]
        );
        assert!(table.key_column.is_none());
    }

    #[test]
    fn other_commands_stay_text() {
        let pairs = Value::Array(vec![b("a"), b("1")]);
        for cmd in ["GET", "HGETALL", "INFO", "KEYS", "JSON.GET", "FT.PROFILE"] {
            assert!(
                table_for(&pairs, cmd, &[], &HashSet::new()).is_none(),
                "{cmd}"
            );
        }
        assert!(table_for(&b("id=1"), "CLIENT", &[b"KILL".to_vec()], &HashSet::new()).is_none());
        assert!(
            table_for(
                &b("id=1 addr=a"),
                "client",
                &[b"list".to_vec()],
                &HashSet::new()
            )
            .is_some()
        );
    }

    #[test]
    fn table_keeps_the_first_1000_rows() {
        let text = (0..1001)
            .map(|i| format!("id={i}"))
            .collect::<Vec<_>>()
            .join("\n");
        let table = client_list_table(&b(&text)).unwrap();
        assert_eq!(table.rows.len(), 1000);
        assert!(table.truncated);
        assert_eq!(table.rows[0], ["0"]);
        assert_eq!(table.rows[999], ["999"]);
    }

    #[test]
    fn ft_info_is_two_columns() {
        let value = Value::Array(vec![b("index_name"), b("idx")]);
        let table = info_table(&value).unwrap();
        assert_eq!(table.columns, ["field", "value"]);
        assert_eq!(
            table.rows,
            [vec!["index_name".to_string(), "idx".to_string()]]
        );
        assert!(table.key_column.is_none());
    }

    #[test]
    fn search_asks_ft_info_for_vector_names() {
        let info = Value::Array(vec![
            b("attributes"),
            Value::Array(vec![Value::Array(vec![
                b("identifier"),
                b("vector_embeddings"),
                b("attribute"),
                b("vector_embeddings"),
                b("type"),
                b("VECTOR"),
            ])]),
        ]);
        let names = vector_fields_for_search("ft.search", &[b"idx".to_vec()], |_| Ok(info.clone()));
        assert!(names.contains("vector_embeddings"));
        let skipped = vector_fields_for_search("GET", &[b"idx".to_vec()], |_| {
            panic!("非 FT.SEARCH 不应再查 FT.INFO");
        });
        assert!(skipped.is_empty());
        let missing = vector_fields_for_search("FT.SEARCH", &[b"idx".to_vec()], |_| {
            Err(redis::RedisError::from((
                redis::ErrorKind::Parse,
                "unknown index",
            )))
        });
        assert!(missing.is_empty());
    }
}
