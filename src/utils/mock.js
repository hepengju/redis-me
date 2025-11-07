export const mockApiCommands = [
  {
    command: 'connect',
    param: {
      id: 'test'
    }
  },
  {
    command: 'disconnect',
    param: {
      id: 'test'
    }
  },
  {
    command: 'info',
    param: {
      id: 'test',
      node: null
    }
  },
  {
    command: 'info_list',
    param: {
      id: 'test'
    }
  },
  {
    command: 'node_list',
    param: {
      id: 'test'
    }
  },
  {
    command: 'scan',
    param: {
      id: 'test',
      param: {
        pattern: '*',
        count: 1000,
        scanType: null,
        cursor: {
          readyNodes: [],
          nowNode: '',
          nowCursor: 0,
          finished: false
        },
        loadAll: false
      }
    }
  },
  {
    command: 'get',
    param: {
      id: 'test',
      key: {
        "key": "hepengju:key",
        "bytes": "aGVwZW5nanU6a2V5"
      },
      hash_key: null
    }
  },
  {
    command: 'ttl',
    param: {
      id: 'test',
      key: {
        key: 'hepengju:string',
        bytes: []
      },
      ttl: 10000
    }
  },
  {
    command: 'set',
    param: {
      id: 'test',
      key: {
        key: 'hepengju:string1',
        bytes: []
      },
      value: 'hepengju:string1value1',
      ttl: 10000
    }
  },
  {
    command: 'del',
    param: {
      id: 'test',
      key: {
        key: 'hepengju:string1',
        bytes: []
      },
    }
  },
  {
    command: 'field_add',
    param: {
      id: 'test',
      param: {
        key: {
          key: 'hepengju:key',
          bytes: []
        },
        bytes: [],
        mode: 'key',
        type: 'hash',
        ttl: -1,
        value: '',
        listPushMethod: 'lpush',
        fieldValueList: [
          {
            fieldKey: 'k01',
            fieldValue: 'v01',
            fieldScore: 0.1
          },
          {
            fieldKey: 'k02',
            fieldValue: 'v02',
            fieldScore: 0.2
          }
        ],
      }
    }
  },
  {
    command: 'field_set',
    param: {
      id: 'test',
      param: {
        key: {
          key: 'hepengju:key',
          bytes: []
        },
        srcFieldKey: 'k01',
        srcFieldValue: 'v01',

        fieldIndex: 0,
        fieldKey: 'k011',
        fieldValue: 'v011',
        fieldScore: 0.1
      }
    }
  },
  {
    command: 'field_del',
    param: {
      id: 'test',
      param: {
        key: {
          key: 'hepengju:key',
          bytes: []
        },
        fieldIndex: 0,
        fieldKey: 'k011',
        fieldValue: 'v011',
      }
    }
  },
  {
    command: 'execute_command',
    param: {
      id: 'test',
      param: {
        command: 'cluster nodes',
        node: null,
        autoBroadcast: true
      }
    }
  },
  {
    command: 'config_get',
    param: {
      id: 'test',
      pattern: 'save',
      node: null,
    }
  },
  {
    command: 'config_set',
    param: {
      id: 'test',
      key: 'save',
      value: '3600 3 300 100 60 10000',
      node: null,
    }
  },
  {
    command: 'slow_log',
    param: {
      id: 'test',
      count: 10,
      node: null,
    }
  },
  {
    command: 'memory_usage',
    param: {
      id: 'test',
      param: {
        pattern: '*',
        sizeLimit: 1,
        countLimit: 100,
        scanCount: 1000,
        scanTotal: 10000,
        sleepMillis: 0
      }
    }
  },
  {
    command: 'client_list',
    param: {
      id: 'test',
      node: null,
      clientType: null
    }
  },

  {
    command: 'publish',
    param: {
      id: 'test',
      channel: 'channel',
      message: 'message'
    }
  },
  {
    command: 'subscribe',
    param: {
      id: 'test',
      channel: '',
    }
  },
  {
    command: 'subscribe_stop',
    param: {
      id: 'test',
    }
  },
  {
    command: 'monitor',
    param: {
      id: 'test',
      node: null,
    }
  },
  {
    command: 'monitor_stop',
    param: {
      id: 'test',
      node: null,
    }
  },
  {
    command: 'mock_data',
    param: {
      id: 'test',
      count: 10
    }
  },
]