// Redis 安装帮助：Docker 部署产物生成器（纯函数，无 I/O）
// 三种模式（单机/集群/哨兵）× 三种产物（docker 命令 / docker compose / 分步指南），目标机仅考虑 Linux

export type RedisInstallMode = 'single' | 'cluster' | 'sentinel'
export type RedisInstallLang = 'shell' | 'yaml' | 'conf'

// 产物中的一个步骤块（界面按块展示 + 逐块复制）
export interface RedisInstallStep {
  title: string
  code: string
  lang: RedisInstallLang
}

export interface RedisInstallOptions {
  mode: RedisInstallMode
  image: string
  alpine: boolean
  // 节点机器 IP 列表（前端分号分隔拆分）；空则按 ['127.0.0.1']
  ips: string[]
  basePort: number
  password: string
  // cluster
  clusterMasters: number
  clusterReplicasPerMaster: number
  // sentinel（一主 N 从 + 哨兵）
  sentinelReplicas: number
  sentinelCount: number
  mountData: boolean
  mountConf: boolean
  ssl: boolean
  timezone: string
}

export interface RedisInstallNode {
  name: string
  ip: string
  port: number
  role: 'master' | 'replica' | 'sentinel'
}

// 步骤标题文案由视图层传入（i18n），生成器保持语言无关
export interface RedisInstallLabels {
  machine: string
  stepEnv: string
  stepConf: string
  stepCert: string
  stepStart: string
  stepCluster: string
  stepVerify: string
  composeFile: string
  // 启动前复核 compose 的注释文案
  reviewCompose: string
}

// 证书生成脚本注释文案（i18n）；推荐 OpenSSL >= 3.2（默认 X.509 v3）
export interface RedisCertLabels {
  scriptTitle: string
  scriptOutput: string
  step1Title: string
  step2Title: string
  step3Title: string
  step4Title: string
}

export interface RedisInstallOutput {
  nodes: RedisInstallNode[]
  commands: RedisInstallStep[]
  compose: RedisInstallStep[]
  guide: RedisInstallStep[]
}

// 宿主机目录约定：/data 下按模式建安装目录；TLS 时加 -ssl 后缀，可与明文部署并存
// 节点：<root>/ 或 <root>/<容器名>/{conf,data}；证书共享：<root>/cert；compose 落在 <root>
function hostRoot(o: RedisInstallOptions): string {
  return `/data/redis-${o.mode}${o.ssl ? '-ssl' : ''}`
}
function certDir(o: RedisInstallOptions): string {
  return `${hostRoot(o)}/cert`
}
// 容器名 / compose service：redis-<端口>；TLS 时加 -ssl
function nodeName(port: number, ssl: boolean): string {
  return `redis-${port}${ssl ? '-ssl' : ''}`
}
// 官方镜像以 redis 用户（uid 999）运行，数据/证书/配置目录需授权
const REDIS_UID = '999:999'
// 容器内证书挂载点（与 /etc/redis/conf 同级）
const CONTAINER_CERT_DIR = '/etc/redis/cert'

// 各模式默认起始端口：明文 单机 6379 / 集群 7001 / 哨兵 7701；TLS 6380 / 8001 / 8801（哨兵进程仍 +20000）
export function genInstallDefaultPort(mode: RedisInstallMode, ssl = false): number {
  if (mode === 'cluster') return ssl ? 8001 : 7001
  if (mode === 'sentinel') return ssl ? 8801 : 7701
  return ssl ? 6380 : 6379
}

// 网络模式（内置约定）：单机用简单端口映射；集群/哨兵多端口 + 总线/通告需求，用宿主机网络更简单可靠
function hostNetwork(mode: RedisInstallMode): boolean {
  return mode !== 'single'
}

// ---------------- 转义工具 ----------------

