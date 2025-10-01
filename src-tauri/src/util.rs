use anyhow::bail;
use rand::distr::{Alphanumeric, SampleString};
use rand::prelude::IteratorRandom;
use rand::Rng;

// 统一应用返回值
pub type AnyResult<T> = anyhow::Result<T>;
pub type ApiResult<T> = Result<T, String>;

// tauri的错误处理中需要返回的错误实现序列化, anyhow的错误并没有实现，因此简单返回字符串错误
pub fn to_api_result<T>(result: anyhow::Result<T>) -> ApiResult<T> {
    match result {
        Ok(value) => Ok(value),
        Err(err) => Err(err.to_string()),
    }
}

// 字节数组转字符串
pub fn vec8_to_string(v: Vec<u8>) -> String {
    unsafe { String::from_utf8_unchecked(v) }
}

// 断言
pub fn assert_is_true(value: bool, message: String) -> AnyResult<()> {
    if value { Ok(()) } else { bail!(message) }
}

// vec中随机选择一个
pub fn random_item<T>(vec: Vec<T>) -> T {
    vec.into_iter().choose(&mut rand::rng()).unwrap()
}

// 随机N个字符
pub fn random_string(len: usize) -> String {
    Alphanumeric.sample_string(&mut rand::rng(), len)
}

// 随机范围
pub fn random_range(min: i32, max: i32) -> i32 {
    rand::rng().random_range(min..=max)
}


// Model定义宏（DeepSeek生成）
#[macro_export]
macro_rules! api_model {
    ($struct:ident {
        $(
            $(#[$meta:meta])*  // 匹配字段前的属性
            $field:ident : $type:ty
        ),+
        $(,)?
    }) => {
        #[derive(Serialize, Deserialize, Debug, Clone)]
        #[serde(rename_all = "camelCase")]
        pub struct $struct {
            $(
                $(#[$meta])*    // 展开字段前的属性
                pub $field: $type
            ),+
        }
    };
}

// Api定义宏
#[macro_export]
macro_rules! api_command {
    ($(#[$attr:meta])* $fn_name:ident($($param:ident: $param_type:ty),*) -> $ret:ty) => {
        $(#[$attr])*
        #[tauri::command]
        pub fn $fn_name($($param: $param_type),*) -> ApiResult<$ret> {
            to_api_result(service::$fn_name($($param),*))
        }
    };
}
