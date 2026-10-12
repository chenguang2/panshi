/**
 * 节点安装命令预览构建（node-management-ux-batch3 1.1 / design D1）：
 * 以 NodeList 相对路径形态为唯一实现提取的纯函数，NodeList 与 ClusterNodes 两视图共用。
 * batch1 修复基线：inventory/extravars 走相对路径（-i inventory -e @env/extravars），
 * ssh 命令不虚构账号与密钥（ssh_port 缺省 22）。
 */
export function buildNodeInstallCommand(
  node: { ip: string; ssh_port?: number; edge_path?: string },
  tag: string,
  extravars: Record<string, string>,
): string {
  const ev = JSON.stringify({ ...extravars, ips: node.ip })
  const ansibleCmd = `ansible-playbook -i inventory -e @env/extravars -e '${ev}' --tags ${tag} edge.yml`
  // install-edge 只走 Ansible, 不执行 SSH; install-openresty 才走 Ansible + SSH 两阶段
  if (tag === 'install_edge') {
    return `# Ansible 命令:\n${ansibleCmd}`
  }
  const prefix = extravars.prefix || node.edge_path || ''
  const destpath = prefix.replace(/\/[^/]+$/, '') + '/'
  // 最小通用形态（batch1 2.6 / design D3）：不虚构账号与密钥，ssh_port 缺省 22
  const sshCmd = `ssh -p ${node.ssh_port || 22} ${node.ip} "source /etc/profile; cd ${destpath}soft/install-edge/ && ./install-edge.sh ${prefix}; wait"`
  return `# Ansible 命令:\n${ansibleCmd}\n\n# SSH 编译命令:\n${sshCmd}`
}
