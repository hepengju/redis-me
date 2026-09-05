//! 将 Redis 键值格式化为 redis-cli 可粘贴执行的命令行（与 `split_redis_args` 对称）。

fn utf8_char_len(b: u8) -> Option<usize> {
    if b <= 0x7f {
        Some(1)
    } else if (b & 0xe0) == 0xc0 {
        Some(2)
    } else if (b & 0xf0) == 0xe0 {
        Some(3)
    } else if (b & 0xf8) == 0xf0 {
        Some(4)
    } else {
        None
    }
}

fn read_utf8_char(bytes: &[u8], i: usize) -> Option<(char, usize)> {
    let len = utf8_char_len(bytes[i])?;
    if i + len > bytes.len() {
        return None;
    }
    let s = std::str::from_utf8(&bytes[i..i + len]).ok()?;
    let ch = s.chars().next()?;
    Some((ch, len))
}

/// 双引号包裹 + C 风格转义（与 redis-cli `sdscatrepr` 一致）
pub fn format_quoted(bytes: &[u8]) -> String {
    let mut s = String::from('"');
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        match b {
            b'"' => {
                s.push_str("\\\"");
                i += 1;
            }
            b'\\' => {
                s.push_str("\\\\");
                i += 1;
            }
            b'\n' => {
                s.push_str("\\n");
                i += 1;
            }
            b'\r' => {
                s.push_str("\\r");
                i += 1;
            }
            b'\t' => {
                s.push_str("\\t");
                i += 1;
            }
            b'\x07' => {
                s.push_str("\\a");
                i += 1;
            }
            b'\x08' => {
                s.push_str("\\b");
                i += 1;
            }
            0x20..=0x7e => {
                s.push(b as char);
                i += 1;
            }
            _ => {
                if let Some((ch, len)) = read_utf8_char(bytes, i)
                    && !ch.is_control()
                {
                    s.push(ch);
                    i += len;
                } else {
                    s.push_str(&format!("\\x{:02x}", b));
                    i += 1;
                }
            }
        }
    }
    s.push('"');
    s
}

fn format_score(score: f64) -> String {
    if score.fract() == 0.0 && score.is_finite() {
        format!("{}", score as i64)
    } else {
        score.to_string()
    }
}

pub fn format_set_command(key: &[u8], value: &[u8]) -> String {
    format!("SET {} {}", format_quoted(key), format_quoted(value))
}

pub fn format_expire_command(key: &[u8], ttl_secs: i64) -> String {
    format!("EXPIRE {} {}", format_quoted(key), ttl_secs)
}

pub fn format_hmset_command(key: &[u8], pairs: &[(Vec<u8>, Vec<u8>)]) -> Option<String> {
    if pairs.is_empty() {
        return None;
    }
    let mut parts = vec!["HMSET".to_string(), format_quoted(key)];
    for (f, v) in pairs {
        parts.push(format_quoted(f));
        parts.push(format_quoted(v));
    }
    Some(parts.join(" "))
}

pub fn format_hset_command(key: &[u8], field: &[u8], value: &[u8]) -> String {
    format!(
        "HSET {} {} {}",
        format_quoted(key),
        format_quoted(field),
        format_quoted(value)
    )
}

/// Array 单槽：`ARSET key index value`
pub fn format_arset_command(key: &[u8], index: i64, value: &[u8]) -> String {
    format!(
        "ARSET {} {} {}",
        format_quoted(key),
        index,
        format_quoted(value)
    )
}

/// Vector Set：`VADD key VALUES dim f1..fn element [SETATTR json]`
pub fn format_vadd_command(
    key: &[u8],
    vector: &[f64],
    element: &[u8],
    attrs: Option<&str>,
) -> String {
    let floats = vector
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>()
        .join(" ");
    let mut cmd = format!(
        "VADD {} VALUES {} {} {}",
        format_quoted(key),
        vector.len(),
        floats,
        format_quoted(element)
    );
    if let Some(a) = attrs.map(str::trim).filter(|s| !s.is_empty()) {
        cmd.push_str(" SETATTR ");
        cmd.push_str(&format_quoted(a.as_bytes()));
    }
    cmd
}

