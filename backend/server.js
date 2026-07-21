/**
 * Simple Task Manager API
 * Endpoints:
 *   GET    /api/health        -> health check (used by k8s probes)
 *   GET    /api/tasks         -> list all tasks
 *   POST   /api/tasks         -> create a task { title }
 *   PATCH  /api/tasks/:id     -> toggle done state
 *   DELETE /api/tasks/:id     -> remove a task
 */

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// In-memory store (fine for a demo; swap for a real DB in production)
let tasks = [
  { id: 1, title: "Set up EKS cluster", done: true },
  { id: 2, title: "Write Jenkins pipeline", done: false },
  { id: 3, title: "Deploy to Kubernetes", done: false },
];
let nextId = 4;

// Health check - Kubernetes liveness/readiness probes hit this
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// List tasks
app.get("/api/tasks", (req, res) => {
  res.json(tasks);
});

// Create task
app.post("/api/tasks", (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: "Task title is required" });
  }
  const task = { id: nextId++, title: title.trim(), done: false };
  tasks.push(task);
  res.status(201).json(task);
});

// Toggle done state
app.patch("/api/tasks/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const task = tasks.find((t) => t.id === id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.done = !task.done;
  res.json(task);
});

// Delete task
app.delete("/api/tasks/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const before = tasks.length;
  tasks = tasks.filter((t) => t.id !== id);
  if (tasks.length === before) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log(`Backend API listening on port ${PORT}`);
});
