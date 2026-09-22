const express = require("express");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const multer = require("multer");
const {
    makeInMemoryStore,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion,
    makeWASocket,
    isJidBroadcast
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = 21562;

// Create necessary directories
if (!fs.existsSync("temp")) fs.mkdirSync("temp");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("sessions")) fs.mkdirSync("sessions");

const upload = multer({ dest: "uploads/" });

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Store active client instances and tasks
const activeClients = new Map();
const activeTasks = new Map();
const backupNumbers = []; // { number, sessionId, authPath }

// =========================================================
// THEME — BLACK + WHITE + RED BORDER + BLUE/RED BUTTONS (APPLE STYLE)
// =========================================================
const theme = `
<style>
:root{
  --bg:#000;
  --card:#0d0d0d;
  --card-2:#111;
  --red:#e11d2e;
  --blue:#1476ff;
  --white:#fff;
  --grey:#8a8a8a;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
body{
  margin:0;padding:24px;background:var(--bg);color:var(--white);
  font-family:var(--font);min-height:100vh;
}
.wrap{max-width:820px;margin:0 auto;}
.card{
  background:var(--card);border:1.5px solid var(--red);border-radius:18px;
  padding:22px;margin:18px 0;box-shadow:0 0 22px rgba(225,29,46,.25),
  inset 0 0 18px rgba(0,0,0,.6);
}
.card.b{border-color:var(--blue);box-shadow:0 0 22px rgba(20,118,255,.25);}
h1,h2,h3{font-weight:700;letter-spacing:.3px;margin:0 0 12px;color:#fff;}
h1{font-size:28px;text-align:center;}
h1 span{color:var(--red);}
h2{font-size:22px;}
h3{font-size:18px;}
.brand{
  text-align:center;font-size:14px;color:var(--grey);letter-spacing:4px;
  text-transform:uppercase;margin-bottom:6px;
}
input,select,textarea,button{
  font-family:var(--font);font-size:16px;width:100%;padding:14px 16px;
  border-radius:12px;margin:8px 0;outline:none;
}
input,select,textarea{
  background:#111;border:1.5px solid var(--red);color:#fff;
}
input::placeholder,textarea::placeholder{color:#777;}
input:focus,select:focus,textarea:focus{
  border-color:var(--blue);box-shadow:0 0 12px rgba(20,118,255,.5);
}
button{
  border:none;font-weight:700;cursor:pointer;transition:.25s;letter-spacing:.4px;
}
.btn-blue{background:var(--blue);color:#fff;}
.btn-blue:hover{background:#0a5cd4;box-shadow:0 0 18px rgba(20,118,255,.7);}
.btn-red{background:var(--red);color:#fff;}
.btn-red:hover{background:#b81425;box-shadow:0 0 18px rgba(225,29,46,.7);}
.row{display:flex;gap:12px;flex-wrap:wrap;}
.row>*{flex:1;min-width:180px;}
.small{font-size:13px;color:var(--grey);}
.badge{
  display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;
  border:1px solid var(--red);color:var(--red);margin-left:8px;
}
.badge.ok{border-color:#19c37d;color:#19c37d;}
.badge.b{border-color:var(--blue);color:var(--blue);}
a{color:var(--blue);text-decoration:none;font-weight:600;}
a:hover{text-decoration:underline;}
.center{text-align:center;}
hr{border:none;border-top:1px solid #222;margin:18px 0;}
.task-box{
  background:#111;border:1.5px dashed var(--blue);border-radius:14px;
  padding:14px;margin-top:12px;word-break:break-all;
}
.instructions{
  text-align:left;max-width:600px;margin:20px auto;padding:15px;
  background:rgba(0,0,0,.6);border-radius:10px;border-left:3px solid var(--red);
}
.instructions li{margin-bottom:10px;color:#ccc;}
.splash{
  position:fixed;inset:0;background:#000;display:flex;flex-direction:column;
  align-items:center;justify-content:center;z-index:9999;transition:opacity .8s;
}
.splash h1{font-size:44px;margin-bottom:10px;}
.splash .logo{
  width:110px;height:110px;border-radius:50%;border:3px solid var(--red);
  display:flex;align-items:center;justify-content:center;font-size:44px;
  font-weight:800;color:var(--red);margin-bottom:22px;
  animation:pulse 1.6s infinite alternate;
}
@keyframes pulse{
  from{box-shadow:0 0 20px rgba(225,29,46,.4);}
  to{box-shadow:0 0 60px rgba(225,29,46,.9);}
}
.splash p{color:var(--grey);letter-spacing:6px;font-size:14px;text-transform:uppercase;}
.progress-container{
  width:80%;height:30px;background:rgba(50,50,100,.5);border-radius:15px;
  margin:30px auto;overflow:hidden;border:1px solid var(--red);
}
.progress-bar{
  height:100%;background:linear-gradient(to right,var(--blue),var(--red));
  transition:width .5s;
}
</style>
`;

