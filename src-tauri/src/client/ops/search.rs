//! RedisSearch 的命令拼装、发送和回复解析。
//!
//! Redis 8 集群上，这些命令打到任意一个主节点即可。协调器会把
//! `FT.CREATE`、`FT.ALTER`、`FT.DROPINDEX`、`FT.SYNUPDATE` 同步到各分片；
//! `FT.SEARCH`、`FT.INFO`、`FT.TAGVALS`、`FT.SYNDUMP`、`FT._LIST` 也由该节点汇总。
//! 单机就是当前连接。集群不要走 `query()`：命令没有键，redis-rs 会按参数算槽。
//! 样例文档的 `HSET` / `JSON.SET` 有键，仍按槽位转发。

use crate::model::*;
use crate::support::error::AppError;
use crate::support::format::parse_command;
use crate::support::tty::redis_value_to_cli_display;
use crate::support::util::{AnyResult, redis_value_to_string};
use anyhow::bail;
use redis::{Commands, Value};
use std::collections::HashSet;

/// 一次查询要发出的命令，以及要按向量解开的字段。
pub struct PreparedSearch {
    pub cmd: redis::Cmd,
    pub vectors: HashSet<String>,
}

/// 拼 `FT.SEARCH`。空查询按 `*`。条数用调用方传入的值，不再封顶。
pub fn prepare_search(param: &SearchQueryParam) -> AnyResult<PreparedSearch> {
    let index = param.index.trim();
    if index.is_empty() {
        bail!(AppError::EmptyParameters);
    }
    let query = param.query.trim();
    let mut cmd = redis::cmd("FT.SEARCH");
    cmd.arg(index)
        .arg(if query.is_empty() { "*" } else { query });
    if param.with_scores {
        cmd.arg("WITHSCORES");
    }
    if param.no_content {
        cmd.arg("NOCONTENT");
    }
    cmd.arg("LIMIT").arg(param.offset).arg(param.count);
    Ok(PreparedSearch {
        cmd,
        vectors: param.vector_fields.iter().cloned().collect(),
    })
}

/// `FT.TAGVALS`。空索引名或空字段名当参数错误。字段名是 schema 属性名。
pub fn tagvals_cmd(index: &str, field: &str) -> AnyResult<redis::Cmd> {
    let index = index.trim();
    let field = field.trim();
    if index.is_empty() || field.is_empty() {
        bail!(AppError::EmptyParameters);
    }
    let mut cmd = redis::cmd("FT.TAGVALS");
    cmd.arg(index).arg(field);
    Ok(cmd)
}

/// `FT.TAGVALS`：RESP2 数组，或 RESP3 的数组 / 集合。空回复当成没有标签。
pub fn parse_ft_tagvals(value: Value) -> AnyResult<Vec<String>> {
    match value {
        Value::Nil => Ok(Vec::new()),
        Value::Array(arr) | Value::Set(arr) => Ok(arr.into_iter().map(|v| text(&v)).collect()),
        _ => bail!(invalid("FT.TAGVALS")),
    }
}

/// `FT.SYNDUMP`。空索引名当参数错误。
pub fn syndump_cmd(index: &str) -> AnyResult<redis::Cmd> {
    let index = index.trim();
    if index.is_empty() {
        bail!(AppError::EmptyParameters);
    }
    let mut cmd = redis::cmd("FT.SYNDUMP");
    cmd.arg(index);
    Ok(cmd)
}

/// `FT.SYNDUMP`：RESP2 是「词、组号数组」交替，RESP3 是词到组号数组的 Map。
/// 组号也可能是单个字符串。一个词可以同时属于多组。空回复当成没有同义词。
pub fn parse_ft_syndump(value: Value) -> AnyResult<Vec<(String, String)>> {
    match value {
        Value::Nil => Ok(Vec::new()),
        Value::Array(arr) => {
            if arr.len() % 2 != 0 {
                bail!(invalid("FT.SYNDUMP"));
            }
            let mut out = Vec::new();
            let mut i = 0;
            while i < arr.len() {
                push_syn_pairs(&mut out, &arr[i], &arr[i + 1]);
                i += 2;
            }
            Ok(out)
        }
        Value::Map(map) => {
            let mut out = Vec::new();
            for (term, groups) in map {
                push_syn_pairs(&mut out, &term, &groups);
            }
            Ok(out)
        }
        _ => bail!(invalid("FT.SYNDUMP")),
    }
}

/// 把一个词和它的组号展开成多对。组号是数组或集合时，每个组号一对。
fn push_syn_pairs(out: &mut Vec<(String, String)>, term: &Value, groups: &Value) {
    let term = text(term);
    match groups {
        Value::Array(ids) | Value::Set(ids) => {
            for id in ids {
                out.push((term.clone(), text(id)));
            }
        }
        other => out.push((term, text(other))),
    }
}

/// `FT.SYNUPDATE`。空索引、空组号或没有词，都当参数错误。词两边的空白去掉，空词丢掉。
pub fn synupdate_cmd(index: &str, group: &str, terms: &[String]) -> AnyResult<redis::Cmd> {
    let index = index.trim();
    let group = group.trim();
    let terms: Vec<&str> = terms
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if index.is_empty() || group.is_empty() || terms.is_empty() {
        bail!(AppError::EmptyParameters);
    }
    let mut cmd = redis::cmd("FT.SYNUPDATE");
    cmd.arg(index).arg(group);
    for term in terms {
        cmd.arg(term);
    }
    Ok(cmd)
}

/// 把「词、组号」收成一组一行。组号、组内的词都按字序排，重复的词只留一次。
pub fn group_synonyms(pairs: Vec<(String, String)>) -> Vec<SearchSynGroup> {
    use std::collections::{BTreeMap, BTreeSet};

    let mut map: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (term, group) in pairs {
        if term.is_empty() || group.is_empty() {
            continue;
        }
        map.entry(group).or_default().insert(term);
    }
    map.into_iter()
        .map(|(group, terms)| SearchSynGroup {
            group,
            terms: terms.into_iter().collect(),
        })
        .collect()
}

