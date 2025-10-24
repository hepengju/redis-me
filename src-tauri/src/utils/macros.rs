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
macro_rules! api_commands {
    // 匹配多个函数定义的语法：用分号分隔每个定义
    (
        $(
            $name:ident(
                $($param:ident: $param_type:ty),*
            ) -> $return_type:ty
        );*
        $(;)?
    ) => {
        $(
            #[command]
            pub fn $name(
                app_handle: AppHandle,
                id: &str,
                $($param: $param_type),*
            ) -> ApiResult<$return_type> {
                to_api_result(
                    app_handle
                        .get_client(id)
                        .and_then(|client| client.$name($($param),*))
                )
            }
        )*
    };
}
