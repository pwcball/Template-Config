// app.js - Static Config Generator (GitHub Pages friendly)

// ----- Templates (ปรับคำสั่งจริงตามมาตรฐานทีมคุณได้) -----
const TEMPLATES = {
  "AR5710-S (Router)": `
# ===== Huawei AR5710-S =====
# CID: {{CID}}
# Service: {{RT_NAME}}
# Customer: {{CUSTOMER_FULLNAME}}
# Proxy: {{PROXY}}

sysname {{RT_NAME}}
#
# Loopback
interface LoopBack0
 ip address {{LOOPBACK}} 255.255.255.255
#
# ===== WAN MANAGEMENT =====
# Node MAIN port: {{NODE_MAIN_PORT}}
# Node PROTEC port: {{NODE_PROTEC_PORT}}

# WAN MGMT NODE MAIN: {{WAN_MGMT_NODE_MAIN_IP}}
# WAN MGMT NODE PROTEC: {{WAN_MGMT_NODE_PROTEC_IP}}
# WAN MGMT RT MAIN: {{WAN_MGMT_RT_MAIN_IP}}
# WAN MGMT RT PROTEC: {{WAN_MGMT_RT_PROTEC_IP}}

# ===== WAN / LAN =====
# WAN Network: {{WAN_NETWORK}}
# LAN Network: {{LAN_NETWORK}}

# ===== VLAN =====
vlan {{VLAN}}
 description {{CID}}
#
# ===== COMMUNITY =====
# main={{COMMUNITY_MAIN}} backup={{COMMUNITY_BACKUP}}
#
return
`.trim(),

  "S5335-L10T4XA-V2 (Switch)": `
# ===== Huawei S5335-L10T4XA-V2 =====
# CID: {{CID}}
# Service: {{RT_NAME}}
# Customer: {{CUSTOMER_FULLNAME}}

sysname {{RT_NAME}}
#
# VLAN
vlan {{VLAN}}
 description {{CID}}
#
# (ตัวอย่าง) ตั้งค่า SNMP community
snmp-agent
snmp-agent community read cipher {{COMMUNITY_MAIN}}
snmp-agent community read cipher {{COMMUNITY_BACKUP}}
#
# (ตัวอย่าง) พอร์ต uplink/downlink ให้ไปปรับเองตามแบบฟอร์มถ้ามี
# interface GigabitEthernet0/0/1
#  port link-type trunk
#  port trunk allow-pass vlan {{VLAN}}
#
return
`.trim(),

  "Cisco ISR4331 (Router)": `
! ===== Cisco ISR4331 =====
! CID: {{CID}}
! Service: {{RT_NAME}}
! Customer: {{CUSTOMER_FULLNAME}}
! Proxy: {{PROXY}}

hostname {{RT_NAME}}
!
interface Loopback0
 ip address {{LOOPBACK}} 255.255.255.255
!
! ===== WAN / LAN =====
! WAN Network: {{WAN_NETWORK}}
! LAN Network: {{LAN_NETWORK}}
!
! ===== VLAN (ตัวอย่าง subif) =====
interface GigabitEthernet0/0/0.{{VLAN}}
 encapsulation dot1Q {{VLAN}}
 description {{CID}}
!
! ===== SNMP COMMUNITY (ตัวอย่าง) =====
snmp-server community {{COMMUNITY_MAIN}} RO
snmp-server community {{COMMUNITY_BACKUP}} RO
!
end
`.trim()
};

// ----- Helpers -----
function $(id) {
  return document.getElementById(id);
}

function getValue(id) {
  const el = $(id);
  if (!el) return "";
  return String(el.value ?? "").trim();
}

function renderTemplate(tpl, data) {
  return tpl.replace(/{{\s*([A-Z0-9_]+)\s*}}/g, (_, key) => data[key] ?? "");
}

function validateBasic(data) {
  // ทำ validation เบา ๆ กันกดแล้วว่างทั้งหมด
  const required = ["RT_NAME", "CID"];
  const missing = required.filter(k => !data[k]);
  if (missing.length) {
    throw new Error(`กรอกข้อมูลไม่ครบ: ${missing.join(", ")}`);
  }
}

function collectFormData() {
  // ids ตามที่มีใน index.html เวอร์ชันของคุณ
  const ids = [
    "CID","RT_NAME","VLAN","LOOPBACK",
    "NODE_MAIN_PORT","NODE_PROTEC_PORT",
    "WAN_MGMT_NODE_MAIN_IP","WAN_MGMT_NODE_PROTEC_IP",
    "WAN_MGMT_RT_MAIN_IP","WAN_MGMT_RT_PROTEC_IP",
    "WAN_NETWORK","LAN_NETWORK",
    "COMMUNITY_MAIN","COMMUNITY_BACKUP",
    "CUSTOMER_FULLNAME","PROXY"
  ];

  const data = {};
  for (const id of ids) data[id] = getValue(id);

  // ตั้งค่า default เผื่อผู้ใช้ไม่กรอก
  if (!data.VLAN) data.VLAN = "0";
  if (!data.LOOPBACK) data.LOOPBACK = "0.0.0.0";
  if (!data.PROXY) data.PROXY = "None";

  return data;
}

// ----- Main actions -----
function generateConfig() {
  const deviceType = getValue("deviceType");
  const template = TEMPLATES[deviceType];

  if (!template) throw new Error("ไม่พบ template ของอุปกรณ์นี้");

  const data = collectFormData();
  validateBasic(data);

  const output = renderTemplate(template, data);
  $("output").value = output;
}

async function copyConfig() {
  const text = getValue("output");
  if (!text) {
    alert("ยังไม่มี config ให้คัดลอก (กด 'สร้าง Config' ก่อน)");
    return;
  }
  await navigator.clipboard.writeText(text);
  alert("คัดลอก Config แล้ว");
}

// ----- Init -----
function init() {
  const genBtn = $("genBtn");
  const copyBtn = $("copyBtn");

  if (genBtn) genBtn.addEventListener("click", () => {
    try { generateConfig(); }
    catch (e) { alert(e.message); }
  });

  if (copyBtn) copyBtn.addEventListener("click", () => {
    copyConfig().catch(err => alert(err.message));
  });

  // สร้าง config ครั้งแรกอัตโนมัติ (ถ้าอยากให้ไม่ทำ ให้คอมเมนต์บรรทัดนี้)
  // try { generateConfig(); } catch (_) {}
}

document.addEventListener("DOMContentLoaded", init);