/// `FT.DROPINDEX`。`delete_docs` 为真时带 `DD`，连文档键一起删。空名当参数错误。
pub fn drop_cmd(index: &str, delete_docs: bool) -> AnyResult<redis::Cmd> {
    let index = index.trim();
    if index.is_empty() {
        bail!(AppError::EmptyParameters);
    }
    let mut cmd = redis::cmd("FT.DROPINDEX");
    cmd.arg(index);
    if delete_docs {
        cmd.arg("DD");
    }
    Ok(cmd)
}

/// 样例索引名。已有同名索引时整次跳过，避免盖掉文档。
pub fn sample_index_name(kind: &str) -> AnyResult<&'static str> {
    Ok(sample_of(kind)?.index)
}

/// 按样例文件逐行执行 `HSET` / `JSON.SET`。集群连接会按键槽位转发。
pub fn apply_sample_data(conn: &mut impl Commands, kind: &str) -> AnyResult<()> {
    exec_lines(conn, sample_of(kind)?.data)
}

/// 把编辑器里的一条 `FT.CREATE` 收成命令。换行当空格。其它命令拒绝。
pub fn create_cmd(text: &str) -> AnyResult<redis::Cmd> {
    let text = text.trim();
    if text.is_empty() {
        bail!(AppError::EmptyParameters);
    }
    let (name, args) = parse_command(text)?;
    if !name.eq_ignore_ascii_case("FT.CREATE") {
        bail!(AppError::SearchCreateNotFtCreate);
    }
    // 至少要有索引名。类型、前缀、SCHEMA 交给 Redis 自己验。
    if args.first().is_none_or(|arg| arg.is_empty()) {
        bail!(AppError::EmptyParameters);
    }
    let mut cmd = redis::cmd("FT.CREATE");
    cmd.arg(&args);
    Ok(cmd)
}

/// 把编辑器里的一条 `FT.ALTER` 收成命令。换行当空格。其它命令拒绝。
/// 只用来给已有索引加字段；类型和 `SCHEMA ADD` 交给 Redis 自己验。
pub fn alter_cmd(text: &str) -> AnyResult<redis::Cmd> {
    let text = text.trim();
    if text.is_empty() {
        bail!(AppError::EmptyParameters);
    }
    let (name, args) = parse_command(text)?;
    if !name.eq_ignore_ascii_case("FT.ALTER") {
        bail!(AppError::SearchAlterNotFtAlter);
    }
    // 至少要有索引名。
    if args.first().is_none_or(|arg| arg.is_empty()) {
        bail!(AppError::EmptyParameters);
    }
    let mut cmd = redis::cmd("FT.ALTER");
    cmd.arg(&args);
    Ok(cmd)
}

/// 样例的 `FT.CREATE`。单机和集群都只发一次。
pub fn sample_create_cmd(kind: &str) -> AnyResult<redis::Cmd> {
    let mut cmd = redis::cmd("FT.CREATE");
    cmd.arg(sample_of(kind)?.create);
    Ok(cmd)
}

/// `FT._LIST`：索引名。空回复当成没有索引。
pub fn parse_ft_list(value: Value) -> AnyResult<Vec<String>> {
    let names = match value {
        Value::Nil => Vec::new(),
        Value::Array(arr) | Value::Set(arr) => arr
            .into_iter()
            .map(|v| text(&v))
            .filter(|s| !s.is_empty())
            .collect(),
        _ => bail!(invalid("FT._LIST")),
    };
    Ok(names)
}

/// `FT.INFO`：列表用到的标量和字段定义单独取出。
/// `raw` 给索引信息弹框。RESP2 的交替数组收成对象，和 RESP3 同一形状；终端仍按 redis-cli `--json`。
pub fn parse_ft_info(name: &str, value: Value) -> AnyResult<SearchIndexInfo> {
    let raw = redis_value_to_cli_display(
        ft_info_display_value(value.clone()),
        Some(CliOutputMode::Json),
        "FT.INFO",
        &[name.as_bytes().to_vec()],
    );
    let pairs = as_pairs(value)?;
    let mut key_type = String::new();
    let mut prefixes = String::new();
    let mut num_docs = String::new();
    let mut num_records = String::new();
    let mut num_terms = String::new();
    let mut fields = Vec::new();
    for (k, v) in pairs {
        match k.to_ascii_lowercase().as_str() {
            "index_definition" => {
                let (kt, px) = parse_definition(v)?;
                key_type = kt;
                prefixes = px;
            }
            "attributes" => fields = parse_attributes(v)?,
            "num_docs" => num_docs = text(&v),
            "num_records" => num_records = text(&v),
            "num_terms" => num_terms = text(&v),
            _ => {}
        }
    }
    Ok(SearchIndexInfo {
        name: name.to_string(),
        key_type,
        prefixes,
        num_docs,
        num_records,
        num_terms,
        fields,
        raw,
    })
}

/// `FT.SEARCH`：RESP2 数组或 RESP3 Map。`vectors` 里的字段按小端 FLOAT32 解开。
pub fn parse_ft_search(
    value: Value,
    with_scores: bool,
    vectors: &HashSet<String>,
) -> AnyResult<SearchQueryResult> {
    match value {
        Value::Array(arr) => parse_search_array(arr, with_scores, vectors),
        Value::Map(map) => parse_search_map(map, vectors),
        _ => bail!(invalid("FT.SEARCH")),
    }
}

