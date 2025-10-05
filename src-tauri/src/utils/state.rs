use crate::client::client::RedisMeClient;
use crate::client::impl_cluster::RedisMeCluster;
use crate::utils::util::AnyResult;
use anyhow::anyhow;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct AppState {
    pub clients: RwLock<HashMap<String, Arc<Box<dyn RedisMeClient>>>>,
}

pub trait ClientAccess {
    fn get_client(&self, id: &str) -> AnyResult<Arc<Box<dyn RedisMeClient>>>;
    fn connect(&self, id: &str) -> AnyResult<Arc<Box<dyn RedisMeClient>>>;
    fn disconnect(&self, id: &str) -> AnyResult<()>;
}

impl ClientAccess for AppHandle {
    fn get_client(&self, id: &str) -> AnyResult<Arc<Box<dyn RedisMeClient>>> {
        let state: State<AppState> = self.state();
        {
            // Read lock在此代码块内，自动释放锁
            let clients = state
                .clients
                .read()
                .map_err(|e| anyhow!("Lock error: {e}"))?;

            if let Some(client) = clients.get(id) {
                return Ok(Arc::clone(client));
            }
        }

        self.connect(id)
    }

    fn connect(&self, id: &str) -> AnyResult<Arc<Box<dyn RedisMeClient>>> {
        let state: State<AppState> = self.state();
        let mut clients = state
            .clients
            .write()
            .map_err(|e| anyhow!("Lock error: {e}"))?;

        let client = Arc::new(RedisMeCluster::new(id)?);
        clients.insert(id.to_string(), Arc::clone(&client));
        Ok(client)
    }

    fn disconnect(&self, id: &str) -> AnyResult<()> {
        let state: State<AppState> = self.state();
        let mut clients = state
            .clients
            .write()
            .map_err(|e| anyhow!("Lock error: {e}"))?;
        clients.remove(id);
        Ok(())
    }
}