/// Array 多槽：`ARMSET key index value [index value ...]`
pub fn format_armset_command(key: &[u8], pairs: &[(i64, Vec<u8>)]) -> Option<String> {
    if pairs.is_empty() {
        return None;
    }
    let mut parts = vec!["ARMSET".to_string(), format_quoted(key)];
    for (idx, v) in pairs {
        parts.push(idx.to_string());
        parts.push(format_quoted(v));
    }
    Some(parts.join(" "))
}

pub fn format_rpush_command(key: &[u8], items: &[Vec<u8>]) -> Option<String> {
    if items.is_empty() {
        return None;
    }
    let mut parts = vec!["RPUSH".to_string(), format_quoted(key)];
    for item in items {
        parts.push(format_quoted(item));
    }
    Some(parts.join(" "))
}

pub fn format_sadd_command(key: &[u8], members: &[Vec<u8>]) -> Option<String> {
    if members.is_empty() {
        return None;
    }
    let mut parts = vec!["SADD".to_string(), format_quoted(key)];
    for m in members {
        parts.push(format_quoted(m));
    }
    Some(parts.join(" "))
}

pub fn format_zadd_command(key: &[u8], pairs: &[(Vec<u8>, f64)]) -> Option<String> {
    if pairs.is_empty() {
        return None;
    }
    let mut parts = vec!["ZADD".to_string(), format_quoted(key)];
    for (member, score) in pairs {
        parts.push(format_score(*score));
        parts.push(format_quoted(member));
    }
    Some(parts.join(" "))
}

pub fn format_xadd_command(key: &[u8], id: &[u8], fields: &[(Vec<u8>, Vec<u8>)]) -> String {
    let mut parts = vec!["XADD".to_string(), format_quoted(key), format_quoted(id)];
    for (f, v) in fields {
        parts.push(format_quoted(f));
        parts.push(format_quoted(v));
    }
    parts.join(" ")
}