/// 发送一条没有键的搜索命令。
///
/// 单机实现是 `query`。集群实现是 `route_command` 到任意一个主节点。
/// 见文件顶部：Redis 8 由协调器同步或汇总，客户端不再逐个主节点发。
pub trait SearchCmd: Commands {
    fn search_cmd(&mut self, cmd: &redis::Cmd) -> redis::RedisResult<Value>;
}

/// `FT._LIST`。名字排序去重。
pub fn list_index_names(conn: &mut impl SearchCmd) -> AnyResult<Vec<String>> {
    let listed = conn.search_cmd(&redis::cmd("FT._LIST"))?;
    let mut names = parse_ft_list(listed)?;
    names.sort();
    names.dedup();
    Ok(names)
}

/// 索引列表：`FT._LIST` 之后逐个 `FT.INFO`。
pub fn list_indexes(conn: &mut impl SearchCmd) -> AnyResult<Vec<SearchIndexInfo>> {
    let names = list_index_names(conn)?;
    let mut indexes = Vec::with_capacity(names.len());
    for name in names {
        let mut cmd = redis::cmd("FT.INFO");
        cmd.arg(&name);
        indexes.push(parse_ft_info(&name, conn.search_cmd(&cmd)?)?);
    }
    Ok(indexes)
}

/// `FT.SEARCH`。
pub fn run_search(
    conn: &mut impl SearchCmd,
    param: &SearchQueryParam,
) -> AnyResult<SearchQueryResult> {
    let prepared = prepare_search(param)?;
    let value = conn.search_cmd(&prepared.cmd)?;
    parse_ft_search(value, param.with_scores, &prepared.vectors)
}

/// `FT.DROPINDEX`。`delete_docs` 只决定命令里有没有 `DD`。
pub fn run_index_drop(conn: &mut impl SearchCmd, index: &str, delete_docs: bool) -> AnyResult<()> {
    let _: Value = conn.search_cmd(&drop_cmd(index, delete_docs)?)?;
    Ok(())
}

/// 用户编辑的一条 `FT.CREATE`。重复创建把服务端错误原样交出去。
pub fn run_index_create(conn: &mut impl SearchCmd, command: &str) -> AnyResult<()> {
    let _: Value = conn.search_cmd(&create_cmd(command)?)?;
    Ok(())
}

/// 用户编辑的一条 `FT.ALTER`。字段已存在把服务端错误原样交出去。
pub fn run_index_alter(conn: &mut impl SearchCmd, command: &str) -> AnyResult<()> {
    let _: Value = conn.search_cmd(&alter_cmd(command)?)?;
    Ok(())
}

/// `FT.TAGVALS`。结果排序去重。
pub fn run_tag_vals(conn: &mut impl SearchCmd, index: &str, field: &str) -> AnyResult<Vec<String>> {
    let value = conn.search_cmd(&tagvals_cmd(index, field)?)?;
    let mut tags = parse_ft_tagvals(value)?;
    tags.sort();
    tags.dedup();
    Ok(tags)
}

/// `FT.SYNDUMP`，按组号收拢。
pub fn run_syn_dump(conn: &mut impl SearchCmd, index: &str) -> AnyResult<Vec<SearchSynGroup>> {
    let value = conn.search_cmd(&syndump_cmd(index)?)?;
    Ok(group_synonyms(parse_ft_syndump(value)?))
}

/// `FT.SYNUPDATE`，往组里追加词。
pub fn run_syn_update(
    conn: &mut impl SearchCmd,
    index: &str,
    group: &str,
    terms: &[String],
) -> AnyResult<()> {
    let _: Value = conn.search_cmd(&synupdate_cmd(index, group, terms)?)?;
    Ok(())
}

/// 写入样例文档并 `FT.CREATE`。同名索引已在时不写键、不重建。
pub fn run_sample_load(conn: &mut impl SearchCmd, kind: &str) -> AnyResult<SearchSampleResult> {
    let index = sample_index_name(kind)?.to_string();
    let listed = conn.search_cmd(&redis::cmd("FT._LIST"))?;
    if parse_ft_list(listed)?.iter().any(|name| name == &index) {
        return Ok(SearchSampleResult {
            created: false,
            index,
        });
    }
    // 文档命令带键，集群按槽位转发，不走 search_cmd。
    apply_sample_data(conn, kind)?;
    let _: Value = conn.search_cmd(&sample_create_cmd(kind)?)?;
    Ok(SearchSampleResult {
        created: true,
        index,
    })
}

// ------------------------------ 仅本文件使用 ------------------------------

/// Redis Insight 的样例命令，一行一条 redis-cli 命令，编译期嵌进 exe。
const BIKES: &str = include_str!("../../../samples/bikes");
const MOVIES: &str = include_str!("../../../samples/movies");

const BIKES_CREATE: &[&str] = &[
    "idx:bikes_vss",
    "ON",
    "HASH",
    "PREFIX",
    "1",
    "bikes:",
    "SCHEMA",
    "model",
    "TEXT",
    "NOSTEM",
    "SORTABLE",
    "brand",
    "TEXT",
    "NOSTEM",
    "SORTABLE",
    "price",
    "NUMERIC",
    "SORTABLE",
    "type",
    "TAG",
    "material",
    "TAG",
    "weight",
    "NUMERIC",
    "SORTABLE",
    "description_embeddings",
    "VECTOR",
    "FLAT",
    "10",
    "TYPE",
    "FLOAT32",
    "DIM",
    "768",
    "DISTANCE_METRIC",
    "L2",
    "INITIAL_CAP",
    "111",
    "BLOCK_SIZE",
    "111",
];