// =========================================================
// SPLASH SCREEN
// =========================================================
const splashScreen = `
<div class="splash" id="splash">
  <div class="logo">DR</div>
  <h1>DARK <span style="color:var(--red)">RUL3X</span></h1>
  <p>WALEED KHAN</p>
</div>
<script>
  setTimeout(()=>{
    const s=document.getElementById('splash');
    if(s){s.style.opacity='0';setTimeout(()=>s.remove(),800);}
  },2200);
</script>
`;

// =========================================================
// HOME PAGE
// =========================================================
app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html><html><head>
<title>DARK RUL3X — WALEED KHAN</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
${theme}
</head><body>
${splashScreen}
<div class="wrap">

  <div class="brand">DARK RUL3X • WALEED KHAN</div>
  <h1>WhatsApp <span>Automation</span> Server</h1>

  <!-- PAIRING -->
  <div class="card">
    <h2>🔗 Pair WhatsApp Number</h2>
    <input id="numberInput" placeholder="WhatsApp number (with country code, e.g. 923001234567)">
    <button class="btn-blue" onclick="generatePairingCode()">Generate Pairing Code</button>
    <button class="btn-red" onclick="addBackup()">Add As Backup Number</button>
    <div id="pairingResult" class="center"></div>
  </div>

  <!-- SEND -->
  <div class="card b">
    <h2>📤 Send Messages / Media</h2>
    <form action="/send-message" method="POST" enctype="multipart/form-data">
      <select name="targetType" required>
        <option value="">-- Select Target Type --</option>
        <option value="number">Inbox (Number)</option>
        <option value="group">Group (GC UID)</option>
      </select>
      <input type="text" name="target" placeholder="Target Number / Group UID" required>

      <select name="msgType" required>
        <option value="">-- Select Message Type --</option>
        <option value="text">Text Messages (.txt)</option>
        <option value="image">Image (.jpg / .png)</option>
        <option value="video">Video (.mp4)</option>
        <option value="sticker">Sticker (.webp)</option>
      </select>

      <input type="file" name="messageFile" required>
      <input type="text" name="prefix" placeholder="Message prefix / caption (optional)">
      <input type="number" name="delaySec" placeholder="Delay in seconds between messages" min="1" required>
      <button type="submit" class="btn-blue">Start Sending</button>
    </form>
  </div>

  <!-- TASK ID -->
  <div class="card">
    <h2>🆔 My Task</h2>
    <button type="button" class="btn-blue" onclick="showMyTaskId()">Show My Task ID</button>
    <div id="taskIdDisplay" class="task-box center" style="display:none"></div>
  </div>

  <!-- STOP -->
  <div class="card">
    <h2>🛑 Stop Task</h2>
    <form action="/stop-task" method="POST">
      <input type="text" name="taskId" placeholder="Enter Task ID to stop" required>
      <button type="submit" class="btn-red">Stop Task</button>
    </form>
  </div>

  <!-- STATUS -->
  <div class="card b center">
    <h3>📊 Active Sessions <span class="badge ok">${activeClients.size}</span></h3>
    <h3>⚙️ Active Tasks <span class="badge">${activeTasks.size}</span></h3>
    <h3>🛡️ Backup Numbers <span class="badge b">${backupNumbers.length}</span></h3>
  </div>

  <div class="instructions">
    <h3 style="color:var(--red)">📖 How To Use</h3>
    <ol>
      <li>Enter WhatsApp number with country code → <b>Generate Pairing Code</b></li>
      <li>Open WhatsApp → Settings → Linked Devices → Link with phone number → Enter code</li>
      <li>Add 1-2 more numbers via <b>Add As Backup Number</b> (auto-switch on ban/logout)</li>
      <li>Upload .txt / image / video / sticker, choose target (Inbox or GC), set delay → Send</li>
    </ol>
  </div>

</div>

