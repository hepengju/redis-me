import { describe, expect, it } from 'vite-plus/test'

import type {
  RedisCertLabels,
  RedisInstallLabels,
  RedisInstallOptions,
} from '@/utils/redis-install-gen'
import {
  genInstallDefaultPort,
  genInstallSans,
  genOpensslCertScript,
  genRedisInstall,
} from '@/utils/redis-install-gen'

const labels: RedisInstallLabels = {
  machine: 'Machine',
  stepEnv: 'Prepare Environment',
  stepConf: 'Write Config Files',
  stepCert: 'Prepare TLS Certificates',
  stepStart: 'Start Containers',
  stepCluster: 'Initialize Cluster',
  stepVerify: 'Verify',
  composeFile: 'compose file',
  reviewCompose: 'Review and adjust if needed',
}

function baseOptions(partial: Partial<RedisInstallOptions> = {}): RedisInstallOptions {
  return {
    mode: 'single',
    image: 'redis:8',
    alpine: false,
    ips: [],
    basePort: 6379,
    password: '',
    clusterMasters: 3,
    clusterReplicasPerMaster: 1,
    sentinelReplicas: 1,
    sentinelCount: 3,
    mountData: true,
    mountConf: true,
    ssl: false,
    timezone: 'Asia/Shanghai',
    ...partial,
  }
}