const MOVIES_CREATE: &[&str] = &[
    "idx:movies_vss",
    "ON",
    "JSON",
    "PREFIX",
    "1",
    "movie:",
    "SCHEMA",
    "$.title",
    "AS",
    "title",
    "TEXT",
    "$.genres[*]",
    "AS",
    "genres",
    "TAG",
    "$.plot",
    "AS",
    "plot",
    "TEXT",
    "$.year",
    "AS",
    "year",
    "NUMERIC",
    "$.embedding",
    "AS",
    "embedding",
    "VECTOR",
    "FLAT",
    "6",
    "TYPE",
    "FLOAT32",
    "DIM",
    "8",
    "DISTANCE_METRIC",
    "COSINE",
];

struct Sample {
    index: &'static str,
    data: &'static str,
    create: &'static [&'static str],
}

/// `bikes` 是 Hash 电商样例，`movies` 是 JSON 电影样例。
fn sample_of(kind: &str) -> AnyResult<Sample> {
    match kind.trim() {
        "bikes" => Ok(Sample {
            index: "idx:bikes_vss",
            data: BIKES,
            create: BIKES_CREATE,
        }),
        "movies" => Ok(Sample {
            index: "idx:movies_vss",
            data: MOVIES,
            create: MOVIES_CREATE,
        }),
        _ => bail!(AppError::EmptyParameters),
    }
}

/// 跳过空行，一行失败就停，不继续后面的键。
fn exec_lines(conn: &mut impl Commands, data: &str) -> AnyResult<()> {
    for line in data.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let (cmd, args) = parse_command(line)?;
        if cmd.is_empty() {
            bail!(AppError::EmptyParameters);
        }
        redis::cmd(cmd.as_str()).arg(&args).exec(conn)?;
    }
    Ok(())
}

/// 回复形状不对，带上字段名方便页面报错。
fn invalid(detail: &str) -> anyhow::Error {
    AppError::SearchReplyInvalid {
        detail: detail.into(),
    }
    .into()
}

/// Redis 值转成字符串。嵌套结构不加分隔符。
fn text(value: &Value) -> String {
    redis_value_to_string(value.clone(), "")
}

/// Redis 值转成字符串。嵌套结构用空格隔开，给选项和扩展字段用。
fn text_sep(value: &Value) -> String {
    redis_value_to_string(value.clone(), " ")
}

/// 把整数回复读成 `u64`。解析失败按回复无效处理。
fn as_u64(value: &Value) -> AnyResult<u64> {
    match value {
        Value::Int(n) if *n >= 0 => Ok(*n as u64),
        Value::BigNumber(n) => n.to_string().parse().map_err(|_| invalid("total")),
        other => text(other).parse::<u64>().map_err(|_| invalid("total")),
    }
}

/// RESP2 扁平键值数组，或 RESP3 Map。
fn as_pairs(value: Value) -> AnyResult<Vec<(String, Value)>> {
    match value {
        Value::Array(arr) => {
            if arr.len() % 2 != 0 {
                bail!(invalid("pairs"));
            }
            let mut out = Vec::with_capacity(arr.len() / 2);
            let mut i = 0;
            while i < arr.len() {
                out.push((text(&arr[i]), arr[i + 1].clone()));
                i += 2;
            }
            Ok(out)
        }
        Value::Map(map) => Ok(map.into_iter().map(|(k, v)| (text(&k), v)).collect()),
        _ => bail!(invalid("pairs")),
    }
}

/// 这个属性键会带走下一个词。裸标志（如 `WITHSUFFIXTRIE`）不在这里。
fn takes_value(token: &str) -> bool {
    matches!(
        token.to_ascii_lowercase().as_str(),
        "identifier"
            | "attribute"
            | "type"
            | "weight"
            | "separator"
            | "phonetic"
            | "algorithm"
            | "dim"
            | "distance_metric"
            | "m"
            | "ef_construction"
            | "ef_runtime"
            | "initial_cap"
            | "block_size"
    )
}

/// 把一个字段定义摊成词序列。Map 按键、值交替展开。
fn tokens_of(value: Value) -> Vec<String> {
    match value {
        Value::Array(arr) => arr.iter().map(text).collect(),
        Value::Map(map) => {
            let mut tokens = Vec::with_capacity(map.len() * 2);
            for (k, v) in map {
                tokens.push(text(&k));
                tokens.push(text(&v));
            }
            tokens
        }
        other => vec![text(&other)],
    }
}

/// 属性数组里裸标志（WITHSUFFIXTRIE 等）不能吃掉下一个词。
fn parse_one_attr(value: Value) -> SearchIndexField {
    let tokens = tokens_of(value);
    let mut identifier = String::new();
    let mut attribute = String::new();
    let mut field_type = String::new();
    let mut weight = String::new();
    let mut options = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        let token = &tokens[i];
        if takes_value(token) && i + 1 < tokens.len() {
            let val = &tokens[i + 1];
            let key = token.to_ascii_lowercase();
            if key == "identifier" && identifier.is_empty() {
                identifier = val.clone();
            } else if key == "attribute" && attribute.is_empty() {
                attribute = val.clone();
            } else if key == "type" && field_type.is_empty() {
                field_type = val.clone();
            } else if key == "weight" && weight.is_empty() {
                weight = val.clone();
            } else {
                options.push(format!("{token} {val}"));
            }
            i += 2;
        } else {
            options.push(token.clone());
            i += 1;
        }
    }
    SearchIndexField {
        identifier,
        attribute,
        field_type,
        weight,
        options: options.join(" "),
    }
}

/// `attributes` 数组。空回复当成没有字段。
fn parse_attributes(value: Value) -> AnyResult<Vec<SearchIndexField>> {
    match value {
        Value::Nil => Ok(Vec::new()),
        Value::Array(items) => Ok(items.into_iter().map(parse_one_attr).collect()),
        other => bail!(invalid(&format!("attributes {}", text_sep(&other)))),
    }
}

/// RESP2 的 `FT.INFO` 顶层是键值交替数组。收成 Map 后，JSON 才和 RESP3 一样可读。
fn ft_info_display_value(value: Value) -> Value {
    match value {
        Value::Array(arr) => fold_info_map(arr),
        other => other,
    }
}

