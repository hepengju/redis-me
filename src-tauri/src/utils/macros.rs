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
            $app_handle_param:ident: $app_handle_type:ty,
            $id_param:ident: $id_type:ty
            $(,$arg:ident: $arg_type:ty)*
        ) -> $return_type:ty
    ) => {
        // 展开为 Tauri 命令函数
        #[tauri::command]
        pub fn $func(
            $app_handle_param: $app_handle_type,
            $id_param: $id_type,
            $($arg: $arg_type,)*
        ) -> ApiResult<$return_type> {
            to_api_result($app_handle_param.get_client($id_param).and_then(|client| client.$func($($arg),*)))
        }
    };
}