// redis.conf 值引用：双引号包裹并转义 \ 与 "（简单 token 可裸写）
function confQuote(v: string): string {
  if (/^[A-Za-z0-9._:/@=-]+$/.test(v)) return v
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// shell 参数引用：单引号优先；含单引号时退化为双引号转义
function shellQuote(v: string): string {
  if (/^[A-Za-z0-9._:/@=-]+$/.test(v)) return v
  if (!v.includes("'")) return `'${v}'`
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`
}

// heredoc 写文件：定界符带引号，内容零转义；内容与定界符冲突时自动换名
function heredoc(path: string, content: string): string {
  const body = content.endsWith('\n') ? content : content + '\n'
  let delim = 'EOF'
  let i = 1
  while (body.includes(delim)) delim = `EOF${i++}`
  return `cat > ${path} <<'${delim}'\n${body}${delim}`
}

// ---------------- 节点分配 ----------------

export function genInstallNodes(o: RedisInstallOptions): RedisInstallNode[] {
  const ips = o.ips.filter(ip => ip.trim())
  const hosts = ips.length > 0 ? ips : ['127.0.0.1']
  const pick = (i: number) => hosts[i % hosts.length]
  const nodes: RedisInstallNode[] = []
  // 容器/目录命名：redis-<端口>（端口在部署内唯一）；单机直接落在模式目录，不再多一层节点目录
  const ssl = o.ssl
  if (o.mode === 'single') {
    nodes.push({ name: nodeName(o.basePort, ssl), ip: hosts[0], port: o.basePort, role: 'master' })
  } else if (o.mode === 'cluster') {
    // 端口全局递增；redis-cli cluster create 将前 N 个节点作为主节点
    const total = o.clusterMasters * (1 + o.clusterReplicasPerMaster)
    for (let i = 0; i < total; i++) {
      const port = o.basePort + i
      nodes.push({
        name: nodeName(port, ssl),
        ip: pick(i),
        port,
        role: i < o.clusterMasters ? 'master' : 'replica',
      })
    }
  } else {
    // 哨兵：一主 + N 从 + 哨兵组（哨兵端口段 base+20000 起，避开集群总线端口段 +10000）
    nodes.push({ name: nodeName(o.basePort, ssl), ip: hosts[0], port: o.basePort, role: 'master' })
    for (let r = 0; r < o.sentinelReplicas; r++) {
      nodes.push({
        name: nodeName(o.basePort + 1 + r, ssl),
        ip: pick(r + 1),
        port: o.basePort + 1 + r,
        role: 'replica',
      })
    }
    for (let s = 0; s < o.sentinelCount; s++) {
      nodes.push({
        name: nodeName(o.basePort + 20000 + s, ssl),
        ip: pick(s),
        port: o.basePort + 20000 + s,
        role: 'sentinel',
      })
    }
  }
  return nodes
}

// 证书 SAN：全部节点 IP + 本机回环
export function genInstallSans(o: RedisInstallOptions): string[] {
  const sans = new Set<string>()
  for (const n of genInstallNodes(o)) sans.add(n.ip)
  sans.add('127.0.0.1')
  sans.add('localhost')
  return [...sans]
}

function finalImage(o: RedisInstallOptions): string {
  return o.alpine && !o.image.includes('alpine') ? `${o.image}-alpine` : o.image
}

// 哨兵进程必须挂载 sentinel.conf；其余节点跟随 mountConf
function confMounted(o: RedisInstallOptions, node?: RedisInstallNode): boolean {
  if (node?.role === 'sentinel') return true
  return o.mountConf
}

// 节点宿主机目录：单机直接落在模式目录，集群/哨兵每节点一层（以容器名命名）
function nodeDir(o: RedisInstallOptions, node: RedisInstallNode): string {
  const root = hostRoot(o)
  return o.mode === 'single' ? root : `${root}/${node.name}`
}
// 配置目录：挂到容器 /etc/redis，供 conf rewrite 写临时文件
function confDir(o: RedisInstallOptions, node: RedisInstallNode): string {
  return `${nodeDir(o, node)}/conf`
}

// 生成 docker-compose.yml 内容（按机器节点列表）
function genComposeYaml(
  o: RedisInstallOptions,
  ns: RedisInstallNode[],
  master: RedisInstallNode,
): string {
  const lines: string[] = ['services:']
  for (const n of ns) {
    lines.push(`  ${n.name}:`)
    lines.push(`    image: ${finalImage(o)}`)
    lines.push(`    container_name: ${n.name}`)
    if (hostNetwork(o.mode)) {
      lines.push('    network_mode: host')
    } else {
      lines.push('    ports:')
      lines.push(`      - '${n.port}:${n.port}'`)
    }
    lines.push('    restart: unless-stopped')
    if (o.timezone) {
      lines.push('    environment:')
      lines.push(`      - TZ=${o.timezone}`)
    }
    const vols: string[] = []
    if (o.mountData) vols.push(`      - ${nodeDir(o, n)}/data:/data`)
    // conf 目录挂到 /etc/redis/conf（rewrite 需同目录可写）；证书挂 /etc/redis/cert（同级）
    if (n.role === 'sentinel' || confMounted(o, n))
      vols.push(`      - ${confDir(o, n)}:/etc/redis/conf`)
    if (o.ssl) vols.push(`      - ${certDir(o)}:${CONTAINER_CERT_DIR}:ro`)
    if (vols.length > 0) {
      lines.push('    volumes:')
      lines.push(...vols)
    }
    if (n.role === 'sentinel')
      lines.push('    command: redis-server /etc/redis/conf/sentinel.conf --sentinel')
    else if (confMounted(o, n)) lines.push('    command: redis-server /etc/redis/conf/redis.conf')
    else
      lines.push(
        `    command: redis-server ${confArgs(o, n, master)
          .map(a => (shellQuote(a) === a ? a : JSON.stringify(a)))
          .join(' ')}`,
      )
  }
  return lines.join('\n') + '\n'
}

// 端口配置行（SSL 时关闭明文端口，启用 TLS 端口）
function portLines(ssl: boolean, port: number): string[] {
  return ssl ? ['port 0', `tls-port ${port}`] : [`port ${port}`]
}

// TLS 证书与协议公共配置行
function tlsBaseLines(): string[] {
  return [
    `tls-cert-file ${CONTAINER_CERT_DIR}/redis.crt`,
    `tls-key-file ${CONTAINER_CERT_DIR}/redis.key`,
    `tls-ca-cert-file ${CONTAINER_CERT_DIR}/ca.crt`,
    'tls-protocols "TLSv1.2 TLSv1.3"',
  ]
}

// 按机器分组（保持首次出现顺序）
function groupByMachine(nodes: RedisInstallNode[]): [string, RedisInstallNode[]][] {
  const map = new Map<string, RedisInstallNode[]>()
  for (const n of nodes) {
    if (!map.has(n.ip)) map.set(n.ip, [])
    map.get(n.ip)!.push(n)
  }
  return [...map.entries()]
}

// ---------------- 配置文件内容 ----------------

function redisConf(
  o: RedisInstallOptions,
  node: RedisInstallNode,
  master: RedisInstallNode,
): string {
  const l: string[] = []
  l.push(...portLines(o.ssl, node.port))
  l.push('bind 0.0.0.0', 'protected-mode no')
  if (o.password) l.push(`requirepass ${confQuote(o.password)}`)
  if (o.mode === 'cluster') {
    l.push('cluster-enabled yes')
    if (o.password) l.push(`masterauth ${confQuote(o.password)}`)
    // host 网络多网卡时保证节点间通告地址正确
    l.push(
      `cluster-announce-ip ${node.ip}`,
      `cluster-announce-port ${node.port}`,
      `cluster-announce-bus-port ${node.port + 10000}`,
    )
  } else if (o.mode === 'sentinel' && node.role === 'replica') {
    if (o.password) l.push(`masterauth ${confQuote(o.password)}`)
    l.push(
      `replicaof ${master.ip} ${master.port}`,
      `replica-announce-ip ${node.ip}`,
      `replica-announce-port ${node.port}`,
    )
  }
  l.push('dir /data')
  if (o.ssl) {
    l.push(...tlsBaseLines())
    if (o.mode !== 'single') l.push('tls-replication yes')
    if (o.mode === 'cluster') l.push('tls-cluster yes')
  }
  return l.join('\n') + '\n'
}

function sentinelConf(
  o: RedisInstallOptions,
  node: RedisInstallNode,
  master: RedisInstallNode,
): string {
  const quorum = Math.floor(o.sentinelCount / 2) + 1
  const l: string[] = []
  l.push(...portLines(o.ssl, node.port))
  if (o.password) l.push(`requirepass ${confQuote(o.password)}`)
  l.push(
    `sentinel monitor mymaster ${master.ip} ${master.port} ${quorum}`,
    `sentinel down-after-milliseconds mymaster 5000`,
    `sentinel failover-timeout mymaster 60000`,
  )
  if (o.password) l.push(`sentinel auth-pass mymaster ${confQuote(o.password)}`)
  l.push(`sentinel announce-ip ${node.ip}`, `sentinel announce-port ${node.port}`, 'dir /data')
  if (o.ssl) {
    l.push(...tlsBaseLines(), 'tls-replication yes')
  }
  return l.join('\n') + '\n'
}

// 不挂载配置文件时的命令行参数形态（哨兵不适用）
// Docker 官方镜像 entrypoint 已默认 --bind 0.0.0.0 --protected-mode no --dir /data，此处仅补充差异参数
function confArgs(
  o: RedisInstallOptions,
  node: RedisInstallNode,
  master: RedisInstallNode,
): string[] {
  const args: string[] = []
  if (o.ssl) {
    args.push('--port', '0', '--tls-port', `${node.port}`)
  } else if (node.port !== 6379) {
    args.push('--port', `${node.port}`)
  }
  if (o.password) args.push('--requirepass', o.password)
  if (o.mode === 'cluster') {
    args.push('--cluster-enabled', 'yes')
    if (o.password) args.push('--masterauth', o.password)
    args.push(
      '--cluster-announce-ip',
      node.ip,
      '--cluster-announce-port',
      `${node.port}`,
      '--cluster-announce-bus-port',
      `${node.port + 10000}`,
    )
  } else if (o.mode === 'sentinel' && node.role === 'replica') {
    if (o.password) args.push('--masterauth', o.password)
    args.push('--replicaof', master.ip, `${master.port}`, '--replica-announce-ip', node.ip)
    if (node.port !== 6379) args.push('--replica-announce-port', `${node.port}`)
  }
  if (o.ssl) {
    args.push(
      '--tls-cert-file',
      `${CONTAINER_CERT_DIR}/redis.crt`,
      '--tls-key-file',
      `${CONTAINER_CERT_DIR}/redis.key`,
      '--tls-ca-cert-file',
      `${CONTAINER_CERT_DIR}/ca.crt`,
    )
    if (o.mode === 'cluster') args.push('--tls-replication', 'yes', '--tls-cluster', 'yes')
    else if (o.mode === 'sentinel' && node.role === 'replica') args.push('--tls-replication', 'yes')
  }
  return args
}

// ---------------- docker run 形态 ----------------

function dockerRunCmd(
  o: RedisInstallOptions,
  node: RedisInstallNode,
  master: RedisInstallNode,
): string {
  const dir = nodeDir(o, node)
  const parts = [`docker run -d --name ${node.name} --restart unless-stopped`]
  if (hostNetwork(o.mode)) parts.push('--network host')
  else parts.push(`-p ${node.port}:${node.port}`)
  if (o.timezone) parts.push(`-e TZ=${shellQuote(o.timezone)}`)
  if (o.mountData) parts.push(`-v ${dir}/data:/data`)
  // conf 目录挂到 /etc/redis/conf，供 rewrite 写临时文件
  if (node.role === 'sentinel' || confMounted(o, node)) {
    parts.push(`-v ${confDir(o, node)}:/etc/redis/conf`)
  }
  if (o.ssl) parts.push(`-v ${certDir(o)}:${CONTAINER_CERT_DIR}:ro`)
  parts.push(finalImage(o))
  if (node.role === 'sentinel') {
    parts.push('redis-server /etc/redis/conf/sentinel.conf --sentinel')
  } else if (confMounted(o, node)) {
    parts.push('redis-server /etc/redis/conf/redis.conf')
  } else {
    parts.push(['redis-server', ...confArgs(o, node, master).map(shellQuote)].join(' '))
  }
  return parts.join(' \\\n  ')
}

// TLS 证书挂载于容器内 CONTAINER_CERT_DIR，与 redis.conf 分目录
function dockerExecCli(o: RedisInstallOptions, container: string): string {
  let cmd = `docker exec ${container} redis-cli`
  if (o.ssl) {
    cmd += ' --tls'
    cmd += ` --cert ${CONTAINER_CERT_DIR}/redis.crt --key ${CONTAINER_CERT_DIR}/redis.key --cacert ${CONTAINER_CERT_DIR}/ca.crt`
  }
  if (o.password) cmd += ` -a ${shellQuote(o.password)} --no-auth-warning`
  return cmd
}

// ---------------- 证书步骤 ----------------

const CERT_LINE_LEN = 64
const CERT_BANNER_SEP = `# ${'='.repeat(CERT_LINE_LEN)}`
const CERT_SEP = `# ${'-'.repeat(CERT_LINE_LEN)}`

/** SAN 列表 → -addext subjectAltName 参数值 */
function formatSanAddext(sans: string[]): string {
  return sans.map(s => (/^\d+$|[:.]/.test(s) ? `IP:${s}` : `DNS:${s}`)).join(',')
}

// openssl 自签证书脚本（RSA 4096；-addext；推荐 OpenSSL >= 3.2）
export function genOpensslCertScript(p: {
  sans: string[]
  certDays: number
  certCn: string
  labels: RedisCertLabels
}): string {
  const cn = p.certCn.trim() || 'redis'
  const san = formatSanAddext(p.sans)
  const sep = CERT_SEP
  const L = p.labels
  return (
    [
      CERT_BANNER_SEP,
      `# ${L.scriptTitle}`,
      `# ${L.scriptOutput}`,
      CERT_BANNER_SEP,
      '',
      sep,
      `# ${L.step1Title}`,
      sep,
      'openssl genrsa -out ca.key 4096',
      `openssl req -x509 -new -nodes -sha256 -days ${p.certDays} \\`,
      '  -key ca.key -out ca.crt \\',
      '  -subj "/CN=Redis-CA/O=Redis" \\',
      '  -addext "basicConstraints=critical,CA:true" \\',
      '  -addext "keyUsage=critical,keyCertSign,cRLSign"',
      '',
      sep,
      `# ${L.step2Title}`,
      sep,
      'openssl genrsa -out redis.key 4096',
      `openssl req -new -sha256 -key redis.key -out redis.csr \\`,
      `  -subj "/CN=${cn}/O=Redis" \\`,
      `  -addext "subjectAltName=${san}" \\`,
      '  -addext "keyUsage=digitalSignature,keyEncipherment" \\',
      '  -addext "extendedKeyUsage=serverAuth,clientAuth"',
      '',
      sep,
      `# ${L.step3Title}`,
      sep,
      `openssl x509 -req -sha256 -days ${p.certDays} \\`,
      '  -in redis.csr -CA ca.crt -CAkey ca.key -CAcreateserial \\',
      '  -out redis.crt -copy_extensions copy',
      '',
      sep,
      `# ${L.step4Title}`,
      sep,
      'openssl verify -CAfile ca.crt redis.crt',
      "openssl x509 -in redis.crt -noout -text | grep -E 'Version|Subject:|Alternative|IP Address|DNS'",
    ].join('\n') + '\n'
  )
}

function certStepOpenssl(
  o: RedisInstallOptions,
  labels: RedisInstallLabels,
  multi: boolean,
): RedisInstallStep {
  const dir = certDir(o)
  const parts: string[] = ['# 将生成的 ca.crt、redis.crt、redis.key 复制到以下目录', `# ${dir}`]
  if (multi) parts.push(`# 多机部署：将证书文件分发到每台机器的 ${dir} 目录`)
  parts.push('', `chown -R ${REDIS_UID} ${hostRoot(o)}`)
  return { title: labels.stepCert, code: parts.join('\n'), lang: 'shell' }
}

// ---------------- 主入口 ----------------

export function genRedisInstall(
  o: RedisInstallOptions,
  labels: RedisInstallLabels,
): RedisInstallOutput {
  const nodes = genInstallNodes(o)
  const machines = groupByMachine(nodes)
  const multi = machines.length > 1
  const machineTitle = (base: string, ip: string) =>
    multi ? `${base} - ${labels.machine} ${ip}` : base
  const master = nodes.find(n => n.role === 'master')!
  const sentinelNodes = nodes.filter(n => n.role === 'sentinel')
  const root = hostRoot(o)
  const certs = certDir(o)

  // ===== docker 命令形态（纯 docker run，不含环境准备） =====
  const commands: RedisInstallStep[] = []
  for (const [ip, ns] of machines) {
    const blocks: string[] = []
    for (const n of ns) blocks.push(dockerRunCmd(o, n, master))
    commands.push({
      title: machineTitle('docker run', ip),
      code: blocks.join('\n\n'),
      lang: 'shell',
    })
  }

  // ===== docker compose 形态（按机器一个文件）=====
  const compose: RedisInstallStep[] = []
  for (const [ip, ns] of machines) {
    compose.push({
      title: `${labels.composeFile} (${ip})`,
      code: genComposeYaml(o, ns, master),
      lang: 'yaml',
    })
  }

  // ===== 分步指南（合并为单个脚本） =====
  const sections: { header: string; code: string }[] = []
  // 1. 环境准备
  for (const [ip, ns] of machines) {
    const dirs: string[] = []
    for (const n of ns) {
      if (confMounted(o, n)) dirs.push(confDir(o, n))
      if (o.mountData) dirs.push(`${nodeDir(o, n)}/data`)
    }
    if (o.ssl) dirs.push(certs)
    sections.push({
      header: multi ? `${labels.stepEnv} — ${ip}` : labels.stepEnv,
      code: `mkdir -p ${dirs.join(' ')}`,
    })
  }
  // 2. 写入配置文件
  for (const [ip, ns] of machines) {
    const blocks: string[] = []
    for (const n of ns) {
      if (n.role === 'sentinel')
        blocks.push(heredoc(`${confDir(o, n)}/sentinel.conf`, sentinelConf(o, n, master)))
      else if (confMounted(o, n))
        blocks.push(heredoc(`${confDir(o, n)}/redis.conf`, redisConf(o, n, master)))
    }
    if (!o.ssl) blocks.push(`chown -R ${REDIS_UID} ${root}`)
    if (blocks.length > 0) {
      sections.push({
        header: multi ? `${labels.stepConf} — ${ip}` : labels.stepConf,
        code: blocks.join('\n\n'),
      })
    }
  }
  // 3. 证书
  if (o.ssl) {
    sections.push({ header: labels.stepCert, code: certStepOpenssl(o, labels, multi).code })
  }
  // 4. 启动容器：compose 落在模式根目录（/data/redis-{mode}[-ssl]），节点 conf/data 仍在各子目录
  for (const [ip, ns] of machines) {
    const code = [
      heredoc(`${root}/docker-compose.yml`, genComposeYaml(o, ns, master)),
      '',
      `cd ${root}`,
      `# ${labels.reviewCompose}`,
      '# vim docker-compose.yml',
      'docker compose up -d',
      '# docker compose logs',
    ].join('\n')
    sections.push({ header: multi ? `${labels.stepStart} — ${ip}` : labels.stepStart, code })
  }
  // 5. 集群初始化 / 验证（通过 docker exec 在容器内执行 redis-cli）
  if (o.mode === 'cluster') {
    const cli = dockerExecCli(o, master.name)
    const clusterLines: string[] = ['# Wait for all nodes to be ready']
    for (const n of nodes) clusterLines.push(`${cli} -h ${n.ip} -p ${n.port} ping`)
    clusterLines.push('')
    clusterLines.push('# Initialize cluster')
    clusterLines.push(
      `${cli} --cluster create ${nodes.map(n => `${n.ip}:${n.port}`).join(' ')} --cluster-replicas ${o.clusterReplicasPerMaster} --cluster-yes`,
    )
    sections.push({ header: labels.stepCluster, code: clusterLines.join('\n') })
    sections.push({
      header: labels.stepVerify,
      code: [
        `${cli} -h ${master.ip} -p ${master.port} cluster info`,
        `${cli} -h ${master.ip} -p ${master.port} cluster nodes`,
      ].join('\n'),
    })
  } else if (o.mode === 'sentinel') {
    const s0 = sentinelNodes[0]
    sections.push({
      header: labels.stepVerify,
      code: [
        `${dockerExecCli(o, master.name)} -h ${master.ip} -p ${master.port} ping`,
        `${dockerExecCli(o, master.name)} -h ${master.ip} -p ${master.port} info replication`,
        `# Sentinel`,
        `${dockerExecCli(o, s0.name)} -h ${s0.ip} -p ${s0.port} sentinel master mymaster`,
      ].join('\n'),
    })
  } else {
    // 单机 redis-cli 默认连 6379；改端口后必须显式 -p（容器内监听实际端口）
    sections.push({
      header: labels.stepVerify,
      code: `${dockerExecCli(o, master.name)} -p ${master.port} ping`,
    })
  }

  const GUIDE_SEP = CERT_BANNER_SEP
  const guideCode =
    sections.map(s => `${GUIDE_SEP}\n# ${s.header}\n${GUIDE_SEP}\n${s.code}`).join('\n\n') + '\n'
  const guide: RedisInstallStep[] = [{ title: 'Guide', code: guideCode, lang: 'shell' }]

  return { nodes, commands, compose, guide }
}