pub fn format_json_set_command(key: &[u8], json: &[u8]) -> String {
    format!("JSON.SET {} $ {}", format_quoted(key), format_quoted(json))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::util::split_redis_args;

    #[test]
    fn test_format_quoted_newline_and_binary() {
        assert_eq!(format_quoted(b"Line01\nLine02"), "\"Line01\\nLine02\"");
        assert_eq!(format_quoted(b"\x00\x01\xff"), "\"\\x00\\x01\\xff\"");
        assert_eq!(format_quoted(b"\x07\x08"), "\"\\a\\b\"");
    }

    #[test]
    fn test_format_set_multiline() {
        let cmd = format_set_command(b"MultiLine", b"Line01\nLine02");
        assert_eq!(cmd, r#"SET "MultiLine" "Line01\nLine02""#);
        let args = split_redis_args(&cmd).unwrap();
        assert_eq!(args[1], b"MultiLine");
        assert_eq!(args[2], b"Line01\nLine02");
    }

    #[test]
    fn test_format_set_utf8_literal() {
        let value = "RDM!\n中文 hepengju 表情😄 \n\nOfficial"
            .as_bytes()
            .to_vec();
        let cmd = format_set_command(b"RedisME", &value);
        assert!(cmd.contains("中文"));
        assert!(cmd.contains("😄"));
        assert!(!cmd.contains("\\xe4"));
        let args = split_redis_args(&cmd).unwrap();
        assert_eq!(args[2], value);
    }

    #[test]
    fn test_format_hset_single_field() {
        let cmd = format_hset_command(b"user:1", b"name", b"\xe5\xbc\xa0\xe4\xb8\x89");
        assert_eq!(cmd, r#"HSET "user:1" "name" "张三""#);
        let args = split_redis_args(&cmd).unwrap();
        assert_eq!(args[1], b"user:1");
        assert_eq!(args[2], b"name");
        assert_eq!(args[3], b"\xe5\xbc\xa0\xe4\xb8\x89");
    }

    #[test]
    fn test_format_arset_command() {
        let cmd = format_arset_command(b"arr:1", 3, b"hello");
        assert_eq!(cmd, r#"ARSET "arr:1" 3 "hello""#);
        let args = split_redis_args(&cmd).unwrap();
        assert_eq!(args[1], b"arr:1");
        assert_eq!(args[2], b"3");
        assert_eq!(args[3], b"hello");
    }

    #[test]
    fn test_format_armset_command() {
        let pairs = vec![(0i64, b"a".to_vec()), (2, b"b\nc".to_vec())];
        let cmd = format_armset_command(b"arr:1", &pairs).unwrap();
        assert_eq!(cmd, r#"ARMSET "arr:1" 0 "a" 2 "b\nc""#);
    }

    #[test]
    fn test_format_hmset_all_quoted() {
        let pairs = vec![
            (b"k3".to_vec(), b"v111".to_vec()),
            (b"k1".to_vec(), b"v111".to_vec()),
            (b"k2".to_vec(), b"v111".to_vec()),
        ];
        let cmd = format_hmset_command(b"hepengju:hash", &pairs).unwrap();
        assert_eq!(
            cmd,
            r#"HMSET "hepengju:hash" "k3" "v111" "k1" "v111" "k2" "v111""#
        );
        let args = split_redis_args(&cmd).unwrap();
        assert_eq!(args[1], b"hepengju:hash");
        assert_eq!(args[2], b"k3");
    }

    #[test]
    fn test_format_hmset_utf8_field() {
        let pairs = vec![
            (b"name".to_vec(), b"\xe5\xbc\xa0\xe4\xb8\x89".to_vec()),
            (b"age".to_vec(), b"28".to_vec()),
        ];
        let cmd = format_hmset_command(b"user:1", &pairs).unwrap();
        assert!(cmd.contains("\"user:1\""));
        assert!(cmd.contains("\"张三\""));
        let args = split_redis_args(&cmd).unwrap();
        assert_eq!(args[2], b"name");
        assert_eq!(args[3], b"\xe5\xbc\xa0\xe4\xb8\x89");
        assert_eq!(args[4], b"age");
        assert_eq!(args[5], b"28");
    }

    #[test]
    fn test_format_rpush_newline() {
        let cmd = format_rpush_command(b"mylist", &[b"a".to_vec(), b"b\nc".to_vec()]).unwrap();
        assert_eq!(cmd, r#"RPUSH "mylist" "a" "b\nc""#);
        let args = split_redis_args(&cmd).unwrap();
        assert_eq!(args[3], b"b\nc");
    }

    #[test]
    fn test_format_binary_roundtrip() {
        let cmd = format_set_command(b"binkey", b"\x00\x01\xffhello");
        let args = split_redis_args(&cmd).unwrap();
        assert_eq!(args[2], b"\x00\x01\xffhello");
    }

    #[test]
    fn test_empty_collection_returns_none() {
        assert!(format_hmset_command(b"k", &[]).is_none());
        assert!(format_rpush_command(b"k", &[]).is_none());
    }

    #[test]
    fn test_format_sadd_zadd_json() {
        let sadd = format_sadd_command(b"myset", &[b"m1".to_vec(), b"m2".to_vec()]).unwrap();
        assert_eq!(sadd, r#"SADD "myset" "m1" "m2""#);
        let zadd = format_zadd_command(b"rank", &[(b"a".to_vec(), 1.5)]).unwrap();
        assert_eq!(zadd, r#"ZADD "rank" 1.5 "a""#);
        let json = format_json_set_command(b"doc", br#"{"name":"test"}"#);
        assert_eq!(json, r#"JSON.SET "doc" $ "{\"name\":\"test\"}""#);
        let args = split_redis_args(&json).unwrap();
        assert_eq!(args[3], br#"{"name":"test"}"#);
    }

    #[test]
    fn test_format_xadd_field_order() {
        let fields = vec![
            (b"f2".to_vec(), b"v2".to_vec()),
            (b"f1".to_vec(), b"v1".to_vec()),
        ];
        let cmd = format_xadd_command(b"stream", b"1-0", &fields);
        assert_eq!(cmd, r#"XADD "stream" "1-0" "f2" "v2" "f1" "v1""#);
    }
}
