// All API calls go to /api/* — nginx (see nginx.conf) reverse-proxies
// that path to the backend Service inside the cluster, so the browser
// never needs to know the backend's internal address.
const API_BASE = "/api";

const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const apiStatus = document.getElementById("apiStatus");
const podHost = document.getElementById("podHost");

function setApiStatus(state) {
  apiStatus.className = "status-pill status-pill--" + state;
  apiStatus.textContent = state === "ok" ? "connected" : state === "down" ? "unreachable" : "checking";
}

function showError(message) {
  errorState.hidden = !message;
  errorState.textContent = message || "";
}

function renderTasks(tasks) {
  taskList.innerHTML = "";
  emptyState.hidden = tasks.length > 0;

  tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task";

    const light = document.createElement("span");
    light.className = "task__light " + (task.done ? "task__light--done" : "task__light--pending");
    light.title = task.done ? "Mark as pending" : "Mark as done";
    light.addEventListener("click", () => toggleTask(task.id));

    const title = document.createElement("span");
    title.className = "task__title" + (task.done ? " task__title--done" : "");
    title.textContent = task.title;
    title.addEventListener("click", () => toggleTask(task.id));

    const remove = document.createElement("button");
    remove.className = "task__remove";
    remove.textContent = "✕";
    remove.setAttribute("aria-label", "Delete task: " + task.title);
    remove.addEventListener("click", () => deleteTask(task.id));

    li.append(light, title, remove);
    taskList.appendChild(li);
  });
}

async function loadTasks() {
  try {
    const res = await fetch(`${API_BASE}/tasks`);
    if (!res.ok) throw new Error("Bad response from API");
    const tasks = await res.json();
    setApiStatus("ok");
    showError(null);
    renderTasks(tasks);
  } catch (err) {
    setApiStatus("down");
    showError("Could not reach the backend API. Check that the backend pods and Service are running.");
  }
}

async function addTask(title) {
  try {
    const res = await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error("Could not add task");
    await loadTasks();
  } catch (err) {
    showError(err.message);
  }
}

async function toggleTask(id) {
  try {
    const res = await fetch(`${API_BASE}/tasks/${id}`, { method: "PATCH" });
    if (!res.ok) throw new Error("Could not update task");
    await loadTasks();
  } catch (err) {
    showError(err.message);
  }
}

async function deleteTask(id) {
  try {
    const res = await fetch(`${API_BASE}/tasks/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) throw new Error("Could not delete task");
    await loadTasks();
  } catch (err) {
    showError(err.message);
  }
}

taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = taskInput.value.trim();
  if (!title) return;
  taskInput.value = "";
  addTask(title);
});

// A little cosmetic detail: show the pod hostname if the API ever
// echoes it back (kept generic here since HOSTNAME isn't exposed by
// this simple backend, but this is where you'd wire that up).
podHost.textContent = "frontend-pod";

loadTasks();
setInterval(loadTasks, 10000); // keep the board fresh
