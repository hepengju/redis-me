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

// Api定义宏（DeepSeek生成）
#[macro_export]
macro_rules! api_command {
    // 匹配模式：函数名(参数列表) -> 返回值类型
    (
        $func:ident(
            $($param:ident: $param_type:ty),*
        ) -> $return_type:ty
    ) => {
        // 展开为 Tauri 命令函数
        #[command]
        pub fn $func(
            app_handle: AppHandle, id: &str, $($param: $param_type),*
        ) -> ApiResult<$return_type> {
            to_api_result(app_handle.get_client(id).and_then(|client| client.$func($($param),*)))
        }
    };
}