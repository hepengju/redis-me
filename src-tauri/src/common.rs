// 统一应用返回值
// 说明: 由于tauri的错误处理中需要返回的错误实现序列化, anyhow的错误并没有实现，因此简单返回字符串错误
pub type MeResult<T> = Result<T, String>;

// 模型定义宏（DeepSeek生成）
#[macro_export]
macro_rules! api_model {
    ($struct:ident { $($field:ident : $type:ty),+ $(,)? }) => {
        #[derive(Serialize, Deserialize, Debug, Clone)]
        #[serde(rename_all = "camelCase")]
        pub struct $struct {
            $(pub $field: $type),+
        }
    };
}