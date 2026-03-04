/* ============================================================
   Config Generator - app.js (Full)
   - Target: GitHub Pages (Static HTML/CSS/JS)
   - Device: AR5710-S (Huawei VRP) + Node preconfig (CX600)
   - WAN /29 mapping:
       network+1 (.33) = Node MAIN
       network+2 (.34) = Node PROTEC
       network+3 (.35) = RT
   ============================================================ */

const $ = (id) => document.getElementById(id);

/* -------------------- UI helpers -------------------- */
function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg || "";
}

function getFormData() {
  return {
    deviceType: $("deviceType")?.value || "AR5710",

    cid: $("cid")?.value.trim() || "",
    rtName: $("rtName")?.value.trim() || "",
    vlan: $("vlan")?.value.trim() || "",
    loopback: $("loopback")?.value.trim() || "",

    nodeMain: $("nodeMain")?.value.trim() || "",
    nodeProtec: $("nodeProtec")?.value.trim() || "",

    wanNodeMain: $("wanNodeMain")?.value.trim() || "",       // e.g. 10.100.120.10/31
    wanRtMain: $("wanRtMain")?.value.trim() || "",           // e.g. 10.100.120.11/31
    wanNodeProtec: $("wanNodeProtec")?.value.trim() || "",   // e.g. 10.100.103.104/31
    wanRtProtec: $("wanRtProtec")?.value.trim() || "",       // e.g. 10.100.103.105/31

    wanNetwork: $("wanNetwork")?.value.trim() || "",         // e.g. 172.19.55.32/29
    lanNetwork: $("lanNetwork")?.value.trim() || "",         // e.g. 203.156.1.168/30

    commMain: $("commMain")?.value.trim() || "",             // e.g. 14
    commBackup: $("commBackup")?.value.trim() || "",         // e.g. 97

    customer: $("customer")?.value.trim() || "",
    proxy: $("proxy")?.value || "None",
    remark: $("remark")?.value.trim() || "",
  };
}

/* -------------------- Date/time -------------------- */
function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* -------------------- Basic validation -------------------- */
function validateBasic(d) {
  const required = [
    ["cid", "CID"],
    ["rtName", "RT Name / Service Name"],
    ["vlan", "VLAN"],
    ["loopback", "Loopback"],
    ["wanNetwork", "WAN Network (CIDR)"],
    ["lanNetwork", "LAN Network (CIDR)"],
    ["wanNodeMain", "WAN MGMT NODE MAIN (/31)"],
    ["wanRtMain", "WAN MGMT RT MAIN (/31)"],
    ["wanNodeProtec", "WAN MGMT NODE PROTEC (/31)"],
    ["wanRtProtec", "WAN MGMT RT PROTEC (/31)"],
  ];
  const missing = required.filter(([k]) => !d[k]);
  if (missing.length) return `กรอกให้ครบ: ${missing.map((x) => x[1]).join(", ")}`;

  if (d.vlan && !/^\d+$/.test(d.vlan)) return "VLAN ต้องเป็นตัวเลข";

  // WAN/LAN must be CIDR
  if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(d.wanNetwork)) return "WAN Network ต้องเป็นรูปแบบ CIDR เช่น 172.19.55.32/29";
  if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(d.lanNetwork)) return "LAN Network ต้องเป็นรูปแบบ CIDR เช่น 203.156.1.168/30";

  // /31 fields allow /31 only
  const mgmtFields = [
    ["wanNodeMain", d.wanNodeMain],
    ["wanRtMain", d.wanRtMain],
    ["wanNodeProtec", d.wanNodeProtec],
    ["wanRtProtec", d.wanRtProtec],
  ];
  for (const [name, v] of mgmtFields) {
    if (!/^\d{1,3}(\.\d{1,3}){3}\/31$/.test(v)) {
      return `${name} ต้องเป็น /31 เช่น 10.100.120.10/31`;
    }
  }

  // community numeric optional
  if (d.commMain && !/^\d+$/.test(d.commMain)) return "Community main ต้องเป็นตัวเลข";
  if (d.commBackup && !/^\d+$/.test(d.commBackup)) return "Community backup ต้องเป็นตัวเลข";

  return "";
}