fn fold_info_map(arr: Vec<Value>) -> Value {
    if !arr.len().is_multiple_of(2) {
        return Value::Array(arr);
    }
    let mut pairs = Vec::with_capacity(arr.len() / 2);
    let mut i = 0;
    while i < arr.len() {
        let name = text(&arr[i]).to_ascii_lowercase();
        pairs.push((
            arr[i].clone(),
            normalize_info_child(&name, arr[i + 1].clone()),
        ));
        i += 2;
    }
    Value::Map(pairs)
}

fn normalize_info_child(key: &str, value: Value) -> Value {
    match key {
        "index_definition" | "gc_stats" | "cursor_stats" | "dialect_stats" | "index errors"
        | "index_errors" => match value {
            Value::Array(arr) if arr.len() % 2 == 0 => fold_info_map(arr),
            other => other,
        },
        "attributes" | "field statistics" | "field_statistics" => match value {
            Value::Array(items) => {
                Value::Array(items.into_iter().map(normalize_info_record).collect())
            }
            other => other,
        },
        _ => value,
    }
}

/// 字段定义里 `SORTABLE` 这类裸标志没有值。收成 `flags`，避免和后一个标志配成一对。
fn normalize_info_record(value: Value) -> Value {
    let Value::Array(arr) = value else {
        return value;
    };
    let mut pairs = Vec::new();
    let mut flags = Vec::new();
    let mut i = 0;
    while i < arr.len() {
        let key = text(&arr[i]);
        let bare = is_info_flag(&key);
        if !bare && i + 1 < arr.len() {
            let name = key.to_ascii_lowercase();
            pairs.push((
                arr[i].clone(),
                normalize_info_child(&name, arr[i + 1].clone()),
            ));
            i += 2;
        } else {
            flags.push(arr[i].clone());
            i += 1;
        }
    }
    if !flags.is_empty() {
        pairs.push((Value::BulkString(b"flags".to_vec()), Value::Array(flags)));
    }
    Value::Map(pairs)
}

