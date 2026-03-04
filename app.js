const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  $("status").textContent = msg || "";
}

function getFormData() {
  return {
    deviceType: $("deviceType").value,
    cid: $("cid").value.trim(),
    rtName: $("rtName").value.trim(),
    vlan: $("vlan").value.trim(),
    loopback: $("loopback").value.trim(),
    nodeMain: $("nodeMain").value.trim(),
    nodeProtec: $("nodeProtec").value.trim(),
    wanNodeMain: $("wanNodeMain").value.trim(),
    wanNodeProtec: $("wanNodeProtec").value.trim(),
    wanRtMain: $("wanRtMain").value.trim(),
    wanRtProtec: $("wanRtProtec").value.trim(),
    wanNetwork: $("wanNetwork").value.trim(),
    lanNetwork: $("lanNetwork").value.trim(),
    commMain: $("commMain").value.trim(),
    commBackup: $("commBackup").value.trim(),
    customer: $("customer").value.trim(),
    proxy: $("proxy").value,
    remark: $("remark").value.trim(),
  };
}

/* ---------- Utilities ---------- */
function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validateBasic(d) {
  const required = [
    ["cid", "CID"],
    ["rtName", "RT Name / Service Name"],
    ["vlan", "VLAN"],
    ["loopback", "Loopback"],
  ];

  const missing = required.filter(([k]) => !d[k]);
  if (missing.length) {
    return `กรอกให้ครบ: ${missing.map(x => x[1]).join(", ")}`;
  }

  if (d.vlan && !/^\d+$/.test(d.vlan)) return "VLAN ต้องเป็นตัวเลข";
  if (d.commMain && !/^\d+$/.test(d.commMain)) return "Community main ต้องเป็นตัวเลข";
  if (d.commBackup && !/^\d+$/.test(d.commBackup)) return "Community backup ต้องเป็นตัวเลข";

  return "";
}

/* ---------- Templates ---------- */
/**
 * หมายเหตุ: ตอนนี้เป็น “โครง/ตัวอย่าง” ให้คุณใช้งานได้เลย
 * ถ้าคุณส่งตัวอย่าง config จริงของแต่ละรุ่นมา 1 ชุด ผมจะปรับ template ให้เป๊ะตามมาตรฐานทีมคุณ
 */

function tpl_AR5710(d) {
  return `# =========================
# CUSTOMER / SERVICE
# =========================
# Generated: ${nowStamp()}
# Customer : ${d.customer || "-"}
# CID      : ${d.cid}
# Service  : ${d.rtName}
# Proxy    : ${d.proxy}
# Remark   : ${d.remark || "-"}

system-view
sysname ${d.rtName || "AR5710-SVC"}

# ---- MGMT / LOOPBACK ----
interface LoopBack0
 ip address ${d.loopback} 255.255.255.255

# ---- VLAN ----
vlan ${d.vlan}

# ---- WAN MGMT (MAIN/PROTEC) ----
# MAIN: ${d.nodeMain || "-"}
#  Node IP: ${d.wanNodeMain || "-"}
#  RT IP  : ${d.wanRtMain || "-"}
# PROT: ${d.nodeProtec || "-"}
#  Node IP: ${d.wanNodeProtec || "-"}
#  RT IP  : ${d.wanRtProtec || "-"}

# ---- WAN/LAN Networks ----
# WAN: ${d.wanNetwork || "-"}
# LAN: ${d.lanNetwork || "-"}

# ---- SNMP Communities (if used) ----
# main  : ${d.commMain || "-"}
# backup: ${d.commBackup || "-"}

save
y
`;
}

function tpl_S5335(d) {
  return `# =========================
# SWITCH PROVISIONING
# =========================
# Generated: ${nowStamp()}
# Customer : ${d.customer || "-"}
# CID      : ${d.cid}
# Service  : ${d.rtName}
# Proxy    : ${d.proxy}
# Remark   : ${d.remark || "-"}

system-view
sysname ${d.rtName || "S5335-SVC"}

vlan ${d.vlan}
 name VLAN_${d.vlan}

# Loopback (if L3 enabled on switch)
interface LoopBack0
 ip address ${d.loopback} 255.255.255.255

# WAN/LAN hint
# WAN: ${d.wanNetwork || "-"}
# LAN: ${d.lanNetwork || "-"}

save
y
`;
}

function tpl_ISR4331(d) {
  return `! =========================
! CISCO ISR4331 PROVISIONING
! =========================
! Generated: ${nowStamp()}
! Customer : ${d.customer || "-"}
! CID      : ${d.cid}
! Service  : ${d.rtName}
! Proxy    : ${d.proxy}
! Remark   : ${d.remark || "-"}

hostname ${sanitizeCiscoHostname(d.rtName || "ISR4331-SVC")}

! Loopback
interface Loopback0
 ip address ${d.loopback} 255.255.255.255
 no shut

! VLAN (example - adapt interface naming)
vlan ${d.vlan}
 name VLAN_${d.vlan}

! WAN/LAN hint
! WAN: ${d.wanNetwork || "-"}
! LAN: ${d.lanNetwork || "-"}

end
write memory
`;
}

function sanitizeCiscoHostname(name) {
  // Cisco hostname: avoid spaces/specials
  return name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-]/g, "").slice(0, 63) || "ISR4331";
}

const TEMPLATE_MAP = {
  AR5710: tpl_AR5710,
  S5335: tpl_S5335,
  ISR4331: tpl_ISR4331,
};

function generateConfig() {
  const d = getFormData();
  const err = validateBasic(d);
  if (err) {
    setStatus(`⚠️ ${err}`);
    return;
  }

  const fn = TEMPLATE_MAP[d.deviceType] || tpl_AR5710;
  const out = fn(d);

  $("output").value = out;
  setStatus(`Generated ✅ (${d.deviceType})`);
}

/* ---------- Actions ---------- */
async function copyOutput() {
  const text = $("output").value;
  if (!text) return setStatus("⚠️ ยังไม่มี output");

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied ✅");
  } catch {
    $("output").select();
    document.execCommand("copy");
    setStatus("Copied (fallback) ✅");
  }
}

function downloadTxt() {
  const text = $("output").value;
  if (!text) return setStatus("⚠️ ยังไม่มี output");

  const d = getFormData();
  const filenameSafe = (d.cid || "config").replace(/[^a-zA-Z0-9_\-]/g, "_");
  const fname = `${filenameSafe}_${d.deviceType}.txt`;

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
    "cid","rtName","vlan","loopback","nodeMain","nodeProtec",
    "wanNodeMain","wanNodeProtec","wanRtMain","wanRtProtec",
    "wanNetwork","lanNetwork","commMain","commBackup","customer","remark",
    "output"
  ];
  ids.forEach(id => $(id).value = "");
  $("proxy").value = "None";
  setStatus("");
}

/* ---------- Wire up ---------- */
$("btnGenerate").addEventListener("click", generateConfig);
$("btnCopy").addEventListener("click", copyOutput);
$("btnDownload").addEventListener("click", downloadTxt);
$("btnClear").addEventListener("click", clearAll);

$("deviceType").addEventListener("change", () => {
  setStatus(`Selected: ${$("deviceType").value}`);
});