describe('genInstallNodes / genRedisInstall', () => {
  it('单机：1 节点，容器名 redis-端口，目录不再多一层节点目录', () => {
    const out = genRedisInstall(baseOptions(), labels)
    expect(out.nodes).toEqual([{ name: 'redis-6379', ip: '127.0.0.1', port: 6379, role: 'master' }])
    expect(out.guide.length).toBe(1)
    expect(out.commands.length).toBe(1)
    expect(out.compose.length).toBe(1)
    // 单机：conf/data/cert 分目录；conf 挂到 /etc/redis/conf 以支持 rewrite
    expect(out.commands[0].code).toContain('/data/redis-single/data')
    expect(out.commands[0].code).toContain('-v /data/redis-single/conf:/etc/redis/conf')
    expect(out.commands[0].code).toContain('redis-server /etc/redis/conf/redis.conf')
    expect(out.commands[0].code).not.toContain('redis-single/redis-6379')
    expect(out.commands[0].code).not.toContain('redis.conf:/etc/redis/conf/redis.conf')
    expect(out.guide[0].code).toContain('cat > /data/redis-single/conf/redis.conf')
    expect(out.guide[0].code).toContain('mkdir -p /data/redis-single/conf')
    // 单机用简单端口映射，不用宿主机网络；compose 同步为 ports 映射
    expect(out.commands[0].code).toContain('-p 6379:6379')
    expect(out.commands[0].code).not.toContain('--network host')
    expect(out.compose[0].code).toContain("- '6379:6379'")
    expect(out.compose[0].code).not.toContain('network_mode: host')
  })

  it('默认起始端口：集群 7001 段，单机/哨兵 6379 段', () => {
    expect(genInstallDefaultPort('cluster')).toBe(7001)
    expect(genInstallDefaultPort('single')).toBe(6379)
    expect(genInstallDefaultPort('sentinel')).toBe(6379)
  })

  it('集群三主三从：默认 7001~7006，端口全局递增，IP 轮询分配，宿主机网络', () => {
    const out = genRedisInstall(
      baseOptions({
        mode: 'cluster',
        basePort: genInstallDefaultPort('cluster'),
        ips: ['10.0.0.1', '10.0.0.2', '10.0.0.3'],
      }),
      labels,
    )
    expect(out.nodes.length).toBe(6)
    expect(out.nodes.map(n => n.port)).toEqual([7001, 7002, 7003, 7004, 7005, 7006])
    expect(out.nodes[0].ip).toBe('10.0.0.1')
    expect(out.nodes[3].ip).toBe('10.0.0.1')
    expect(out.nodes.filter(n => n.role === 'master').length).toBe(3)
    // 集群用宿主机网络（多端口 + 总线）
    expect(out.commands[0].code).toContain('--network host')
    // 按机器分组：3 台机器 → 3 个 compose 文件
    expect(out.compose.length).toBe(3)
    // 集群初始化 + 配置写入均包含在合并后的指南脚本中
    const guideCode = out.guide[0].code
    expect(guideCode).toContain('--cluster create')
    expect(guideCode).toContain('--cluster-replicas 1')
    expect(guideCode).toContain('cluster-enabled yes')
    expect(guideCode).toContain('cluster-announce-bus-port 17001')
    expect(guideCode).toContain('/data/redis-cluster')
    // compose 落在模式根目录，不是某个节点子目录
    expect(guideCode).toContain('cat > /data/redis-cluster/docker-compose.yml')
    expect(guideCode).toContain('cd /data/redis-cluster')
    expect(guideCode).not.toContain('/redis-7001/docker-compose.yml')
  })

  it('哨兵：主从端口递增，哨兵端口段 +20000，quorum 正确', () => {
    const out = genRedisInstall(
      baseOptions({
        mode: 'sentinel',
        ips: ['10.0.0.1', '10.0.0.2'],
        sentinelReplicas: 2,
        sentinelCount: 3,
        password: 'pass',
      }),
      labels,
    )
    const ports = out.nodes.map(n => n.port)
    expect(ports).toEqual([6379, 6380, 6381, 26379, 26380, 26381])
    const guideCode = out.guide[0].code
    expect(guideCode).toContain('sentinel monitor mymaster 10.0.0.1 6379 2')
    expect(guideCode).toContain('sentinel auth-pass mymaster')
    expect(guideCode).toContain('replicaof 10.0.0.1 6379')
    // 哨兵挂 conf 目录（可写回），不是单文件挂载
    expect(out.compose.map(c => c.code).join('\n')).toContain(
      '/data/redis-sentinel/redis-26379/conf:/etc/redis/conf',
    )
    expect(out.compose.map(c => c.code).join('\n')).not.toContain(
      'sentinel.conf:/etc/redis/conf/sentinel.conf',
    )
    expect(guideCode).toContain('cat > /data/redis-sentinel/redis-26379/conf/sentinel.conf')
  })

  it('密码含特殊字符：conf 双引号转义、shell 单引号转义', () => {
    const out = genRedisInstall(baseOptions({ password: 'pa"ss\'word' }), labels)
    const guideCode = out.guide[0].code
    expect(guideCode).toContain('requirepass "pa\\"ss\'word"')
    // 含单引号时退化为双引号转义形态
    expect(guideCode).toContain('-a "pa\\"ss\'word"')
  })

  it('TLS：安装指南证书步骤仅包含文件处理，openssl 脚本在证书弹框中', () => {
    const sslOut = genRedisInstall(baseOptions({ ssl: true }), labels)
    const guideCode = sslOut.guide[0].code
    // cert 目录仅在环境准备步骤 mkdir 一次
    expect((guideCode.match(/mkdir -p [^\n]*\/cert/g) || []).length).toBe(1)
    expect(guideCode).toContain('/data/redis-single-ssl/cert')
    expect(guideCode).not.toContain('chmod')
    expect(guideCode).not.toContain('openssl genrsa')

    expect(guideCode).toContain('port 0')
    expect(guideCode).toContain('tls-port 6379')
    expect(guideCode).toContain('tls-cert-file /etc/redis/cert/redis.crt')
    expect(guideCode).toContain('tls-protocols "TLSv1.2 TLSv1.3"')

    expect(sslOut.compose[0].code).toContain('/data/redis-single-ssl/cert:/etc/redis/cert:ro')
    expect(sslOut.compose[0].code).toContain('/data/redis-single-ssl/conf:/etc/redis/conf')
    expect(sslOut.compose[0].code).not.toContain('redis.conf:/etc/redis/conf/redis.conf')
    expect(sslOut.commands[0].code).toContain(':/etc/redis/cert:ro')
  })

  it('genOpensslCertScript：-addext 四步脚本，无 openssl.cnf', () => {
    const labels: RedisCertLabels = {
      scriptTitle:
        'Redis TLS Self-Signed Certificate Script (OpenSSL >= 3.2 recommended; X.509 v3 by default)',
      scriptOutput: 'Output: ca.key ca.crt redis.key redis.crt',
      step1Title: 'Step 1: Generate CA (ca.key + ca.crt)',
      step2Title: 'Step 2: Generate server key and CSR (with SAN)',
      step3Title: 'Step 3: Sign server certificate with CA',
      step4Title: 'Step 4: Verify',
    }
    const script = genOpensslCertScript({
      sans: ['127.0.0.1', 'localhost'],
      certDays: 36500,
      certCn: 'redis',
      labels,
    })
    expect(script).toContain('openssl genrsa -out ca.key 4096')
    expect(script).toContain('openssl genrsa -out redis.key 4096')
    expect(script).toContain('-addext "subjectAltName=IP:127.0.0.1,DNS:localhost"')
    expect(script).toContain('-addext "basicConstraints=critical,CA:true"')
    expect(script).toContain('-copy_extensions copy')
    expect(script).toContain('openssl verify -CAfile ca.crt redis.crt')
    expect(script).not.toContain('chmod')
    expect(script).not.toContain('openssl.cnf')
    expect(script).not.toContain('MSYS_NO_PATHCONV')
  })

  it('SAN 汇总节点 IP 与回环地址', () => {
    const sans = genInstallSans(baseOptions({ mode: 'cluster', ips: ['10.0.0.1', '10.0.0.2'] }))
    expect(sans).toContain('10.0.0.1')
    expect(sans).toContain('10.0.0.2')
    expect(sans).toContain('127.0.0.1')
    expect(sans).toContain('localhost')
  })

  it('不挂载配置：docker run 携带命令行参数形态，省略 Docker 默认项', () => {
    const out = genRedisInstall(baseOptions({ mountConf: false }), labels)
    const cmd = out.commands[0].code
    // 默认端口 6379 省略 --port；bind/protected-mode/dir 由 Docker entrypoint 默认处理
    expect(cmd).toContain('redis-server')
    expect(cmd).not.toContain('--port')
    expect(cmd).not.toContain('--bind')
    expect(cmd).not.toContain('--protected-mode')
    expect(cmd).not.toContain('--dir')
    expect(cmd).not.toContain('redis.conf')
  })

  it('不挂载配置 + 非默认端口：显式传递 --port', () => {
    const out = genRedisInstall(baseOptions({ mountConf: false, basePort: 6380 }), labels)
    const cmd = out.commands[0].code
    expect(cmd).toContain('--port 6380')
  })

  it('单机验证命令携带实际端口', () => {
    const def = genRedisInstall(baseOptions(), labels)
    expect(def.guide[0].code).toContain('docker exec redis-6379 redis-cli -p 6379 ping')
    const custom = genRedisInstall(baseOptions({ basePort: 6380 }), labels)
    expect(custom.guide[0].code).toContain('docker exec redis-6380 redis-cli -p 6380 ping')
    expect(custom.guide[0].code).not.toContain('redis-cli ping')
  })

  it('不挂载数据但挂载配置：指南环境准备仍创建 conf 目录', () => {
    const out = genRedisInstall(baseOptions({ mountData: false, mountConf: true }), labels)
    const guideCode = out.guide[0].code
    expect(guideCode).toContain('mkdir -p /data/redis-single/conf')
    expect(guideCode).not.toContain('/data/redis-single/data')
  })

  it('docker 命令 tab 仅含纯 docker run，不含 mkdir/heredoc/chown', () => {
    const out = genRedisInstall(baseOptions(), labels)
    const cmd = out.commands[0].code
    expect(cmd).toContain('docker run')
    expect(cmd).not.toContain('mkdir')
    expect(cmd).not.toContain('cat >')
    expect(cmd).not.toContain('chown')
  })

  it('分步指南启动容器步骤：写入 compose 文件后 cd + vim + docker compose up', () => {
    const out = genRedisInstall(baseOptions(), labels)
    const guideCode = out.guide[0].code
    // 写入 docker-compose.yml（heredoc）
    expect(guideCode).toContain('docker-compose.yml')
    expect(guideCode).toContain('services:')
    // cd 到工作目录，无需 -f 指定文件
    expect(guideCode).toContain('cd /data/redis-single')
    expect(guideCode).toContain('# Review and adjust if needed')
    expect(guideCode).toContain('# vim docker-compose.yml')
    expect(guideCode).toContain('docker compose up -d')
    expect(guideCode).toContain('# docker compose logs')
    expect(guideCode).not.toContain('docker compose -f')
    expect(guideCode).not.toContain('docker run')
  })

  it('alpine 变体追加镜像后缀', () => {
    const out = genRedisInstall(baseOptions({ alpine: true }), labels)
    expect(out.commands[0].code).toContain('redis:8-alpine')
  })

  it('heredoc 定界符与内容冲突时自动换名', () => {
    const out = genRedisInstall(baseOptions({ password: 'EOF' }), labels)
    // 内容含 EOF 字样不破坏结构（定界符或内容安全）
    expect(out.guide[0].code).toContain('requirepass')
  })

  it('哨兵从节点未外置配置：docker run 携带 replicaof', () => {
    const out = genRedisInstall(
      baseOptions({
        mode: 'sentinel',
        ips: ['10.0.0.1', '10.0.0.2'],
        mountConf: false,
        password: 'pass',
      }),
      labels,
    )
    const allCmds = out.commands.map(c => c.code).join('\n')
    expect(allCmds).toContain('--replicaof 10.0.0.1 6379')
  })

  it('TLS + 集群：配置含 tls-cluster/tls-replication，集群初始化携带 --tls', () => {
    const out = genRedisInstall(
      baseOptions({
        mode: 'cluster',
        ssl: true,
        basePort: genInstallDefaultPort('cluster'),
        ips: ['10.0.0.1', '10.0.0.2', '10.0.0.3'],
      }),
      labels,
    )
    const guideCode = out.guide[0].code
    // redis.conf 含集群 TLS 配置
    expect(guideCode).toContain('tls-cluster yes')
    expect(guideCode).toContain('tls-replication yes')
    expect(guideCode).toContain('tls-port 7001')
    expect(guideCode).toContain('port 0')
    // 集群初始化命令携带 --tls 和证书参数
    expect(guideCode).toContain('--tls')
    expect(guideCode).toContain('--cert /etc/redis/cert/redis.crt')
    expect(guideCode).toContain('--key /etc/redis/cert/redis.key')
    expect(guideCode).toContain('--cacert /etc/redis/cert/ca.crt')
    expect(guideCode).toContain('--cluster create')
    expect(guideCode).toContain('/data/redis-cluster-ssl')
    expect(guideCode).toContain('docker exec redis-7001-ssl')
  })

  it('TLS + 哨兵：配置含 tls-replication，哨兵配置含证书路径', () => {
    const out = genRedisInstall(
      baseOptions({ mode: 'sentinel', ssl: true, ips: ['10.0.0.1', '10.0.0.2'], password: 'pass' }),
      labels,
    )
    const guideCode = out.guide[0].code
    expect(guideCode).toContain('tls-replication yes')
    expect(guideCode).toContain('tls-cert-file /etc/redis/cert/redis.crt')
    // 哨兵验证步骤携带 --tls
    expect(guideCode).toContain('--tls')
    expect(guideCode).toContain('sentinel master mymaster')
    expect(guideCode).toContain('/data/redis-sentinel-ssl')
    expect(guideCode).toContain('docker exec redis-6379-ssl')
    expect(guideCode).toContain('docker exec redis-26379-ssl')
  })

  it('TLS：根目录与容器名均加 -ssl 后缀', () => {
    const single = genRedisInstall(baseOptions({ ssl: true }), labels)
    expect(single.nodes[0].name).toBe('redis-6379-ssl')
    expect(single.commands[0].code).toContain('--name redis-6379-ssl')
    expect(single.compose[0].code).toContain('container_name: redis-6379-ssl')
    expect(single.compose[0].code).toContain('  redis-6379-ssl:')
    expect(single.guide[0].code).toContain('/data/redis-single-ssl')
    expect(single.guide[0].code).not.toMatch(/\/data\/redis-single(?!-ssl)/)

    const cluster = genRedisInstall(
      baseOptions({ mode: 'cluster', ssl: true, basePort: 7001 }),
      labels,
    )
    expect(cluster.nodes[0].name).toBe('redis-7001-ssl')
    expect(cluster.compose[0].code).toContain('container_name: redis-7001-ssl')
    expect(cluster.guide[0].code).toContain('/data/redis-cluster-ssl/redis-7001-ssl')
  })
})