<script>
async function generatePairingCode(){
  const n=document.getElementById('numberInput').value.trim();
  if(!n){alert('Enter WhatsApp number');return;}
  document.getElementById('pairingResult').innerHTML='<p class="small">Generating...</p>';
  const r=await fetch('/code?number='+encodeURIComponent(n));
  document.getElementById('pairingResult').innerHTML=await r.text();
}

async function addBackup(){
  const n=document.getElementById('numberInput').value.trim();
  if(!n){alert('Enter WhatsApp number');return;}
  document.getElementById('pairingResult').innerHTML='<p class="small">Adding backup...</p>';
  const r=await fetch('/backup?number='+encodeURIComponent(n));
  document.getElementById('pairingResult').innerHTML=await r.text();
}

function showMyTaskId(){
  const id=localStorage.getItem('dr_task_id');
  const d=document.getElementById('taskIdDisplay');
  d.style.display='block';
  d.innerHTML = id
    ? '<h3>Your Task ID</h3><h2 style="color:var(--blue)">'+id+'</h2>'
    : '<p class="small">No active task yet. Start sending first.</p>';
}
</script>
</body></html>`);
});

// =========================================================
// CORE: CREATE CLIENT (with backup rotation)
// =========================================================
async function createClient(sessionId, number, sessionPath, isBackup = false) {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(
                state.keys,
                pino({ level: "fatal" }).child({ level: "fatal" })
            )
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        shouldIgnoreJid: jid => isJidBroadcast(jid),
        getMessage: async () => ({})
    });

    activeClients.set(sessionId, {
        client: sock,
        number,
        authPath: sessionPath,
        connected: false,
        isBackup
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (s) => {
        const { connection, lastDisconnect } = s;
        if (connection === "open") {
            console.log(`[DARK RUL3X] ✅ Connected: ${number} (${sessionId})`);
            const info = activeClients.get(sessionId);
            if (info) info.connected = true;
        } else if (connection === "close") {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`[DARK RUL3X] ⚠️ Disconnected ${number} (code ${code})`);
            const info = activeClients.get(sessionId);
            if (info) info.connected = false;

            if (code === 401 || code === 403) {
                console.log(`[DARK RUL3X] 🚫 ${number} banned/logged out → switching to backup`);
                switchToBackup(sessionId);
            } else {
                await delay(8000);
                createClient(sessionId, number, sessionPath, isBackup);
            }
        }
    });

    return sock;
}

// =========================================================
// BACKUP ROTATION
// =========================================================
function switchToBackup(failedSessionId) {
    const failed = activeClients.get(failedSessionId);
    if (failed) {
        try { failed.client.end(); } catch (e) {}
        activeClients.delete(failedSessionId);
    }

    if (backupNumbers.length === 0) {
        console.log("[DARK RUL3X] ❌ No backup number available!");
        return;
    }
    const next = backupNumbers.shift();
    console.log(`[DARK RUL3X] 🔁 Activating backup: ${next.number}`);
    createClient(next.sessionId, next.number, next.authPath, true);
}

// =========================================================
// ROUTE: PAIRING
// =========================================================
app.get("/code", async (req, res) => {
    const num = (req.query.number || "").replace(/[^0-9]/g, "");
    if (!num) return res.send(`<p class="small" style="color:var(--red)">Invalid number</p>`);

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sessionPath = path.join("sessions", sessionId);
    fs.mkdirSync(sessionPath, { recursive: true });

    try {
        const sock = await createClient(sessionId, num, sessionPath);

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(num);
            res.send(`
              <div class="task-box">
                <h2 style="color:var(--blue)">Pairing Code: ${code}</h2>
                <p class="small">Save this code to pair your device</p>
                <div class="instructions">
                  <p style="font-size:16px;"><strong>To pair your device:</strong></p>
                  <ol>
                    <li>Open WhatsApp on your phone</li>
                    <li>Settings → Linked Devices → Link a Device</li>
                    <li>Enter this pairing code</li>
                    <li>After pairing, start sending messages</li>
                  </ol>
                </div>
                <a href="/">⬅ Back to Home</a>
              </div>`);
        } else {
            res.send(`<div class="task-box"><p>Number already registered.</p><a href="/">Back</a></div>`);
        }
    } catch (err) {
        console.error("[DARK RUL3X] Pairing error:", err);
        res.send(`<div class="task-box"><p style="color:var(--red)">Error: ${err.message}</p><a href="/">Back</a></div>`);
    }
});

// =========================================================
// ROUTE: ADD BACKUP NUMBER
// =========================================================
app.get("/backup", async (req, res) => {
    const num = (req.query.number || "").replace(/[^0-9]/g, "");
    if (!num) return res.send(`<p class="small" style="color:var(--red)">Invalid number</p>`);

    const sessionId = `backup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const sessionPath = path.join("sessions", sessionId);
    fs.mkdirSync(sessionPath, { recursive: true });

    try {
        const sock = await createClient(sessionId, num, sessionPath, true);

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(num);
            backupNumbers.push({ number: num, sessionId, authPath: sessionPath });
            res.send(`
              <div class="task-box">
                <h2 style="color:var(--red)">Backup Pairing Code: ${code}</h2>
                <p class="small">Number <b>${num}</b> added to backup pool.</p>
                <p class="small">It will auto-activate if main number gets banned/logged out.</p>
                <a href="/">⬅ Back to Home</a>
              </div>`);
        } else {
            backupNumbers.push({ number: num, sessionId, authPath: sessionPath });
            res.send(`<div class="task-box"><p>Backup number registered.</p><a href="/">Back</a></div>`);
        }
    } catch (err) {
        console.error("[DARK RUL3X] Backup error:", err);
        res.send(`<div class="task-box"><p style="color:var(--red)">Error: ${err.message}</p><a href="/">Back</a></div>`);
    }
});