fn is_info_flag(token: &str) -> bool {
    !token.is_empty()
        && !takes_value(token)
        && token
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

/// 前缀列表拼成逗号分隔的一行。
fn join_prefixes(value: &Value) -> String {
    match value {
        Value::Array(items) | Value::Set(items) => items
            .iter()
            .map(text)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(", "),
        other => text(other),
    }
}

/// `index_definition`：取出 `key_type` 和 `prefixes`。
fn parse_definition(value: Value) -> AnyResult<(String, String)> {
    let pairs = as_pairs(value)?;
    let mut key_type = String::new();
    let mut prefixes = String::new();
    for (k, v) in pairs {
        match k.to_ascii_lowercase().as_str() {
            "key_type" => key_type = text(&v),
            "prefixes" => prefixes = join_prefixes(&v),
            _ => {}
        }
    }
    Ok((key_type, prefixes))
}

/// 文档字段：RESP2 交替数组，或 RESP3 Map。
fn field_pairs(value: &Value, vectors: &HashSet<String>) -> AnyResult<Vec<SearchKv>> {
    match value {
        Value::Nil => Ok(Vec::new()),
        Value::Array(arr) => {
            if arr.len() % 2 != 0 {
                bail!(invalid("FT.SEARCH fields"));
            }
            let mut out = Vec::with_capacity(arr.len() / 2);
            let mut i = 0;
            while i < arr.len() {
                let field = text(&arr[i]);
                out.push(SearchKv {
                    value: field_text(&field, &arr[i + 1], vectors),
                    field,
                });
                i += 2;
            }
            Ok(out)
        }
        Value::Map(map) => Ok(map
            .iter()
            .map(|(k, v)| {
                let field = text(k);
                SearchKv {
                    value: field_text(&field, v, vectors),
                    field,
                }
            })
            .collect()),
        _ => bail!(invalid("FT.SEARCH fields")),
    }
}

/// Hash 的 VECTOR 是小端 FLOAT32 二进制。JSON 数组仍是文本，不拆字节。
fn field_text(name: &str, value: &Value, vectors: &HashSet<String>) -> String {
    if vectors.contains(name)
        && let Value::BulkString(bytes) = value
    {
        if let Ok(text) = std::str::from_utf8(bytes)
            && text.trim_start().starts_with('[')
        {
            return text.to_string();
        }
        if let Some(text) = format_f32_le(bytes) {
            return text;
        }
    }
    text_sep(value)
}

/// 长度是 4 的倍数时，按小端 FLOAT32 拼成 JSON 数组，和 JSON 文档里的向量一样。
fn format_f32_le(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() || !bytes.len().is_multiple_of(4) {
        return None;
    }
    let mut parts = Vec::with_capacity(bytes.len() / 4);
    for chunk in bytes.as_chunks::<4>().0 {
        let n = f32::from_le_bytes(*chunk);
        parts.push(format_f32(n));
    }
    Some(format!("[{}]", parts.join(", ")))
}

/// 普通小数，不用科学计数法，也不截成固定位数。`-0` 写成 `0`。
fn format_f32(n: f32) -> String {
    if !n.is_finite() {
        return "null".to_string();
    }
    if n == 0.0 {
        return "0".to_string();
    }
    format!("{n}")
}

fn is_field_container(value: &Value) -> bool {
    matches!(value, Value::Array(_) | Value::Map(_) | Value::Nil)
}

/// RESP2 的 `FT.SEARCH`：`[total, key, fields]`，带分数时是 `key, score, fields`。`NOCONTENT` 只有键。
fn parse_search_array(
    arr: Vec<Value>,
    with_scores: bool,
    vectors: &HashSet<String>,
) -> AnyResult<SearchQueryResult> {
    if arr.is_empty() {
        bail!(invalid("FT.SEARCH"));
    }
    let total = as_u64(&arr[0])?;
    let mut hits = Vec::new();
    let mut i = 1;
    while i < arr.len() {
        let key = text(&arr[i]);
        i += 1;
        let mut score = None;
        if with_scores {
            if i >= arr.len() {
                bail!(invalid("FT.SEARCH score"));
            }
            score = Some(text(&arr[i]));
            i += 1;
        }
        // NOCONTENT 时键后面没有字段数组，下一项直接是下一个键
        if i >= arr.len() || !is_field_container(&arr[i]) {
            hits.push(SearchHit {
                key,
                score,
                fields: Vec::new(),
            });
            continue;
        }
        let fields = field_pairs(&arr[i], vectors)?;
        i += 1;
        hits.push(SearchHit { key, score, fields });
    }
    Ok(SearchQueryResult { total, hits })
}

/// RESP3 的 `FT.SEARCH`：`total_results` 加 `results` 里的 `id` / `score` / `extra_attributes`。
fn parse_search_map(
    map: Vec<(Value, Value)>,
    vectors: &HashSet<String>,
) -> AnyResult<SearchQueryResult> {
    let mut total = 0u64;
    let mut raw_hits: Option<Value> = None;
    for (k, v) in map {
        match text(&k).as_str() {
            "total_results" => total = as_u64(&v)?,
            "results" => raw_hits = Some(v),
            _ => {}
        }
    }
    let Some(Value::Array(items)) = raw_hits else {
        bail!(invalid("FT.SEARCH results"));
    };
    let mut hits = Vec::with_capacity(items.len());
    for item in items {
        let pairs = as_pairs(item)?;
        let mut key = String::new();
        let mut score = None;
        let mut fields = Vec::new();
        for (k, v) in pairs {
            match k.as_str() {
                "id" => key = text(&v),
                "score" => score = Some(text(&v)),
                "extra_attributes" => fields = field_pairs(&v, vectors)?,
                _ => {}
            }
        }
        if key.is_empty() {
            bail!(invalid("FT.SEARCH id"));
        }
        hits.push(SearchHit { key, score, fields });
    }
    Ok(SearchQueryResult { total, hits })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试里把字面量收成 bulk string。
    fn b(s: &str) -> Value {
        Value::BulkString(s.as_bytes().to_vec())
    }

    /// 裸标志留在选项里，不把下一个词吃掉。
    #[test]
    fn attribute_keeps_bare_flags() {
        let field = parse_one_attr(Value::Array(vec![
            b("identifier"),
            b("$.title"),
            b("attribute"),
            b("title"),
            b("type"),
            b("TEXT"),
            b("WEIGHT"),
            b("1"),
            b("WITHSUFFIXTRIE"),
            b("SORTABLE"),
        ]));
        assert_eq!(field.identifier, "$.title");
        assert_eq!(field.attribute, "title");
        assert_eq!(field.field_type, "TEXT");
        assert_eq!(field.weight, "1");
        assert!(!field.options.to_ascii_lowercase().contains("weight"));
        assert!(field.options.contains("WITHSUFFIXTRIE"));
        assert!(field.options.split_whitespace().any(|w| w == "SORTABLE"));
    }

    /// 读出列表用到的标量和字段，原文按终端 JSON 保留。
    #[test]
    fn ft_info_reads_scalars_and_keeps_raw_json() {
        let raw = Value::Array(vec![
            b("index_name"),
            b("idx"),
            b("index_definition"),
            Value::Array(vec![
                b("key_type"),
                b("HASH"),
                b("prefixes"),
                Value::Array(vec![b("user:")]),
            ]),
            b("attributes"),
            Value::Array(vec![Value::Array(vec![
                b("identifier"),
                b("name"),
                b("attribute"),
                b("name"),
                b("type"),
                b("TEXT"),
                b("WITHSUFFIXTRIE"),
            ])]),
            b("num_docs"),
            Value::Int(3),
            b("num_records"),
            b("9"),
            b("num_terms"),
            b("12"),
            b("gc_stats"),
            Value::Array(vec![b("bytes_collected"), b("0")]),
        ]);
        let info = parse_ft_info("idx", raw).unwrap();
        assert_eq!(info.key_type, "HASH");
        assert_eq!(info.prefixes, "user:");
        assert_eq!(info.num_docs, "3");
        assert_eq!(info.num_records, "9");
        assert_eq!(info.num_terms, "12");
        assert_eq!(info.fields.len(), 1);
        assert!(info.fields[0].options.contains("WITHSUFFIXTRIE"));
        let parsed: serde_json::Value = serde_json::from_str(&info.raw).unwrap();
        assert_eq!(parsed["index_definition"]["key_type"], "HASH");
        assert_eq!(parsed["index_definition"]["prefixes"][0], "user:");
        assert_eq!(parsed["attributes"][0]["identifier"], "name");
        assert_eq!(parsed["attributes"][0]["flags"][0], "WITHSUFFIXTRIE");
        assert_eq!(parsed["num_docs"], 3);
        assert_eq!(parsed["gc_stats"]["bytes_collected"], "0");
    }

    /// Hash 向量按小端 FLOAT32 解开成 JSON 数组；已是数组的文本和普通字段不动。
    #[test]
    fn vector_blob_becomes_float_list() {
        let mut bytes = Vec::new();
        bytes.extend(1.5f32.to_le_bytes());
        bytes.extend((-0.25f32).to_le_bytes());
        bytes.extend(0.0f32.to_le_bytes());
        bytes.extend(0.123_456_79f32.to_le_bytes());
        let raw = Value::Array(vec![
            Value::Int(1),
            b("bikes:1"),
            Value::Array(vec![
                b("description_embeddings"),
                Value::BulkString(bytes),
                b("material"),
                b("carbon"),
                b("embedding"),
                b("[0.1, 0.2]"),
            ]),
        ]);
        let mut vectors = HashSet::new();
        vectors.insert("description_embeddings".to_string());
        vectors.insert("embedding".to_string());
        let page = parse_ft_search(raw, false, &vectors).unwrap();
        assert_eq!(page.hits[0].fields[0].value, "[1.5, -0.25, 0, 0.12345679]");
        assert_eq!(page.hits[0].fields[1].value, "carbon");
        assert_eq!(page.hits[0].fields[2].value, "[0.1, 0.2]");
    }

    /// RESP2 带 `WITHSCORES` 时，分数夹在键和字段之间。
    #[test]
    fn ft_search_resp2_with_scores() {
        let raw = Value::Array(vec![
            Value::Int(2),
            b("user:1"),
            b("1.5"),
            Value::Array(vec![b("name"), b("ann")]),
            b("user:2"),
            b("0.2"),
            Value::Array(vec![b("name"), b("bob")]),
        ]);
        let page = parse_ft_search(raw, true, &HashSet::new()).unwrap();
        assert_eq!(page.total, 2);
        assert_eq!(page.hits.len(), 2);
        assert_eq!(page.hits[0].key, "user:1");
        assert_eq!(page.hits[0].score.as_deref(), Some("1.5"));
        assert_eq!(page.hits[0].fields[0].value, "ann");
    }

    /// `NOCONTENT` 只有键，没有字段数组。
    #[test]
    fn ft_search_resp2_no_content() {
        let raw = Value::Array(vec![Value::Int(2), b("bikes:1"), b("bikes:2")]);
        let page = parse_ft_search(raw, false, &HashSet::new()).unwrap();
        assert_eq!(page.total, 2);
        assert_eq!(page.hits.len(), 2);
        assert_eq!(page.hits[0].key, "bikes:1");
        assert!(page.hits[0].fields.is_empty());
        assert_eq!(page.hits[1].key, "bikes:2");
    }

    /// RESP3 Map 从 `results` 里取 id 和 extra_attributes。
    #[test]
    fn ft_search_resp3_map() {
        let raw = Value::Map(vec![
            (b("total_results"), Value::Int(1)),
            (
                b("results"),
                Value::Array(vec![Value::Map(vec![
                    (b("id"), b("doc:1")),
                    (b("score"), b("1")),
                    (
                        b("extra_attributes"),
                        Value::Map(vec![(b("title"), b("redis"))]),
                    ),
                ])]),
            ),
        ]);
        let page = parse_ft_search(raw, true, &HashSet::new()).unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(page.hits[0].key, "doc:1");
        assert_eq!(page.hits[0].fields[0].field, "title");
        assert_eq!(page.hits[0].fields[0].value, "redis");
    }

    /// 标签列表是字符串数组或集合。别的形状整页报错，不猜。
    #[test]
    fn ft_tagvals_reads_array_set_and_nil() {
        let arr = parse_ft_tagvals(Value::Array(vec![b("road"), b("mountain")])).unwrap();
        assert_eq!(arr, vec!["road".to_string(), "mountain".to_string()]);
        let set = parse_ft_tagvals(Value::Set(vec![b("carbon")])).unwrap();
        assert_eq!(set, vec!["carbon".to_string()]);
        assert!(parse_ft_tagvals(Value::Nil).unwrap().is_empty());
        assert!(parse_ft_tagvals(Value::Int(1)).is_err());
    }

    /// 索引名和字段名都要有，命令是 FT.TAGVALS。
    #[test]
    fn tagvals_cmd_needs_index_and_field() {
        assert!(tagvals_cmd("  ", "type").is_err());
        assert!(tagvals_cmd("idx", " ").is_err());
        let packed = tagvals_cmd(" idx ", " type ").unwrap().get_packed_command();
        let text = String::from_utf8_lossy(&packed);
        assert!(text.contains("FT.TAGVALS"));
        assert!(text.contains("idx"));
        assert!(text.contains("type"));
    }

    /// 同义词是「词 + 组号数组」。一个词可以进多组。收成组后，组号和词都按字序，重复词去掉。
    #[test]
    fn ft_syndump_groups_terms() {
        let raw = Value::Array(vec![
            b("shalom"),
            Value::Array(vec![b("synonym1"), b("synonym2")]),
            b("hi"),
            Value::Array(vec![b("synonym1")]),
            b("hello"),
            Value::Array(vec![b("synonym1")]),
            b("hello"),
            Value::Array(vec![b("synonym1")]),
            b("bike"),
            b("cycle"),
        ]);
        let groups = group_synonyms(parse_ft_syndump(raw).unwrap());
        assert_eq!(groups.len(), 3);
        assert_eq!(groups[0].group, "cycle");
        assert_eq!(groups[0].terms, vec!["bike".to_string()]);
        assert_eq!(groups[1].group, "synonym1");
        assert_eq!(
            groups[1].terms,
            vec!["hello".to_string(), "hi".to_string(), "shalom".to_string()]
        );
        assert_eq!(groups[2].group, "synonym2");
        assert_eq!(groups[2].terms, vec!["shalom".to_string()]);
    }

    /// Map 和空回复也能读。组号数组要拆开。奇数个元素不算成对，整页报错。
    #[test]
    fn ft_syndump_map_nil_and_odd_array() {
        let raw = Value::Map(vec![(
            b("hello"),
            Value::Array(vec![b("greet"), b("cycle")]),
        )]);
        let groups = group_synonyms(parse_ft_syndump(raw).unwrap());
        assert_eq!(groups[0].group, "cycle");
        assert_eq!(groups[0].terms, vec!["hello".to_string()]);
        assert_eq!(groups[1].group, "greet");
        assert_eq!(groups[1].terms, vec!["hello".to_string()]);
        assert!(parse_ft_syndump(Value::Nil).unwrap().is_empty());
        assert!(parse_ft_syndump(Value::Array(vec![b("only")])).is_err());
        assert!(syndump_cmd(" ").is_err());
        let packed = syndump_cmd(" idx ").unwrap().get_packed_command();
        let text = String::from_utf8_lossy(&packed);
        assert!(text.contains("FT.SYNDUMP"));
        assert!(text.contains("idx"));
    }

    /// 组号和至少一个词都要有。命令是 FT.SYNUPDATE，空白词不发出去。
    #[test]
    fn synupdate_cmd_needs_group_and_terms() {
        assert!(synupdate_cmd(" ", "cycle", &["bike".into()]).is_err());
        assert!(synupdate_cmd("idx", " ", &["bike".into()]).is_err());
        assert!(synupdate_cmd("idx", "cycle", &[]).is_err());
        assert!(synupdate_cmd("idx", "cycle", &[" ".into()]).is_err());
        let packed = synupdate_cmd(" idx ", " cycle ", &[" bike ".into(), "bicycle".into()])
            .unwrap()
            .get_packed_command();
        let text = String::from_utf8_lossy(&packed);
        assert!(text.contains("FT.SYNUPDATE"));
        assert!(text.contains("idx"));
        assert!(text.contains("cycle"));
        assert!(text.contains("bike"));
        assert!(text.contains("bicycle"));
    }

    /// 自行车样例是 111 条 Hash，向量为 768 维 float32。
    #[test]
    fn bikes_lines_are_hset_with_768_floats() {
        let mut n = 0;
        for line in BIKES.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let (cmd, args) = parse_command(line).unwrap();
            assert_eq!(cmd, "HSET");
            assert!(args[0].starts_with(b"bikes:"));
            assert_eq!(args.last().unwrap().len(), 768 * 4);
            n += 1;
        }
        assert_eq!(n, 111);
        assert_eq!(sample_index_name("bikes").unwrap(), "idx:bikes_vss");
        let packed = sample_create_cmd("bikes").unwrap().get_packed_command();
        let text = String::from_utf8_lossy(&packed);
        assert!(text.contains("description_embeddings"));
        assert!(text.contains("768"));
    }

    /// 电影样例是 JSON.SET，索引名与 Insight 的 idx:movies_vss 一致。
    #[test]
    fn movies_lines_are_json_set() {
        let mut n = 0;
        for line in MOVIES.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let (cmd, args) = parse_command(line).unwrap();
            assert_eq!(cmd, "JSON.SET");
            assert!(args[0].starts_with(b"movie:"));
            assert_eq!(&args[1], b"$");
            n += 1;
        }
        assert_eq!(n, 55);
        assert_eq!(sample_index_name("movies").unwrap(), "idx:movies_vss");
        assert!(sample_index_name("nope").is_err());
    }

    /// 把命令参数收成字符串。命令名以 redis 实际发出的为准。
    fn cmd_args(cmd: &redis::Cmd) -> Vec<String> {
        cmd.args_iter()
            .map(|arg| match arg {
                redis::Arg::Simple(bytes) => String::from_utf8(bytes.to_vec()).unwrap(),
                _ => unreachable!("FT.CREATE args are plain bytes"),
            })
            .collect()
    }

    /// 换行和引号收成一条 FT.CREATE。空文本、没有索引名、其它命令都拒绝。
    #[test]
    fn create_cmd_parses_one_ft_create() {
        let cmd =
            create_cmd("ft.create idx\n    ON HASH\n    PREFIX 1 \"user: \"\n    SCHEMA name TEXT")
                .unwrap();
        assert_eq!(
            cmd_args(&cmd),
            [
                "FT.CREATE",
                "idx",
                "ON",
                "HASH",
                "PREFIX",
                "1",
                "user: ",
                "SCHEMA",
                "name",
                "TEXT",
            ]
        );
        assert!(
            create_cmd("  ")
                .unwrap_err()
                .to_string()
                .contains("empty_parameters")
        );
        assert!(
            create_cmd("FT.CREATE")
                .unwrap_err()
                .to_string()
                .contains("empty_parameters")
        );
        assert!(
            create_cmd("FT.DROPINDEX idx")
                .unwrap_err()
                .to_string()
                .contains("search_create_not_ft_create")
        );
    }

    /// 换行收成一条 FT.ALTER。空文本、没有索引名、其它命令都拒绝。
    #[test]
    fn alter_cmd_parses_one_ft_alter() {
        let cmd =
            alter_cmd("ft.alter idx\n    SCHEMA ADD\n      city TEXT\n      year NUMERIC").unwrap();
        assert_eq!(
            cmd_args(&cmd),
            [
                "FT.ALTER", "idx", "SCHEMA", "ADD", "city", "TEXT", "year", "NUMERIC",
            ]
        );
        assert!(
            alter_cmd("  ")
                .unwrap_err()
                .to_string()
                .contains("empty_parameters")
        );
        assert!(
            alter_cmd("FT.ALTER")
                .unwrap_err()
                .to_string()
                .contains("empty_parameters")
        );
        assert!(
            alter_cmd("FT.CREATE idx ON HASH SCHEMA t TEXT")
                .unwrap_err()
                .to_string()
                .contains("search_alter_not_ft_alter")
        );
    }

    /// 默认不带 DD。勾选同时删除文档才附上。
    #[test]
    fn drop_cmd_dd_is_opt_in() {
        assert_eq!(
            cmd_args(&drop_cmd("idx", false).unwrap()),
            ["FT.DROPINDEX", "idx"]
        );
        assert_eq!(
            cmd_args(&drop_cmd("idx", true).unwrap()),
            ["FT.DROPINDEX", "idx", "DD"]
        );
        assert!(drop_cmd("  ", false).is_err());
    }
}
