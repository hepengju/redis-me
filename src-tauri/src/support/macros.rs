// Model定义宏（DeepSeek生成, DeepSeek优化）
#[macro_export]
macro_rules! api_model {
    (
        $(#[$struct_attr:meta])*
        $struct:ident {
            $(
                $(#[$field_meta:meta])*
                $field:ident : $type:ty
            ),+
            $(,)?
        }
    ) => {
        #[derive(Serialize, Deserialize, Debug, Clone, Type)]
        $(#[$struct_attr])*
        #[serde(rename_all = "camelCase")]
        pub struct $struct {
            $(
                $(#[$field_meta])*
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
            #[specta]
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

/// 单机和集群相同的 `MeClient` 转发：取当前连接后交给 `ops` 里的 `*0`。
/// 两边行为不同的方法留在各自的 `impl` 里，不要放进这个宏。
#[macro_export]
macro_rules! me_client_forwards {
    () => {
        fn field_scan(&self, param: FieldScanParam) -> AnyResult<FieldScanResult> {
            let caps = &self.base().capabilities;
            $crate::client::ops::field_scan::field_scan0(
                self.get_conn()?,
                param,
                caps.httl_supported,
                caps.memory_usage_supported,
            )
        }

        fn ttl(&self, key: RedisKey, ttl: i64) -> AnyResult<()> {
            $crate::client::ops::key::ttl0(self.get_conn()?, key, ttl)
        }

        fn set(&self, param: RedisSetParam) -> AnyResult<()> {
            $crate::client::ops::key::set0(self.get_conn()?, param)
        }

        fn del(&self, key: RedisKey) -> AnyResult<()> {
            $crate::client::ops::key::del0(self.get_conn()?, key)
        }

        fn field_add(&self, param: RedisFieldAdd) -> AnyResult<RedisKey> {
            $crate::client::ops::field::field_add0(
                self.get_conn()?,
                param,
                self.base().capabilities.httl_supported,
            )
        }

        fn field_set(&self, param: RedisFieldSet) -> AnyResult<()> {
            $crate::client::ops::field::field_set0(
                self.get_conn()?,
                param,
                self.base().capabilities.httl_supported,
            )
        }

        fn field_ttl(&self, param: RedisFieldTtl) -> AnyResult<()> {
            $crate::client::ops::field::field_ttl0(
                self.get_conn()?,
                param,
                self.base().capabilities.httl_supported,
            )
        }

        fn field_get(&self, param: RedisFieldGet) -> AnyResult<RedisFieldValue> {
            $crate::client::ops::field::field_get0(
                self.get_conn()?,
                param,
                self.base().capabilities.httl_supported,
            )
        }

        fn hash_keys(&self, param: RedisHashKeys) -> AnyResult<Vec<String>> {
            $crate::client::ops::field::hash_keys0(self.get_conn()?, param)
        }

        fn hash_values(&self, param: RedisHashKeys) -> AnyResult<Vec<String>> {
            $crate::client::ops::field::hash_values0(self.get_conn()?, param)
        }

        fn field_pop(&self, param: RedisPop) -> AnyResult<String> {
            $crate::client::ops::field::field_pop0(self.get_conn()?, param)
        }

        fn field_del(&self, param: RedisFieldDel) -> AnyResult<()> {
            $crate::client::ops::field::field_del0(self.get_conn()?, param)
        }

        fn zset_rank(&self, param: RedisZsetRank) -> AnyResult<RedisZsetRankResult> {
            $crate::client::ops::field_scan::zset_rank0(self.get_conn()?, param)
        }

        fn zset_range(&self, param: RedisZsetRange) -> AnyResult<Vec<RedisZsetRangeItem>> {
            $crate::client::ops::field_scan::zset_range0(self.get_conn()?, param)
        }

        fn ar_last_items(&self, param: RedisArLastItems) -> AnyResult<Vec<RedisArLastItemsItem>> {
            $crate::client::ops::field::ar_last_items0(self.get_conn()?, param)
        }

        fn ar_info(&self, key: RedisKey) -> AnyResult<Vec<RedisArInfoItem>> {
            $crate::client::ops::info::ar_info0(self.get_conn()?, key)
        }

        fn v_info(&self, key: RedisKey) -> AnyResult<Vec<RedisArInfoItem>> {
            $crate::client::ops::vector::v_info0(self.get_conn()?, key)
        }

        fn ts_info(&self, key: RedisKey) -> AnyResult<Vec<RedisArInfoItem>> {
            $crate::client::ops::info::ts_info0(self.get_conn()?, key)
        }

        fn v_getattr(&self, param: RedisVAttr) -> AnyResult<String> {
            $crate::client::ops::vector::v_getattr0(self.get_conn()?, param)
        }

        fn v_setattr(&self, param: RedisVAttr) -> AnyResult<()> {
            $crate::client::ops::vector::v_setattr0(self.get_conn()?, param)
        }

        fn v_sim(&self, param: RedisVSim) -> AnyResult<Vec<RedisVSimItem>> {
            $crate::client::ops::vector::v_sim0(self.get_conn()?, param)
        }

        fn object_info(&self, key: RedisKey) -> AnyResult<RedisObjectInfo> {
            $crate::client::ops::key::object_info0(self.get_conn()?, key)
        }

        fn publish(
            &self,
            channel: &str,
            message: &str,
            msg_fmt: Option<BytesFormat>,
        ) -> AnyResult<()> {
            let fmt = msg_fmt.unwrap_or_default();
            $crate::client::ops::pubsub::publish0(self.get_conn()?, channel, message, &fmt)
        }

        fn subscribe_stop(&self) -> AnyResult<()> {
            $crate::client::ops::pubsub::subscribe_stop0(
                self.get_conn()?,
                self.subscribe_running.clone(),
            )
        }

        fn notify_subscribe_stop(&self) -> AnyResult<()> {
            $crate::client::ops::notify::notify_subscribe_stop0(
                self.get_conn()?,
                self.notify_running.clone(),
            )
        }

        fn monitor_stop(&self) -> AnyResult<()> {
            $crate::client::ops::pubsub::monitor_stop0(self.monitor_running.clone())
        }

        fn key_type(&self, key: RedisKey) -> AnyResult<String> {
            $crate::client::ops::key::key_type0(self.get_conn()?, key)
        }

        fn get_key_as_command(&self, key: RedisKey) -> AnyResult<String> {
            $crate::client::ops::cmd::get_key_as_command0(self.get_conn()?, key)
        }

        fn get_field_as_command(&self, param: RedisFieldAsCommand) -> AnyResult<String> {
            $crate::client::ops::cmd::get_field_as_command0(self.get_conn()?, param)
        }

        fn xinfo_groups(&self, key: RedisKey) -> AnyResult<Vec<XInfoGroup>> {
            $crate::client::ops::info::xinfo_groups0(self.get_conn()?, key)
        }

        fn xinfo_consumers(&self, key: RedisKey, group: String) -> AnyResult<Vec<XInfoConsumer>> {
            $crate::client::ops::info::xinfo_consumers0(self.get_conn()?, key, group)
        }

        fn flush_db(&self) -> AnyResult<()> {
            $crate::client::ops::key::flush_db0(self.get_conn()?)
        }

        fn flush_all(&self) -> AnyResult<()> {
            $crate::client::ops::key::flush_all0(self.get_conn()?)
        }

        fn acl_users(&self) -> AnyResult<Vec<String>> {
            $crate::client::ops::acl::acl_users0(self.get_conn()?)
        }

        fn acl_list_users(&self) -> AnyResult<Vec<AclUserDetail>> {
            $crate::client::ops::acl::acl_list_users0(self.get_conn()?)
        }

        fn acl_getuser(&self, username: &str) -> AnyResult<AclUserDetail> {
            $crate::client::ops::acl::acl_getuser0(self.get_conn()?, username)
        }

        fn acl_whoami(&self) -> AnyResult<String> {
            $crate::client::ops::acl::acl_whoami0(self.get_conn()?)
        }

        fn acl_cat(&self, category: Option<String>) -> AnyResult<Vec<String>> {
            $crate::client::ops::acl::acl_cat0(self.get_conn()?, category)
        }

        fn acl_genpass(&self, bits: Option<i64>) -> AnyResult<String> {
            $crate::client::ops::acl::acl_genpass0(self.get_conn()?, bits)
        }

        fn acl_log(&self, count: Option<u64>) -> AnyResult<Vec<AclLogEntry>> {
            $crate::client::ops::acl::acl_log0(self.get_conn()?, count)
        }

        fn acl_dryrun(&self, username: String, command: String) -> AnyResult<String> {
            $crate::client::ops::acl::acl_dryrun0(self.get_conn()?, username, command)
        }
    };
}