// =========================================================
// PICK MAIN CLIENT
// =========================================================
function getMainClient() {
    let fallback = null;
    for (const [id, info] of activeClients.entries()) {
        if (info.connected && !id.startsWith("backup_")) return { id, info };
        if (!fallback) fallback = { id, info };
    }
    return fallback;
}

// =========================================================
// ROUTE: SEND MESSAGES / MEDIA
// =========================================================
app.post("/send-message", upload.single("messageFile"), async (req, res) => {
    const { target, targetType, delaySec, prefix, msgType } = req.body;
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const picked = getMainClient();

    if (!picked) {
        return res.send(page(`<h2 style="color:var(--red)">No active WhatsApp session</h2><a href="/">Go Back</a>`));
    }
    const { client: waClient } = picked.info;
    const filePath = req.file?.path;

    if (!target || !filePath || !targetType || !delaySec || !msgType) {
        return res.send(page(`<h2 style="color:var(--red)">Missing required fields</h2><a href="/">Go Back</a>`));
    }

    const taskInfo = {
        sessionId: picked.id,
        isSending: true,
        stopRequested: false,
        totalMessages: 1,
        sentMessages: 0,
        target,
        targetType,
        msgType,
        startTime: new Date()
    };
    activeTasks.set(taskId, taskInfo);

    // Respond immediately so client gets task ID
    res.send(`<script>
        localStorage.setItem('dr_task_id','${taskId}');
        location.href='/task-status?taskId=${taskId}';
    </script>`);

    // Run sending in background
    (async () => {
        try {
            const recipient = targetType === "group"
                ? (target.includes("@g.us") ? target : target + "@g.us")
                : target.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

            if (msgType === "text") {
                const messages = fs.readFileSync(filePath, "utf-8")
                    .split("\n").map(m => m.trim()).filter(Boolean);
                taskInfo.totalMessages = messages.length;
                let i = 0;
                while (taskInfo.isSending && !taskInfo.stopRequested) {
                    let msg = messages[i];
                    if (prefix && prefix.trim()) msg = `${prefix.trim()} ${msg}`;
                    try {
                        await waClient.sendMessage(recipient, { text: msg });
                        taskInfo.sentMessages++;
                        console.log(`[${taskId}] Sent text to ${target}`);
                    } catch (e) {
                        console.error(`[${taskId}] send err:`, e.message);
                        taskInfo.error = e.message;
                    }
                    i = (i + 1) % messages.length;
                    await delay(delaySec * 1000);
                }
            } else {
                // media: image / video / sticker
                const buf = fs.readFileSync(filePath);
                const caption = prefix || "";
                while (taskInfo.isSending && !taskInfo.stopRequested) {
                    try {
                        if (msgType === "image") {
                            await waClient.sendMessage(recipient, { image: buf, caption });
                        } else if (msgType === "video") {
                            await waClient.sendMessage(recipient, { video: buf, caption });
                        } else if (msgType === "sticker") {
                            await waClient.sendMessage(recipient, { sticker: buf });
                        }
                        taskInfo.sentMessages++;
                        console.log(`[${taskId}] Sent ${msgType} to ${target}`);
                    } catch (e) {
                        console.error(`[${taskId}] media err:`, e.message);
                        taskInfo.error = e.message;
                    }
                    await delay(delaySec * 1000);
                }
            }
        } catch (err) {
            console.error(`[${taskId}] Task error:`, err);
            taskInfo.error = err.message;
        } finally {
            taskInfo.isSending = false;
            taskInfo.endTime = new Date();
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    })();
});

// =========================================================
// TASK STATUS PAGE
// =========================================================
app.get("/task-status", (req, res) => {
    const taskId = req.query.taskId;
    if (!taskId || !activeTasks.has(taskId))
        return res.send(page(`<h2 style="color:var(--red)">Invalid Task ID</h2><a href="/">Go Back</a>`));

    const t = activeTasks.get(taskId);
    const progress = Math.min(100, Math.floor((t.sentMessages / Math.max(1, t.totalMessages)) * 100));

    res.send(`
<!DOCTYPE html><html><head><title>Task — DARK RUL3X</title>
<meta name="viewport" content="width=device-width,initial-scale=1">${theme}</head>
<body><div class="wrap">
  <div class="brand">DARK RUL3X • WALEED KHAN</div>
  <h1>Task <span>Status</span></h1>

  <div class="card">
    <div class="task-box center"><b>${taskId}</b></div>
    <hr>
    <p>Status: <span class="badge ${t.isSending ? 'ok' : ''}">${t.isSending ? 'RUNNING' : (t.stopRequested ? 'STOPPED' : 'DONE')}</span></p>
    <p>Target: <b>${t.target}</b> (${t.targetType})</p>
    <p>Type: <b>${t.msgType}</b></p>
    <p>Sent: <b>${t.sentMessages}</b> / ${t.totalMessages}</p>
    <div class="progress-container">
      <div class="progress-bar" style="width:${progress}%"></div>
    </div>
    <p class="small">Start: ${t.startTime.toLocaleString()}</p>
    ${t.endTime ? `<p class="small">End: ${t.endTime.toLocaleString()}</p>` : ''}
    ${t.error ? `<p style="color:var(--red)">Error: ${t.error}</p>` : ''}

    <form action="/stop-task" method="POST" style="margin-top:18px">
      <input type="hidden" name="taskId" value="${taskId}">
      <button class="btn-red" type="submit">Stop This Task</button>
    </form>
  </div>

  <div class="center"><a href="/">⬅ Return Home</a></div>
</div></body></html>`);
});

// =========================================================
// STOP TASK
// =========================================================
app.post("/stop-task", (req, res) => {
    const { taskId } = req.body;
    if (!activeTasks.has(taskId))
        return res.send(page(`<h2 style="color:var(--red)">Invalid Task ID</h2><a href="/">Go Back</a>`));

    const t = activeTasks.get(taskId);
    t.stopRequested = true;
    t.isSending = false;
    t.endTime = new Date();

    res.send(page(`
      <h2>Task <span style="color:var(--red)">${taskId}</span> stopped</h2>
      <p>Messages sent: <b>${t.sentMessages}</b></p>
      <p class="small">Start: ${t.startTime.toLocaleString()}</p>
      <p class="small">End: ${t.endTime.toLocaleString()}</p>
      <a href="/">⬅ Go Home</a>`));
});

// =========================================================
// PAGE WRAPPER
// =========================================================
function page(inner) {
    return `<!DOCTYPE html><html><head><title>DARK RUL3X</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">${theme}</head>
    <body><div class="wrap">
      <div class="brand">DARK RUL3X • WALEED KHAN</div>
      <div class="card center">${inner}</div>
    </div></body></html>`;
}

// =========================================================
// GRACEFUL SHUTDOWN
// =========================================================
process.on("SIGINT", () => {
    console.log("[DARK RUL3X] Shutting down gracefully...");
    activeClients.forEach(({ client }, id) => {
        try { client.end(); } catch (e) {}
        console.log(`Closed connection: ${id}`);
    });
    process.exit(0);
});

// =========================================================
// START SERVER
// =========================================================
app.listen(PORT, () => {
    console.log(`[DARK RUL3X] 🚀 Server running on http://localhost:${PORT}`);
});