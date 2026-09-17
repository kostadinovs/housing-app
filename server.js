const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.sqlite");
const DELETE_PASSWORD = process.env.DELETE_PASSWORD || "1234";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    desc TEXT NOT NULL,
    pri TEXT NOT NULL,
    loc TEXT,
    date TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    doneDate TEXT,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    issueId TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    date TEXT NOT NULL
  );
`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function withComments(issue) {
  const comments = db
    .prepare("SELECT text, date FROM comments WHERE issueId = ? ORDER BY rowid ASC")
    .all(issue.id);
  return { ...issue, done: !!issue.done, comments };
}

// GET all issues
app.get("/api/issues", (req, res) => {
  const rows = db.prepare("SELECT * FROM issues ORDER BY createdAt DESC").all();
  res.json(rows.map(withComments));
});

// CREATE issue
app.post("/api/issues", (req, res) => {
  const { id, desc, pri, loc, date } = req.body || {};
  if (!id || !desc || !pri) return res.status(400).json({ error: "desc и pri се задолжителни" });
  db.prepare(
    "INSERT INTO issues (id, desc, pri, loc, date, done, doneDate) VALUES (?, ?, ?, ?, ?, 0, NULL)"
  ).run(id, desc, pri, loc || "", date || "");
  const row = db.prepare("SELECT * FROM issues WHERE id = ?").get(id);
  res.status(201).json(withComments(row));
});

// UPDATE issue (desc/pri/loc/date/done/doneDate)
app.put("/api/issues/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "не постои" });
  const next = {
    desc: req.body.desc ?? existing.desc,
    pri: req.body.pri ?? existing.pri,
    loc: req.body.loc ?? existing.loc,
    date: req.body.date ?? existing.date,
    done: req.body.done !== undefined ? (req.body.done ? 1 : 0) : existing.done,
    doneDate: req.body.doneDate !== undefined ? req.body.doneDate : existing.doneDate,
  };
  db.prepare(
    "UPDATE issues SET desc=?, pri=?, loc=?, date=?, done=?, doneDate=? WHERE id=?"
  ).run(next.desc, next.pri, next.loc, next.date, next.done, next.doneDate, req.params.id);
  const row = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  res.json(withComments(row));
});

// DELETE issue (password required)
app.delete("/api/issues/:id", (req, res) => {
  const pass = (req.body && req.body.password) || req.get("x-delete-password") || "";
  if (pass !== DELETE_PASSWORD) return res.status(401).json({ error: "погрешна лозинка" });
  db.prepare("DELETE FROM issues WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ADD comment
app.post("/api/issues/:id/comments", (req, res) => {
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  if (!issue) return res.status(404).json({ error: "не постои" });
  const text = (req.body && req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "празен коментар" });
  const date = new Date().toISOString().slice(0, 10);
  const cid = "c" + Date.now() + Math.floor(Math.random() * 1000);
  db.prepare("INSERT INTO comments (id, issueId, text, date) VALUES (?, ?, ?, ?)").run(
    cid, req.params.id, text, date
  );
  const row = db.prepare("SELECT * FROM issues WHERE id = ?").get(req.params.id);
  res.status(201).json(withComments(row));
});

app.listen(PORT, () => console.log(`Серверот работи на порта ${PORT}`));