/* -------------------- IP/CIDR helpers -------------------- */
function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) throw new Error(`Invalid IP: ${ip}`);
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function intToIp(n) {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
}

function prefixToMask(prefix) {
  if (prefix < 0 || prefix > 32) throw new Error(`Invalid prefix: ${prefix}`);
  const maskInt = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIp(maskInt);
}

function parseCidr(cidr) {
  const [ip, prefixStr] = cidr.split("/");
  const prefix = Number(prefixStr);
  const base = ipToInt(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = base & mask;
  return { ip, prefix, base, mask, network };
}

function hostFromCidr(cidr, offset) {
  const { network } = parseCidr(cidr);
  return intToIp((network + offset) >>> 0);
}

function ipOnly(cidrOrIp) {
  // "10.0.0.1/31" -> "10.0.0.1"
  return String(cidrOrIp).split("/")[0].trim();
}

/* -------------------- Parse node port -------------------- */
function extractPort(nodeField) {
  // Accept: "CX600_BPO GE0/3/6" or "CX600_BPO GigabitEthernet0/3/6"
  // Return: "GigabitEthernet0/3/6"
  if (!nodeField) return "GigabitEthernet0/0/0";

  // try "GE0/3/6"
  let m = nodeField.match(/\bGE\s*([0-9]+\/[0-9]+\/[0-9]+)\b/i);
  if (m) return `GigabitEthernet${m[1]}`;

  // try "GE0/3/6" without space
  m = nodeField.match(/\bGE([0-9]+\/[0-9]+\/[0-9]+)\b/i);
  if (m) return `GigabitEthernet${m[1]}`;

  // try "GigabitEthernet0/3/6"
  m = nodeField.match(/\bGigabitEthernet\s*([0-9]+\/[0-9]+\/[0-9]+)\b/i);
  if (m) return `GigabitEthernet${m[1]}`;

  return "GigabitEthernet0/0/0";
}

/* -------------------- Templates -------------------- */
/**
 * NOTE:
 * - ค่าที่เป็น "Cipher password / NTP key / SNMP community write" ใน template ของคุณ
 *   ผม "คงไว้ตามที่ส่งมา" เพื่อให้ output ใกล้เคียงงานจริง
 * - ถ้าต้องการทำให้แก้ได้จากหน้าเว็บ ค่อยเพิ่ม input แล้วแทนด้วย ${d.xxx}
 */

function tpl_AR5710_FULL(d) {
  const CID = d.cid;
  const CUST = d.rtName;
  const VLAN = d.vlan;

  const desc = `:${CID}:${CUST}`;

  // WAN /29 mapping (confirmed)
  const wan_node_main = hostFromCidr(d.wanNetwork, 1); // .33
  const wan_node_prot = hostFromCidr(d.wanNetwork, 2); // .34
  const wan_rt = hostFromCidr(d.wanNetwork, 3);        // .35

  // masks
  const wanMask = prefixToMask(parseCidr(d.wanNetwork).prefix);
  const lanMask = prefixToMask(parseCidr(d.lanNetwork).prefix);

  // LAN /30 -> RT is network+1 (203.156.1.169)
  const lan_rt = hostFromCidr(d.lanNetwork, 1);

  // /31 mgmt IPs
  const wanNodeMainIp = ipOnly(d.wanNodeMain);
  const wanRtMainIp = ipOnly(d.wanRtMain);
  const wanNodeProtIp = ipOnly(d.wanNodeProtec);
  const wanRtProtIp = ipOnly(d.wanRtProtec);

  // Defaults based on your template
  const ASN_NODE = 65423;
  const ASN_RT = 65001;

  const COMM_MAIN = d.commMain || "14";
  const COMM_BK = d.commBackup || "97";

  const nodeMainPort = extractPort(d.nodeMain) || "GigabitEthernet0/3/6";
  const nodeProtPort = extractPort(d.nodeProtec) || "GigabitEthernet0/3/8";

  return `===== PRECONFIG NODE =====
NODE ${d.nodeMain || "CX600_BPO"}

#
interface ${nodeMainPort}.124
 vlan-type dot1q 124
 description ${desc}
 ip binding vpn-instance __dcn_vpn__
 ip address ${wanNodeMainIp} 255.255.255.254
 statistic enable
#
nqa test-instance ${CID} 1
 test-type icmp
 destination-address ipv4 ${wanRtMainIp}
 source-address ipv4 ${wanNodeMainIp}
 vpn-instance __dcn_vpn__
 frequency 30
 start now
#
ip route-static vpn-instance __dcn_vpn__ ${d.loopback} 32 ${wanRtMainIp} track nqa ${CID} 1
#

#
ip vpn-instance ${VLAN}
 description ${desc}
 ipv4-family
  route-distinguisher ${ASN_NODE}:${VLAN}
  apply-label per-route
  vpn-target ${ASN_NODE}:${ASN_NODE} export-extcommunity
  vpn-target ${ASN_NODE}:${ASN_NODE} import-extcommunity
#
interface ${nodeMainPort}.${VLAN}
 vlan-type dot1q ${VLAN}
 mtu 9500
 description ${desc}
 ip binding vpn-instance ${VLAN}
 ip address ${wan_node_main} ${wanMask}
 statistic enable
#
bgp ${ASN_NODE}
 ipv4-family vpn-instance ${VLAN}
  import-route direct
  peer ${wan_rt} as-number ${ASN_RT}
  peer ${wan_rt} description ${desc}
  peer ${wan_rt} ebgp-max-hop 5
  peer ${wan_rt} connect-interface ${nodeMainPort}.${VLAN}
  peer ${wan_rt} bfd enable
  peer ${wan_rt} route-policy rp_customer_l3vpn_in import
  peer ${wan_rt} route-policy rp_customer_l3vpn_out export
  peer ${wan_rt} route-limit 10 80 alert-only
  peer ${wan_rt} advertise-community
#

NODE ${d.nodeProtec || "CX600_BMM"}

#
interface ${nodeProtPort}.124
 vlan-type dot1q 124
 description ${desc}
 ip binding vpn-instance __dcn_vpn__
 ip address ${wanNodeProtIp} 255.255.255.254
 statistic enable
#
nqa test-instance ${CID} 2
 test-type icmp
 destination-address ipv4 ${wanRtProtIp}
 source-address ipv4 ${wanNodeProtIp}
 vpn-instance __dcn_vpn__
 frequency 30
 start now
#
ip route-static vpn-instance __dcn_vpn__ ${d.loopback} 32 ${wanRtProtIp} track nqa ${CID} 2
#

#
ip vpn-instance ${VLAN}
 description ${desc}
 ipv4-family
  route-distinguisher ${ASN_NODE}:${VLAN}
  apply-label per-route
  vpn-target ${ASN_NODE}:${ASN_NODE} export-extcommunity
  vpn-target ${ASN_NODE}:${ASN_NODE} import-extcommunity
#
interface ${nodeProtPort}.${VLAN}
 vlan-type dot1q ${VLAN}
 mtu 9500
 description ${desc}
 ip binding vpn-instance ${VLAN}
 ip address ${wan_node_prot} ${wanMask}
 statistic enable
#
bgp ${ASN_NODE}
 ipv4-family vpn-instance ${VLAN}
  import-route direct
  peer ${wan_rt} as-number ${ASN_RT}
  peer ${wan_rt} description ${desc}
  peer ${wan_rt} ebgp-max-hop 5
  peer ${wan_rt} connect-interface ${nodeProtPort}.${VLAN}
  peer ${wan_rt} bfd enable
  peer ${wan_rt} route-policy rp_customer_l3vpn_in import
  peer ${wan_rt} route-policy rp_customer_l3vpn_out export
  peer ${wan_rt} route-policy rp_customer_l3vpn_out export
  peer ${wan_rt} route-limit 10 80 alert-only
  peer ${wan_rt} advertise-community
#

===== END PRECONFIG NODE =====


===== RT CONFIG (AR5710-S) =====
# Generated: ${nowStamp()}
# Customer : ${d.customer || "-"}
# CID      : ${CID}
# Service  : ${CUST}
# Proxy    : ${d.proxy}
# Remark   : ${d.remark || "-"}

clock timezone TH add 07:00:00

syst

sysname :[${CID}]:RT_${CUST}

inter Vlanif 1
undo ip address
shutdown
q

ip vpn-instance __dcn_vpn__
 ipv4-family
q

q

port combination-mode 10GE interface MultiGE 0/0/0
y
port combination-mode 10GE interface MultiGE 0/0/1
y

interface LoopBack1
 ip binding vpn-instance __dcn_vpn__
 ip address ${d.loopback} 32
q

info-center loghost 58.82.174.32 local-time
info-center loghost source LoopBack 1

dns resolve

vlan batch 10 124 ${VLAN}
q

install feature-software WEAKEA
syst

telnet server enable
stelnet server enable
snetconf server enable

lldp enable

dhcp enable
dhcp server bootp automatic

ip host DNS1 182.50.80.4
ip host DNS2 182.50.80.5

acl name Monitor-Telnet 2000
 rule 0 permit source 10.0.0.0 0.255.255.255
 rule 1 permit source 58.82.174.0 0.0.0.255
 rule 2 permit source 169.254.0.0 0.0.255.255
 rule 3 permit source 172.16.0.0 0.15.255.255
 rule 4 permit source 182.50.80.0 0.0.0.127
 rule 5 permit source 192.168.0.0 0.0.255.255
 rule 1000 deny
q

telnet server acl 2000
ssh server acl 2000
snmp-agent acl 2000
ftp server acl 2000

traffic classifier GRAPH-DOMESTIC type or
 if-match dscp default
traffic classifier GRAPH-INTER type or
 if-match dscp af11
q

traffic behavior GRAPH-DOMESTIC
 statistic enable
traffic behavior GRAPH-INTER
 statistic enable
q

traffic policy GRAPH-DOMESTIC
 classifier GRAPH-DOMESTIC behavior GRAPH-DOMESTIC precedence 1
traffic policy GRAPH-INTER
 classifier GRAPH-INTER behavior GRAPH-INTER precedence 5
q

radius-server template jasradius
 radius-server shared-key cipher +jastel+
y
 radius-server authentication 10.20.1.31 1812 vpn-instance __dcn_vpn__ source ip-address ${d.loopback}
 radius-server accounting 10.20.1.31 1813 vpn-instance __dcn_vpn__ source ip-address ${d.loopback}
 radius-server retransmit 2
q

aaa
  authentication-scheme default
  authentication-mode local radius
 authentication-scheme radius
  authentication-mode radius
 authentication-scheme jasradius
  authentication-mode radius local
 authorization-scheme default
 accounting-scheme default
 accounting-scheme jasradius
  accounting start-fail online
 local-aaa-user password policy administrator
  undo password alert original
 domain default
  authentication-scheme default
 domain default_admin
  authentication-scheme jasradius
  accounting-scheme jasradius
  radius-server jasradius

 local-user nocjastel password irreversible-cipher Ov80ylgm]#
 local-user nocjastel privilege level 3
y
 local-user nocjastel service-type telnet ssh
y
 local-user jastel password irreversible-cipher Jastel@min1234#
 local-user jastel privilege level 3
y
 local-user jastel service-type telnet ssh
y
q

interface Vlanif10
 ip address ${lan_rt} ${lanMask}
 dhcp select interface
 dhcp server dns-list 182.50.80.4 8.8.8.8
 traffic-policy GRAPH-DOMESTIC outbound
 set flow-stat interval 30
q

clear configuration interface GE 0/0/4
y

inter range GE 0/0/0 to GE 0/0/7
 portswitch
 description [LAN]:TO:[${CID}]:[CUST]
 set flow-stat interval 30
 port link-type access
 port default vlan 10
 speed 1000
 duplex full
q

interface Vlanif124
 ip binding vpn-instance __dcn_vpn__
 ip address ${wanRtMainIp} 31
 ip address ${wanRtProtIp} 31 sub
q

interface Vlanif${VLAN}
 ip address ${wan_rt} ${wanMask}
 traffic-policy GRAPH-INTER inbound
q

interface 10GE0/0/0
 portswitch
 description [NODE]:TO:[${d.nodeMain || "CX600_BPO"}]<VIA>[JAS]:[${nodeMainPort.replace("GigabitEthernet", "GE")}]
 set flow-stat interval 30
 port link-type trunk
 port trunk allow-pass vlan 124 ${VLAN}
 device transceiver 1000BASE-X
 y

interface 10GE0/0/1
 portswitch
 description [NODE]:TO:[${d.nodeProtec || "CX600_BMM"}]<VIA>[JAS]:[${nodeProtPort.replace("GigabitEthernet", "GE")}]
 set flow-stat interval 30
 port link-type trunk
 port trunk allow-pass vlan 124 ${VLAN}
 device transceiver 1000BASE-X
 y

nqa test-instance BPO 1
 test-type icmp
 destination-address ipv4 ${wanNodeMainIp}
 source-address ipv4 ${wanRtMainIp}
 vpn-instance __dcn_vpn__
 frequency 30
 start now
nqa test-instance BMM 2
 test-type icmp
 destination-address ipv4 ${wanNodeProtIp}
 source-address ipv4 ${wanRtProtIp}
 vpn-instance __dcn_vpn__
 frequency 30
 start now
q

ip route-static vpn-instance __dcn_vpn__ 0.0.0.0 0.0.0.0 ${wanNodeMainIp} track nqa BPO 1
ip route-static vpn-instance __dcn_vpn__ 0.0.0.0 0.0.0.0 ${wanNodeProtIp} preference 100 track nqa BMM 2

ip route-static ${d.lanNetwork} NULL 0

ip ip-prefix pf_${CID} index 10 permit ${d.wanNetwork}
ip ip-prefix pf_${CID} index 20 permit ${d.lanNetwork}

route-policy rp_peer_node_main_in permit node 10
 apply preferred-value 100

route-policy rp_peer_node_main_out permit node 10
 if-match ip-prefix pf_${CID}
 apply community ${ASN_NODE}:${COMM_MAIN}

route-policy rp_peer_node_protect_out permit node 10
 if-match ip-prefix pf_${CID}
 apply community ${ASN_NODE}:${COMM_BK}
 apply cost 50
q

bgp ${ASN_RT}
 router-id ${wan_rt}
 graceful-restart
 peer ${wan_node_main} as-number ${ASN_NODE}
 peer ${wan_node_main} description BPO
 peer ${wan_node_main} bfd enable
 peer ${wan_node_main} timer keepalive 5 hold 15
y

 peer ${wan_node_prot} as-number ${ASN_NODE}
 peer ${wan_node_prot} description BMM
 peer ${wan_node_prot} bfd enable
 peer ${wan_node_prot} timer keepalive 5 hold 15
y

 #
 ipv4-family unicast
  undo synchronization
  network ${d.lanNetwork}
  network ${d.wanNetwork}
  peer ${wan_node_main} enable
  peer ${wan_node_main} advertise-community
  peer ${wan_node_main} route-policy rp_peer_node_main_in import
  peer ${wan_node_main} route-policy rp_peer_node_main_out export
  peer ${wan_node_prot} enable
  peer ${wan_node_prot} advertise-community
  peer ${wan_node_prot} route-policy rp_peer_node_protect_out export
 q
q

error-down auto-recovery cause bpdu-protection interval 300

snmp-agent community write +jastel+
snmp-agent sys-info version v2c
snmp-agent sys-info contact "${d.customer || d.rtName || ""}"
snmp-agent target-host host-name zabbix-proxy trap address udp-domain 58.82.174.23 vpn-instance __dcn_vpn__ udp-port 10162 params securityname +jastel+
snmp-agent target-host trap address udp-domain 169.254.254.40 vpn-instance __dcn_vpn__ params securityname cipher +jastel+ v2c
snmp-agent target-host trap address udp-domain 169.254.254.41 vpn-instance __dcn_vpn__ params securityname cipher +jastel+ v2c private-netmanager

snmp-agent sys-info version v3 disable
snmp-agent trap source  LoopBack1
snmp-agent trap enable
snmp-agent protocol source-status all-interface
snmp-agent protocol source-status ipv6 all-interface
snmp-agent proxy protocol source-status all-interface
snmp-agent proxy protocol source-status ipv6 all-interface
snmp-agent

snmp-agent notification-log enable
snmp-agent notification-log global-ageout 36
snmp-agent extend error-code enable

user-interface maximum-vty 15
user-interface vty 0 14
 acl 2000 inbound
 authentication-mode aaa
 user privilege level 3
 protocol inbound telnet
 dis th
q

ntp server source-interface all enable
y

ntp authentication enable
ntp authentication-keyid 6 authentication-mode md5 cipher 9IPjtW@ilGmFWn|Q\\303
ntp trusted authentication-keyid 6
ntp unicast-server 10.20.1.100 authentication-keyid 6 vpn-instance __dcn_vpn__ source-interface  LoopBack1 preferred

telnet server-source all-interface
y
telnet ipv6 server-source all-interface
y

q

save
y
`;
}

/* ---- Other devices (placeholders) ---- */
function tpl_S5335(d) {
  return `# S5335 template not implemented yet
# CID: ${d.cid}
# Service: ${d.rtName}
# VLAN: ${d.vlan}
# Loopback: ${d.loopback}
`;
}

function tpl_ISR4331(d) {
  return `! Cisco ISR4331 template not implemented yet
! CID: ${d.cid}
! Service: ${d.rtName}
! VLAN: ${d.vlan}
! Loopback: ${d.loopback}
`;
}

const TEMPLATE_MAP = {
  AR5710: tpl_AR5710_FULL,
  S5335: tpl_S5335,
  ISR4331: tpl_ISR4331,
};

/* -------------------- Generate / Copy / Download / Clear -------------------- */
function generateConfig() {
  const d = getFormData();
  const err = validateBasic(d);
  if (err) {
    setStatus(`⚠️ ${err}`);
    return;
  }

  const fn = TEMPLATE_MAP[d.deviceType] || tpl_AR5710_FULL;
  let out = "";
  try {
    out = fn(d);
  } catch (e) {
    setStatus(`❌ Error: ${e?.message || e}`);
    return;
  }

  const outEl = $("output");
  if (outEl) outEl.value = out;

  setStatus(`Generated ✅ (${d.deviceType})`);
}

async function copyOutput() {
  const text = $("output")?.value || "";
  if (!text) return setStatus("⚠️ ยังไม่มี output");

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied ✅");
  } catch {
    const outEl = $("output");
    outEl?.select();
    document.execCommand("copy");
    setStatus("Copied (fallback) ✅");
  }
}

