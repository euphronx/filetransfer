import express from "express";
import bodyParser from "body-parser";
import archiver from "archiver";
import { appendFileSync, createWriteStream, existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import crypto from "crypto";

const app = express();
mkdirSync("/home/files/zips/temp", { recursive: true });
app.set("trust proxy", true);

const CHAT_PREFIX = "/chat";
const CHAT_PATHS = new Set([
  "POST /chat/completions",
  "POST /beta/chat/completions",
  "POST /files",
  "POST /v1/tools/asr",
  "POST /v1/tools/tts",
]);

app.use(CHAT_PREFIX, bodyParser.raw({ type: () => true, limit: "32mb" }), async (req, res) => {
  const original = req.originalUrl || req.url;
  const rest = original.startsWith(CHAT_PREFIX) ? original.slice(CHAT_PREFIX.length) : req.url;
  const pathname = (rest.split("?")[0] || "/").replace(/\/$/, "") || "/";
  const method = req.method.toUpperCase();
  const fileDelete = method === "DELETE" && /^\/files\/[^/]+$/.test(pathname);
  if (!fileDelete && !CHAT_PATHS.has(`${method} ${pathname}`)) {
    return res.status(404).json({ error: { message: "not found" } });
  }

  let messages = [];
  const contentType = req.headers["content-type"];
  if (contentType && contentType.includes("application/json") && Buffer.isBuffer(req.body) && req.body.length) {
    try {
      messages = JSON.parse(req.body.toString("utf8")).messages || [];
    } catch {}
  }
  log(
    req.ip,
    "INFO",
    pathname,
    `proxy ${method}${pathname.endsWith("/chat/completions") ? `, content: ${messages[messages.length - 1].content}` : "-"}`
  );

  const headers = { Authorization: `Bearer ${process.env.API_KEY}`, Accept: req.headers.accept || "*/*" };
  if (contentType) headers["Content-Type"] = Array.isArray(contentType) ? contentType[0] : contentType;
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });

  try {
    const upstream = await fetch(`https://api.deepseek.com${rest}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : req.body,
      signal: controller.signal,
    });
    res.status(upstream.status);
    const outType = upstream.headers.get("content-type");
    if (outType) res.setHeader("Content-Type", outType);
    res.setHeader("Cache-Control", "no-cache");
    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise(resolve => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (error) {
    if (controller.signal.aborted || res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    console.error(error);
    res.status(502).json({ error: { message: "upstream failed" } });
  }
});

// middlewares
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());

const PWD_FILE = "/home/files/pwd.json";
const ZIPPED_FILE = "/home/files/zipped.json";

if (!existsSync(PWD_FILE)) writeFileSync(PWD_FILE, "{}", "utf8");
if (!existsSync(ZIPPED_FILE)) writeFileSync(ZIPPED_FILE, "{}", "utf8");

// Log info to log file and console
function log(ip, level, path, msg) {
  const json = { time: Date.now(), ip, level, path, msg };
  const str = JSON.stringify(json);
  console.log(str);
  appendFileSync("/home/files/traffic.log", `${str}\n`);
}

// Functions and constants about authenetication
const pwd = JSON.parse(readFileSync(PWD_FILE, "utf8"));
const PEPPER = process.env.PEPPER;
function hashPassword(password) {
  const hash = crypto.pbkdf2Sync(password, PEPPER, 100000, 64, "sha512").toString("hex");
  return hash;
}

// POST /download to download single file or zip
const zippedFiles = JSON.parse(readFileSync(ZIPPED_FILE, "utf8"));
{
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const [k, v] of Object.entries(zippedFiles)) {
    const zipDate = new Date(v.time);
    if (today - new Date(zipDate.getFullYear(), zipDate.getMonth(), zipDate.getDate()) >= 86400000) {
      delete zippedFiles[k];
    }
  }
  writeFileSync(ZIPPED_FILE, JSON.stringify(zippedFiles), "utf8");
}
app.post("/download", async (req, res) => {
  const { date, files, room } = req.body;
  const ip = req.ip;
  if (!date || !files) return res.status(400).send("Missing params");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).send("Invalid date format.");

  const key = files.sort().join("|");
  if (zippedFiles[key]) {
    log(ip, "INFO", "/download", `Sent zip to IP ${ip} with files: "${files.join('", "')}"`);
    return res.json({ name: `files_${date}_${zippedFiles[key].name}.zip` });
  }

  const rand = Math.random().toString(36).slice(2, 6);
  const zipName = `files_${date}_${rand}.zip`;
  const archive = archiver("zip", { zlib: { level: 5 } });

  try {
    const output = createWriteStream(`/home/files/zips/temp/${zipName}`);

    await new Promise((resolve, reject) => {
      output.on("close", () => {
        log(ip, "INFO", "/download", `Finished zipping files for ${date} with files: "${files.join('", "')}"`);
        resolve();
      });
      archive.on("warning", err => {
        if (err.code === "ENOENT") console.warn(err);
        else {
          if (!res.headersSent) res.status(500).send("Compression error");
          reject(err);
        }
      });
      archive.on("error", err => {
        if (!res.headersSent) res.status(500).send("Compression error");
        reject(err);
      });
      output.on("error", err => {
        if (!res.headersSent) res.status(500).send("Compression error");
        reject(err);
      });

      archive.pipe(output);
      for (const file of files) {
        if (!file) continue;
        const filePath = room ? `/home/files/rooms/${room}/${date}/${file}` : `/home/files/files/${date}/${file}`;
        if (filePath.includes("..")) continue;

        try {
          archive.file(filePath, { name: file });
        } catch (e) {
          console.error(e);
          if (!res.headersSent) res.status(500).send("Compression error");
        }
      }
      archive.finalize();
    });

    log(ip, "INFO", "/download", `Sent zip to IP ${ip} with files: "${files.join('", "')}"`);
    res.json({ name: zipName });
    zippedFiles[key] = { time: Date.now(), name: rand };
    writeFileSync(ZIPPED_FILE, JSON.stringify(zippedFiles), "utf8");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).send("Failed to create zip file");
  }
});

// POST /zip to archive all files in a day
app.post("/zip", async (req, res) => {
  const now = new Date();
  const pad = n => n.toString().padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const archive = archiver("zip", { zlib: { level: 8 } });
  const output = createWriteStream(`/home/files/zips/files_${today}.zip`);

  res.status(201).json({ message: `Created zip file for ${today}.`, name: `files_${today}.zip` });

  try {
    await new Promise((resolve, reject) => {
      output.on("close", () => {
        log(req.ip, "INFO", "/zip", `Finished zipping files for ${today}`);
        resolve();
      });
      archive.on("warning", err => {
        if (err.code === "ENOENT") console.warn(err);
        else {
          if (!res.headersSent) res.status(500).send("Compression error");
          reject(err);
        }
      });
      archive.on("error", err => {
        if (!res.headersSent) res.status(500).send("Compression error");
        reject(err);
      });
      output.on("error", err => {
        if (!res.headersSent) res.status(500).send("Compression error");
        reject(err);
      });

      archive.pipe(output);
      archive.directory(`/home/files/files/${today}`, false);
      archive.finalize();
    });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).send("Compression error");
  }
});

// Log download, upload and delete
app.put("/oper", async (req, res) => {
  const ip = req.ip;
  const { oper, files, date } = req.body;
  if (!oper || !files || !date) return res.status(400).send("Missing params");
  log(ip, "INFO", "/oper", `Operation ${oper.toUpperCase()} for date ${date} on files: "${files.join('", "')}"`);
  res.status(200).json({ message: "Operation logged." });
});

// Create new rooms
app.put("/create", async (req, res) => {
  const ip = req.ip;
  const { name, password } = req.body;
  const safeName = name.replace(/[^a-zA-Z0-9\-]+/g, "-").toLowerCase();

  if (safeName === "main") return res.status(409).json({ message: "Duplicated room name" });

  const hashed = hashPassword(password);
  for (const [roomPwd, roomName] of Object.entries(pwd)) {
    if (roomName === safeName && hashed === roomPwd) {
      delete pwd[hashed];
      writeFileSync(PWD_FILE, JSON.stringify(pwd), "utf8");
      log(ip, "INFO", "/create", `Deleted room ${safeName}`);
      return res.status(200).json({ message: `Deleted room ${safeName}` });
    }
    if (roomName === safeName) return res.status(409).json({ message: "Duplicated room name" });
    if (hashed === roomPwd) return res.status(409).json({ message: "Duplicated room password" });
  }

  const hash = hashPassword(password);
  pwd[hash] = safeName;
  res.status(200).json({ message: `Created room ${safeName}`, roomName: safeName });
  writeFileSync(PWD_FILE, JSON.stringify(pwd), "utf8");
  log(ip, "INFO", "/create", `Created room ${safeName}`);
});

// POST /check to sign in
app.post("/check", async (req, res) => {
  const { password, user_name: userName } = req.body;
  const ip = req.ip;
  if (!password) return res.status(400).json({ message: "Password is required" });
  const hash = hashPassword(password);
  const roomName = pwd[hash];
  if (roomName) {
    log(ip, "INFO", "/check", `Validated visit to room ${roomName} from ip ${ip}, user name: ${userName}`);
    return res.status(200).json({ roomName: roomName });
  } else {
    log(ip, "WARN", "/check", `Invalid visit from ip ${ip}, user name: ${userName}`);
    return res.status(401).json({ message: "Invalid password" });
  }
});

// POST /wakeup to wake the server and log visit info
app.post("/wakeup", (req, res) => {
  const { user_name, room } = req.body;
  log(req.ip, "INFO", "/wakeup", `User log in, user name: ${user_name}, room: ${room}`);
  res.end("ok");
});

// Start server
const port = 9000;
app.listen(port, () => {
  console.log(`Server FC listening on port ${port}`);
});