function downloadTxt() {
  const text = $("output")?.value || "";
  if (!text) return setStatus("⚠️ ยังไม่มี output");

  const d = getFormData();
  const safe = (s) => String(s || "").replace(/[^a-zA-Z0-9_\-]/g, "_");
  const fname = `${safe(d.cid || "config")}_${safe(d.deviceType)}.txt`;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  setStatus(`Downloaded ✅ (${fname})`);
}

function clearAll() {
  const ids = [
    "cid", "rtName", "vlan", "loopback",
    "nodeMain", "nodeProtec",
    "wanNodeMain", "wanRtMain", "wanNodeProtec", "wanRtProtec",
    "wanNetwork", "lanNetwork",
    "commMain", "commBackup",
    "customer", "remark",
    "output",
  ];
  ids.forEach((id) => { if ($(id)) $(id).value = ""; });

  if ($("proxy")) $("proxy").value = "None";
  setStatus("");
}

/* -------------------- Wire up events -------------------- */
function wire() {
  $("btnGenerate")?.addEventListener("click", generateConfig);
  $("btnCopy")?.addEventListener("click", copyOutput);
  $("btnDownload")?.addEventListener("click", downloadTxt);
  $("btnClear")?.addEventListener("click", clearAll);

  $("deviceType")?.addEventListener("change", () => {
    setStatus(`Selected: ${$("deviceType").value}`);
  });

  // Enter-to-generate (optional)
  const enterIds = [
    "cid","rtName","vlan","loopback",
    "wanNodeMain","wanRtMain","wanNodeProtec","wanRtProtec",
    "wanNetwork","lanNetwork","commMain","commBackup","customer","remark"
  ];
  enterIds.forEach((id) => {
    $(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") generateConfig();
    });
  });
}

wire();
