// Variables
let timer = null;
let timeRemaining = 25 * 60; // Default 25 minutes in seconds
let isPaused = false;
let totalFocusTime = 0;
let focusTime = 25 * 60; // Default focus time
let breakTime = 5 * 60; // Default break time
let isBreak = false;
let lastFocusUpdate = 0;
let focusChart = null;
let sessionXpAwarded = false;
let totalTasksCompleted = 0;
let streakDays = 0;
let focusSecondCounter = 0;
let appSecondCounter = 0;
let userLevel = 1;
let userExp = 0;
let pendingDeleteFolderId = null;
let lastTrackedApp = null;
let weeklyAppUsageChart = null;
let currentUsageType = 'daily';
let appUsageCounter = 0;
let appUsageData = {};
let openFolderIds = new Set(); // To track open folders
let currentUserId = parseInt(localStorage.getItem('userId')) || 0;
const iconMapping = JSON.parse(localStorage.getItem('appIcons') || '{}');

const excludedApps = [
  "Windows Shell Experience Host",
  "SearchHost",
  "Electron",
  "RuntimeBroker",
  "Application Frame Host",
  "LockApp",
  "ShellHost",
  "Windows Start Experience Host",
  "Windows Explorer",
  "SearchHost",
].map(app => app.toLowerCase());

let weeklyFocusData = {
  0: 0, // Sunday
  1: 0, // Monday
  2: 0, // Tuesday
  3: 0, // Wednesday
  4: 0, // Thursday
  5: 0, // Friday
  6: 0  // Saturday
};

// DaisyUI themes + required level to unlock them
const themes = [
  { name: 'dark', level: 1 },
  { name: 'light', level: 2 },
  { name: 'cupcake', level: 3 },
  { name: 'synthwave', level: 4 },
  { name: 'bumblebee', level: 5 },
  { name: 'emerald', level: 6 },
  { name: 'corporate', level: 7 },
  { name: 'retro', level: 8 },
  { name: 'cyberpunk', level: 9 },
  { name: 'valentine', level: 10 },
  { name: 'halloween', level: 11 },
  { name: 'garden', level: 12 },
  { name: 'forest', level: 13 },
  { name: 'wireframe', level: 14 }
];

/*
--------------------------
SETUP AND INITIALISATION SECTION 
--------------------------
*/

// Loads the app data from the database and renders the UI
async function loadAllData() {
  await loadFoldersAndTasks();
  await flushUnsavedAppUsageToDatabase(true);
  await loadAppUsageFromDatabase();

  renderDeadlines();
  await renderLeaderboard();
  await renderFocusChart();

  updateProfileUI();
  updateRewardsUI();
  updateChart();

  await renderDistractingApps();
  await trackApplicationUsage();
}

/* CUSTOM TITLE BAR AND SETUP */
document.addEventListener('DOMContentLoaded', async () => {
  // Custom window controls
  const { minimise, maximise, close, toggleMax } = window.globalDataAPI;
  document.getElementById('min-btn').addEventListener('click', minimise);
  document.getElementById('max-btn').addEventListener('click', toggleMax);
  document.getElementById('close-btn').addEventListener('click', close);

  // Toggles maximization on double-clicking the title bar
  document.getElementById('titlebar')
    .addEventListener('dblclick', toggleMax);

  if (!currentUserId) {
    console.warn("No currentUserId found");
    return;
  }

  // Loads user theme from localStorage if available (goes to dark mode by default)
  const themesByUser = JSON.parse(localStorage.getItem('userThemes') || '{}');
  const savedTheme = themesByUser[currentUserId];
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  // Gets all the user data 
  try {
    const rawStats = await window.dbAPI.getUserStats(currentUserId);
    const stats = rawStats[0] || rawStats;
    console.log("DB stats:", stats);
    if (stats) {
      userLevel = stats.level;
      userExp = stats.xp;
      totalTasksCompleted = stats.tasks_completed;
      streakDays = stats.streak_days;
      updateLevelUI();
      updateProfileUI();
    }
  } catch (err) {
    console.error("Failed to load user stats:", err);
  }
  await loadAllData();
  // Sets up the event listener for the popup when deleting folders
  document.getElementById('confirm-delete').addEventListener('click', async () => {

    document.getElementById('delete-modal').checked = false;

    if (pendingDeleteFolderId != null) {
      const res = await window.dbAPI.deleteFolder(pendingDeleteFolderId);
      if (res.success) {
        await loadAllData();
        showAlert('Folder deleted', 'success');
      } else {
        showAlert('Failed to delete folder', 'error');
      }
      pendingDeleteFolderId = null;
    }
  });
});

// Handles navigation between the different sections & updates folder UI
document.addEventListener('DOMContentLoaded', () => {
  // Handles the navigation between sections
  const dockButtons = document.querySelectorAll('.dock button');
  const sections = {
    home: document.getElementById('home-section'),
    leaderboard: document.getElementById('leaderboard-section'),
    settings: document.getElementById('settings-section'),
  };

  dockButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggles active class for selected button
      dockButtons.forEach(b => b.classList.remove('dock-active'));
      btn.classList.add('dock-active');

      // Hides all sections
      Object.values(sections).forEach(s => s.classList.add('hidden'));

      // Shows only the selected section
      const target = btn.dataset.target;
      sections[target.replace('-section', '')].classList.remove('hidden');
    });
  });
  updateRewardsUI();
  updateProfileUI();

  const leftColumn = document.getElementById('left-column');
  const folderWrapper = document.getElementById('folder-wrapper');
  document.getElementById('add-folder-btn').onclick = onAddFolder;
  document.getElementById('distracting-app-add-btn').onclick = onAddDistractingApp;
  if (!leftColumn || !folderWrapper) return;

  // Handles the folder height adjustment
  function setFolderHeight() {
    folderWrapper.style.height = leftColumn.offsetHeight + 'px';
  }

  // Throttle with requestAnimationFrame to avoid excessive calls  
  let rafId = null;
  function scheduleHeightUpdate() {
    if (rafId == null) {
      rafId = requestAnimationFrame(() => {
        setFolderHeight();
        rafId = null;               // resets flag after running
      });
    }
  }

  // Using a ResizeObserver to update folder-wrapper height when leftColumn changes size (weekly focused chart updates initially)
  if (window.ResizeObserver) {
    new ResizeObserver(scheduleHeightUpdate).observe(leftColumn);
  }

  // Reacts when the whole window resizes
  window.addEventListener('resize', scheduleHeightUpdate);
  setFolderHeight();
  renderFocusChart();
});

// Handles the toggle between daily and weekly app usage charts
document.getElementById('usageToggle').addEventListener('click', async (e) => {
  const btn = e.target;
  const type = btn.dataset.type;
  if (!type) return;
  currentUsageType = type;
  // Toggles active button styles
  Array.from(btn.parentElement.children).forEach(b => {
    b.classList.toggle('btn-active', b === btn);
  });

  // Shows or hides the correct chart
  document.getElementById('dailyChartContainer')
    .classList.toggle('hidden', type !== 'daily');
  document.getElementById('weeklyChartContainer')
    .classList.toggle('hidden', type !== 'weekly');

  // Updates the title based on what chart is selected
  const titleEl = document.getElementById('app-usage-title');
  titleEl.textContent = type === 'daily'
    ? 'Daily Application Usage'
    : 'Weekly Application Usage';

  // Updates the app usage list based on the chart type
  const listEl = document.getElementById('app-usage-list');
  if (type === 'daily') {
    await loadAppUsageFromDatabase();
  } else {
    await flushUnsavedAppUsageToDatabase(true);
    const rows = await window.dbAPI.getWeeklyAppUsage(currentUserId);
    if (document.getElementById('weeklyAppUsageChart')) {
      await renderWeeklyAppUsageChart();
    }
    const data = rows
      .map(r => {
        const secs = r.total_seconds != null
          ? parseInt(r.total_seconds, 10)
          : (parseFloat(r.total_minutes) || 0) * 60;
        const appName = formatAppName(r.app_name);
        const icon = iconMapping[appName] ?? null;
        return { app: appName, secs, icon };
      })
      .filter(d => !excludedApps.includes(d.app.toLowerCase()))
      .sort((a, b) => b.secs - a.secs)

    listEl.innerHTML = data.map(d => `
      <li class="flex justify-between w-72 items-center py-2 border-b last:border-b-0">
        <div class="flex items-center gap-2">
          ${d.icon
        ? `<img src="${d.icon}" class="w-6 h-6 object-contain" onerror="this.style.display='none'">`
        : ''
      }
          <span class="font-semibold">${d.app}</span>
        </div>
        <span class="text-sm text-gray-400">${formatTime(d.secs)}</span>
      </li>
    `).join('');
  }
});


// Shows “No data available” when there's nothing to plot
const noDataPlugin = {
  id: 'noData',
  beforeUpdate(chart) {
    const hasData = chart.data.datasets.some(ds =>
      Array.isArray(ds.data) && ds.data.some(v => v !== 0)
    );
    if (hasData) {
      if (chart.options.scales.y) chart.options.scales.y.display = true;
      if (chart.options.scales.x) chart.options.scales.x.display = true;
      return;
    }

    // Hide axes if no data
    if (chart.options.scales.y) {
      chart.options.scales.y.display = false;
      if (chart.options.scales.x) {
        chart.options.scales.x.display = false;
        chart.options.scales.x.grid = { display: false };
      }
    }

  },
  afterDraw(chart) {
    const { ctx, data, chartArea: { left, top, width, height } } = chart;
    const hasData = data.datasets.some(ds => ds.data.some(v => v !== 0));
    if (hasData) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px sans-serif';
    ctx.fillText('No data available', left + width / 2, top + height / 2);
    ctx.restore();
  }
};

Chart.register(noDataPlugin);

/* NOTIFICATION ALERT FUNCTION  */
function showAlert(message, type = 'info', duration = 3000) {
  const container = document.getElementById('alert-container');
  if (!container) return;

  const MAX_ALERTS = 5;
  // If already at max, removes the oldest notif
  if (container.childElementCount >= MAX_ALERTS) {
    container.removeChild(container.firstChild);
  }

  // Icons for each alert type
  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 14L14 10M10 10l4 4"/><circle cx="12" cy="12" r="9"/>
                </svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 3a9 9 0 100 18 9 9 0 000-18z"/>
                </svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m0-4h.01"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 2a10 10 0 11-10 10A10 10 0 0112 2z"/>
                </svg>`
  };

  // Colors for each alert type
  let bgClass;
  switch (type) {
    case 'error':
      bgClass = 'bg-red-500';
      break;
    case 'warning':
      bgClass = 'bg-yellow-500';
      break;
    case 'success':
      bgClass = 'bg-green-500';
      break;
    default:
      bgClass = 'bg-blue-500';
  }

  const alertEl = document.createElement('div');
  alertEl.setAttribute('role', 'alert');
  alertEl.className = [
    'alert',
    bgClass,
    'text-black',
    'shadow-lg',
    'pointer-events-auto'
  ].join(' ');

  alertEl.innerHTML = `
      <div class="flex items-center space-x-2">
        ${icons[type] || icons.info}
        <span>${message}</span>
      </div>
    `;

  container.appendChild(alertEl);
  setTimeout(() => alertEl.remove(), duration);
}

/*
--------------------------
FOLDER AND TASK MANAGEMENT SECTION 
--------------------------
*/

// Adds task to the selected folder 
async function addTask(folderId) {
  const titleInput = document.getElementById(`task-input-${folderId}`);
  const dueInput = document.getElementById(`due-input-${folderId}`);
  const priorityInput = document.getElementById(`priority-input-${folderId}`);
  const statusInput = document.getElementById(`status-input-${folderId}`);
  if (!titleInput || !dueInput) return;

  const title = titleInput.value.trim();
  const due_date = dueInput.value;
  const priority = priorityInput.value;
  const status = statusInput.value;

  if (!title && !due_date) {
    return showAlert('Task must have a title and due date', 'error');
  }
  else if (!title) {
    return showAlert('Task must have a title', 'error');
  }
  else if (!due_date) {
    return showAlert('Task must have a due date', 'error');
  }
   // Prevents past due dates from being added
   const today = new Date().toISOString().split('T')[0];
   if (due_date < today) {
     return showAlert('Due date cannot be in the past', 'error');
   }
 
   // Prevents duplicate task names
   const tasks = await window.dbAPI.getTasks(currentUserId);
   const duplicate = tasks.some(t =>
     t.folder_id === folderId &&
     t.title.trim().toLowerCase() === title.toLowerCase()
   );
   if (duplicate) {
     return showAlert('Task with the same name already exists in this folder', 'error');
   }

  await window.dbAPI.createTask(folderId, title, due_date, priority, status);

  // Clears input fields after adding the task
  titleInput.value = '';
  dueInput.value = '';
  priorityInput.value = 'medium';
  statusInput.value = 'next';

  showAlert('Task added successfully!', 'success');
  return folderId;
}

// Adds folder to the database
async function onAddFolder() {
  const name = document.getElementById('folder-name').value.trim();
  if (!name) return showAlert('Folder name cannot be empty', 'error');

  // Prevents duplicate folder names
  const folders = await window.dbAPI.getFolders(currentUserId);
  const exists = folders.some(f => f.name.toLowerCase() === name.toLowerCase());
  if (exists) return showAlert('Folder name already exists', 'error');

  await window.dbAPI.createFolder(currentUserId, name);
  nameInput.value = '';
  await loadAllData();
}

// Handles adding a task and refreshing the UI
async function addTaskAndRefresh(folderId) {
  const newFolderId = await addTask(folderId);
  if (newFolderId) {
    const parsedId = parseInt(newFolderId, 10);
    await loadFoldersAndTasks(parsedId);
    console.log("Rendering deadlines...");
    console.log("Folders object:", window.folders);

    const detailElement = document.querySelector(`#folders-container details[data-folder-id="${parsedId}"]`);
    if (detailElement) {
      detailElement.setAttribute('open', '');
    }
    renderDeadlines();
  }
}

// Loads folders and tasks from the database
async function loadFoldersAndTasks(targetFolderId) {
  const folders = await window.dbAPI.getFolders(currentUserId);
  const tasks = await window.dbAPI.getTasks(currentUserId);

  const tasksByFolder = {};
  folders.forEach(f => tasksByFolder[f.id] = []);
  tasks.forEach(t => tasksByFolder[t.folder_id].push(t));

  window.folders = {};
  folders.forEach(folder => {
    window.folders[folder.name] = tasksByFolder[folder.id];
  });

  renderFoldersUI(folders, tasksByFolder, targetFolderId);
}

// Renders the folders UI
function renderFoldersUI(folders, tasksByFolder, targetFolderId) {
  const container = document.getElementById("folders-container");
  const openFolderIds = new Set(JSON.parse(localStorage.getItem('openFolderIds') || '[]'));

  if (targetFolderId) {
    // Only renders the target folder that changed
    const folder = folders.find(f => f.id === targetFolderId);
    if (folder) {
      const { collapseContentHTML } = renderSingleFolder(folder, tasksByFolder, openFolderIds);
      const existingFolder = container.querySelector(`[data-folder-id="${targetFolderId}"]`);
      if (existingFolder) {
        // Updates the existing inner folder content
        const collapseContentElement = existingFolder.querySelector('.collapse-content');
        if (collapseContentElement) {
          collapseContentElement.innerHTML = collapseContentHTML;
        }
      }
      attachEventListeners();
    }
  } else {
    // Renders all folders if no targetFolderId is provided
    if (folders.length === 0) {
      container.innerHTML = `
    <div class="flex justify-center items-center min-h-[6rem] text-sm text-gray-500 font-medium">
      No folders yet — create one to get started!
    </div>
`;
    } else {
      container.innerHTML = folders.map(folder => renderSingleFolder(folder, tasksByFolder, openFolderIds).folderHTML).join("");
    }
    attachEventListeners();
  }
}

// Attaches event listeners to the folder details and task buttons
function attachEventListeners() {
  document.querySelectorAll('#folders-container details').forEach(detail => {
    detail.addEventListener('toggle', () => {
      const folderId = detail.dataset.folderId;
      const openIds = new Set(
        JSON.parse(localStorage.getItem('openFolderIds') || '[]')
      );
      if (detail.open) openIds.add(folderId);
      else openIds.delete(folderId);
      localStorage.setItem(
        'openFolderIds',
        JSON.stringify(Array.from(openIds))
      );
    });
  });

  // Wires up the task buttons to toggle completion
  document.querySelectorAll('.task-btn').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const taskId = Number(btn.dataset.taskId);
      toggleTaskCompletion(taskId);
    };
  });
}
document.addEventListener('DOMContentLoaded', attachEventListeners);

// Renders a single folder with its tasks and add-task form
function renderSingleFolder(folder, tasksByFolder, openFolderIds) {
  const formattedFolderName = folder.name.charAt(0).toUpperCase() + folder.name.slice(1).toLowerCase();
  const tasks = tasksByFolder[folder.id] || [];
  const isOpen = openFolderIds.has(String(folder.id)) ? 'open' : '';

  // Inner content (existing tasks + add-task form)
  const collapseContentHTML = `
    ${renderTaskList(tasks)}
    <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
      <div class="flex flex-col">
        <label class="label mb-1"><span class="label-text">Task</span></label>
        <input type="text" id="task-input-${folder.id}"
               class="input input-sm input-bordered w-full"
               placeholder="New Task">
      </div>
      <div class="flex flex-col">
        <label class="label mb-1"><span class="label-text">Date</span></label>
        <input type="date" id="due-input-${folder.id}"
       class="input input-sm input-bordered w-full"
       min="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="flex flex-col">
        <label class="label mb-1"><span class="label-text">Priority</span></label>
        <select id="priority-input-${folder.id}"
                class="select select-sm select-bordered w-full">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div class="flex flex-col">
        <label class="label mb-1"><span class="label-text">Status</span></label>
        <select id="status-input-${folder.id}"
                class="select select-sm select-bordered w-full">
          <option value="next">Next To Do</option>
          <option value="in-progress">In Progress</option>
          <option value="later">Later</option>
        </select>
      </div>
      <div class="flex flex-col justify-end">
        <button onclick="addTaskAndRefresh(${folder.id})"
                class="btn btn-sm btn-neutral w-full">
          Add
        </button>
      </div>
    </div>
  `;

  // Summary header for the folder
  const folderHTML = `
    <details class="collapse bg-base-100 rounded-lg shadow-md p-3 ${isOpen}"
             data-folder-id="${folder.id}">
      <summary class="collapse-title relative flex justify-center items-center">
        <div class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg"
               class="w-5 h-5"
               fill="none"
               viewBox="0 0 24 24"
               stroke="currentColor">
            <path stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 7h18M3 7l2-2h5l2 2h8M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10H5z"/>
          </svg>
          <span class="font-semibold folder-name"
                ondblclick="editFolderName(${folder.id}, this)">
            ${formattedFolderName}
          </span>
        </div>
        <button class="btn btn-xs btn-error absolute top-2 right-2"
                onclick="deleteFolder(${folder.id})"
                title="Delete folder" aria-label="Delete folder">
          <svg xmlns="http://www.w3.org/2000/svg"
               class="w-4 h-4"
               fill="none"
               viewBox="0 0 24 24"
               stroke="currentColor">
            <path stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </summary>
      <div class="collapse-content mt-2">
        ${collapseContentHTML}
      </div>
    </details>
  `;
  return { folderHTML, collapseContentHTML };
}

// Puts the selected folder in pendingDelete and opens the modal for confirmation
function deleteFolder(folderId) {
  pendingDeleteFolderId = folderId;
  document.getElementById('delete-modal').checked = true;
}

// Edits the folder name on double-click
async function editFolderName(folderId, spanEl) {
  const oldName = spanEl.textContent.trim();
  spanEl.contentEditable = 'true';
  spanEl.classList.add('input', 'input-sm', 'input-bordered');
  spanEl.focus();

  // Selects all text
  const range = document.createRange();
  range.selectNodeContents(spanEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  function finish(save) {
    spanEl.removeAttribute('contentEditable');
    spanEl.classList.remove('input', 'input-sm', 'input-bordered');
    spanEl.removeEventListener('blur', onBlur);
    spanEl.removeEventListener('keydown', onKeydown);

    let newName = spanEl.textContent.trim() || oldName;
    // Applies capitalization after edit so folder names always start with a capital letter
    const formatted = newName.charAt(0).toUpperCase() + newName.slice(1).toLowerCase();
    spanEl.textContent = formatted;

    // Updates the folder name in the UI
    if (save && formatted !== oldName) {
      window.dbAPI.updateFolder(folderId, formatted)
        .then(res => {
          if (res.success) showAlert('Folder renamed', 'success');
          else showAlert('Rename failed', 'error');
        });
    }
  }

  function onBlur() { finish(true); }
  function onKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      spanEl.blur();
    }
    if (e.key === 'Escape') {
      spanEl.textContent = oldName;
      spanEl.blur();
    }
  }

  spanEl.addEventListener('blur', onBlur);
  spanEl.addEventListener('keydown', onKeydown);
}

// Renders the task list
function renderTaskList(tasks) {
  // Gets the correct ordinal suffix for the day of the month
  const ordinal = d => {
    const j = d % 10, k = d % 100;
    if (j === 1 && k !== 11) return d + 'st';
    if (j === 2 && k !== 12) return d + 'nd';
    if (j === 3 && k !== 13) return d + 'rd';
    return d + 'th';
  };

  // Formats date to "DD/MM/YY (Weekday Dth Month)"
  const fmt = iso => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
    const dayOrd = ordinal(d.getDate());
    const monthName = d.toLocaleDateString(undefined, { month: 'long' });
    return `${dd}/${mm}/${yy} (${weekday} ${dayOrd} ${monthName})`;
  };

  // Returns the HTML for the task list
  return `
    <ul class="space-y-2">
      ${tasks.map(task => {
    const pending = removalTimers[task.id] !== undefined;
    const btnClass = pending
      ? 'btn-warning'
      : (task.completed ? 'btn-warning' : 'btn-success');
    const btnText = pending
      ? 'Undo'
      : (task.completed ? 'Undo' : 'Complete');
    const liStyle = pending
      ? 'transition:opacity 3s linear; opacity:0;'
      : '';

    return `
        <li class="bg-base-300 p-3 rounded-lg shadow-sm" style="${liStyle}">
          <div class="flex justify-between items-center">
            <span class="${task.completed || pending ? 'line-through text-gray-400' : 'font-semibold'}">
              ${task.title}
            </span>
            <button
              class="btn btn-xs ${btnClass} task-btn"
              data-task-id="${task.id}">
              ${btnText}
            </button>
          </div>
          <div class="mt-1 text-xs text-gray-400 flex flex-wrap gap-2">
            <span>Due: ${fmt(task.due_date)}</span>
            <span>Priority: ${task.priority}</span>
            <span>Status: ${task.status.replace('-', ' ')}</span>
          </div>
        </li>
        `;
  }).join('')}
    </ul>
  `;
}

// Renders the deadlines section and sorts tasks by due date and priority
function renderDeadlines() {
  const all = [];
  const weight = { high: 0, medium: 1, low: 2 };

  Object.entries(window.folders).forEach(([folder, tasks]) => {
    tasks.forEach(t => {
      if (!t.completed) {
        const due = new Date(t.due_date);
        const now = new Date();
        const rawDiff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
        const diff = Math.abs(rawDiff);
        const wks = Math.floor(diff / 7), dys = diff % 7;
        const display = due.toLocaleDateString(undefined, {
          weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
        });

        all.push({
          folder,
          title: t.title,
          dueDisplay: display,
          timeLeft: `${wks} week${wks !== 1 ? 's' : ''} & ${dys} day${dys !== 1 ? 's' : ''}`,
          diffDays: rawDiff,
          priority: t.priority,
          status: t.status
        });
      }
    });
  });

  all.sort((a, b) => a.diffDays - b.diffDays || weight[a.priority] - weight[b.priority]);

  const ul = document.getElementById('deadlines-list');

  ul.style.display = 'flex';
  ul.style.flexWrap = 'nowrap';
  ul.style.overflowX = 'auto';
  ul.style.width = '100%';
  ul.style.maxWidth = '100%';
  ul.style.padding = '0.5rem 0';
  ul.style.gap = '1rem';

  if (all.length === 0) {
    ul.innerHTML = `
    <li class="w-full flex justify-center items-center min-h-[4rem] text-sm text-gray-500 font-medium">
      No upcoming tasks with deadlines
    </li>`;
    return;
  }

  ul.innerHTML = all.map(t => `
    <li class="min-w-[16rem] card card-compact bg-base-200 shadow-md">
      <div class="card-body p-4">
        <h3 class="card-title">${t.title}</h3>
        <p class="text-xs"><strong>Folder:</strong> ${t.folder}</p>
        <p class="text-xs"><strong>Due:</strong> ${t.dueDisplay}</p>
        <p class="text-xs"><strong>Left:</strong> ${t.timeLeft}</p>
        <p class="text-xs">
          <strong>Priority:</strong> 
          <span class="badge badge-outline">${t.priority}</span>
        </p>
        <p class="text-xs"><strong>Status:</strong> ${t.status.replace('-', ' ')}</p>
      </div>
    </li>
  `).join('');

  // Drag‑to‑scroll functionality
  let isDown = false, startX, scrollLeft;
  ul.addEventListener('mousedown', e => {
    isDown = true;
    startX = e.pageX - ul.getBoundingClientRect().left;
    scrollLeft = ul.scrollLeft;
    ul.style.cursor = 'grabbing';
  });
  ul.addEventListener('mouseleave', () => {
    isDown = false;
    ul.style.cursor = 'default';
  });
  ul.addEventListener('mouseup', () => {
    isDown = false;
    ul.style.cursor = 'default';
  });
  ul.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - ul.getBoundingClientRect().left;
    const walk = (x - startX) * 1.5;
    ul.scrollLeft = scrollLeft - walk;
  });
}

/*
--------------------------
WEEKLY FOCUS CHART SECTION 
--------------------------
*/

// Renders the weekly focus chart 
async function renderFocusChart() {
  const data = await window.dbAPI.getFocusSessions(currentUserId);

  // Resets weeklyFocusData
  weeklyFocusData = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  // Groups focus time by weekday
  for (const entry of data) {
    const weekday = new Date(entry.session_date).getDay();
    weeklyFocusData[weekday] = entry.minutes * 60;
  }

  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const values = labels.map((_, i) => weeklyFocusData[(i + 1) % 7] || 0);

  const maxSec = Math.max(...values, 10);
  const step = maxSec < 60 ? 10 : maxSec < 3600 ? 60 : 600;
  const chartMax = step * Math.ceil(maxSec / step);

  const fmt = v => {
    if (v < 60) return `${v}s`;
    if (v < 3600) {
      const m = Math.floor(v / 60), s = v % 60;
      return s ? `${m}m ${s}s` : `${m}m`;
    }
    const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  const ctx = document.getElementById('focusChart').getContext('2d');
  if (focusChart) focusChart.destroy();

  focusChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Focused Time',
        data: values,
        backgroundColor: 'rgba(0,102,255,0.8)',
        borderColor: 'rgba(0,85,204,1)',
        borderWidth: 1,
        borderRadius: 10,
        barThickness: 40
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          max: chartMax,
          ticks: {
            stepSize: step,
            callback: fmt
          },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 14, weight: 'bold', family: 'Inter, sans-serif' },
            color: '#A0AEC0'
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => fmt(ctx.parsed.y)
          }
        }
      }
    }
  });
}

/*
--------------------------
DISTRACTING APPS SECTION 
--------------------------
*/

// Renders the distracing apps list 
async function renderDistractingApps() {
  const items = await window.dbAPI.getDistractingApps(currentUserId);
  const ul = document.getElementById('distracting-app-list');
  ul.innerHTML = items.map(i => {
    // Capitalizes first letter for display
    const displayName = i.app_name.charAt(0).toUpperCase() + i.app_name.slice(1);
    return `
      <li class="flex justify-between items-center bg-base-200 rounded px-4 py-2 shadow-sm mb-2">
        <span class="font-medium">${displayName}</span>
        <button data-app="${i.app_name}" class="btn btn-xs btn-error del-app">Remove</button>
      </li>
    `;
  }).join('');
  document.querySelectorAll('.del-app').forEach(btn => {
    btn.onclick = async () => {
      await window.dbAPI.removeDistractingApp(currentUserId, btn.dataset.app);
      showAlert('Distracting app removed successfully!', 'success');
      await renderDistractingApps();
    };
  });
}

// Adds a distracting app to the list
async function onAddDistractingApp() {
  const txt = document.getElementById('distracting-app-input');
  const app = txt.value.trim();
  if (!app) return;

  // Prevents duplicate apps being added
  const existing = await window.dbAPI.getDistractingApps(currentUserId);
  if (existing.some(i => i.app_name.toLowerCase() === app.toLowerCase())) {
    showAlert('App already in the distracting list', 'error');
    return;
  }

  await window.dbAPI.addDistractingApp(currentUserId, app);
  txt.value = '';
  showAlert('Distracting app added successfully!', 'success');
  await renderDistractingApps();
}

/*
--------------------------
FOCUS TIMER SECTION
-------------------------- 
*/

// Updates the timer display 
function updateTimerDisplay() {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timerDisplay = document.getElementById("timer-display");
  timerDisplay.innerText = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  updateCircleProgress();
  updateFocusTimeDisplay(); // Updates focus time continuously
  window.rendererAPI.sendTimerUpdate(timeRemaining, isBreak);
}

// Function to start the timer
async function startTimer() {
  if (timer) return;  // Prevents starting a new timer if already running

  isPaused = false;
  window.rendererAPI.setFocusState(true);
  focusTime = parseInt(document.getElementById("focus-input").value) * 60;
  breakTime = parseInt(document.getElementById("break-input").value) * 60;

  const initialTime = isBreak ? breakTime : focusTime;
  if (timeRemaining <= 0) timeRemaining = initialTime;

  timer = setInterval(async () => {
    if (!isPaused) {
      timeRemaining--;
      updateTimerDisplay(timeRemaining);
      window.rendererAPI?.sendTimerUpdate?.(timeRemaining, isBreak);

      if (!isBreak) {
        totalFocusTime++;
        focusSecondCounter++;

        const now = new Date();
        const weekday = now.getDay();
        weeklyFocusData[weekday] += 1;

        if (focusChart) {
          const index = (weekday + 6) % 7;
          focusChart.data.datasets[0].data[index] = weeklyFocusData[weekday];

          const values = focusChart.data.datasets[0].data;
          const maxSec = Math.max(...values, 10);
          const step = maxSec < 60 ? 10 : maxSec < 3600 ? 60 : 600;
          const chartMax = step * Math.ceil(maxSec / step);

          focusChart.options.scales.y.max = chartMax;
          focusChart.options.scales.y.ticks.stepSize = step;

          focusChart.update({
            duration: 300,
            easing: 'easeOutQuart',
          });
        }

        if (focusSecondCounter >= 60) {
          await window.dbAPI.addFocusTime(currentUserId, 60);
          focusSecondCounter = 0;
        }
      }

      if (timeRemaining <= 0) {
        clearInterval(timer);
        timer = null;
        timeRemaining = isBreak ? focusTime : breakTime;
        isBreak = !isBreak;

        if (!isBreak && !sessionXpAwarded) {
          const xpGained = Math.floor(focusTime / 60) * 10;
          await window.dbAPI.addXP(currentUserId, xpGained);
          sessionXpAwarded = true;
        }

        if (isBreak) {
          sessionXpAwarded = false;
        }

        startTimer();
      }
    }
  }, 1000);
}

// Function to pause the timer 
async function pauseTimer() {
  if (timer && !isPaused) {
    clearInterval(timer);
    timer = null;
    isPaused = true;
    window.rendererAPI.setFocusState(false);

    if (!isBreak && !sessionXpAwarded) {
      const sessionSeconds = focusTime - timeRemaining;
      const xpEarned = Math.floor(sessionSeconds / 60);

      if (xpEarned > 0) {
        // Adds XP to user and updates the database
        await window.dbAPI.addXP(currentUserId, xpEarned);
        awardExp(xpEarned);
        showAlert(`Session paused! You earned ${xpEarned} XP`, "success");
      }

      sessionXpAwarded = true;
    }
  }
}

// Function to reset the timer
function resetTimer() {
  window.rendererAPI.setFocusState(false);
  // Only awards if not yet awarded in this session slice
  if (!isBreak && !sessionXpAwarded) {
    const sessionSeconds = focusTime - timeRemaining;
    const xpEarned = Math.floor(sessionSeconds / 60);
    if (xpEarned > 0) {
      awardExp(xpEarned);
      showAlert(`Timer reset! You earned ${xpEarned} XP.`, "success");
    }
    sessionXpAwarded = true;
  }

  // Reset logic
  clearInterval(timer);
  timer = null;
  isPaused = false;
  isBreak = false;

  focusTime = parseInt(document.getElementById("focus-input").value, 10) * 60;
  breakTime = parseInt(document.getElementById("break-input").value, 10) * 60;
  timeRemaining = focusTime;
  totalFocusTime = 0;

  updateTimerDisplay();
  updateFocusTimeDisplay();
  showAlert("Timer has been reset", "info");
}

// Function to update the total focus time display
function updateFocusTimeDisplay() {
  const totalFocusDisplay = document.getElementById("total-focus-time");
  const hours = Math.floor(totalFocusTime / 3600);
  const minutes = Math.floor((totalFocusTime % 3600) / 60);
  totalFocusDisplay.innerText = `Total Focus Time: ${hours}h ${minutes}m`;
}

// Function to update circular progress
function updateCircleProgress() {
  const progressCircle = document.getElementById("progress-circle");
  const radius = progressCircle.r.baseVal.value;
  const circumference = 2 * Math.PI * radius;
  const progress = 1 - (timeRemaining / (isBreak ? breakTime : focusTime)); // Flips progress calculation for clockwise motion
  progressCircle.style.strokeDasharray = `${circumference}`;
  progressCircle.style.strokeDashoffset = `${circumference * progress}`;
  progressCircle.style.transform = "rotate(270deg) scale(1, -1)";
  progressCircle.style.transformOrigin = "center";
  progressCircle.style.stroke = isBreak ? "green" : "blue";
  progressCircle.style.display = "block";
  progressCircle.style.margin = "0 auto";
}

// Attach event listeners to buttons
document.getElementById("start-timer").addEventListener("click", startTimer);
document.getElementById("pause-timer").addEventListener("click", pauseTimer);
document.getElementById("reset-timer").addEventListener("click", resetTimer);

document.getElementById("focus-input").addEventListener("change", () => {
  focusTime = parseInt(document.getElementById("focus-input").value) * 60;
  timeRemaining = focusTime;
  updateTimerDisplay();
});

document.getElementById("break-input").addEventListener("change", () => {
  breakTime = parseInt(document.getElementById("break-input").value) * 60;
});

// Listens for the pause command coming from the overlay window
window.rendererAPI.onPauseCommand(() => {
  pauseTimer();
});

// Initializes the timer display
updateTimerDisplay();
updateFocusTimeDisplay();

/*
--------------------------
APPLICATION TRACKER SECTION
-------------------------- 
*/

let lastActiveApp = null;
let lastActiveTime = Date.now();

// Tracks the active application and updates the app usage data
async function trackApplicationUsage() {
  if (!currentUserId) return;
  const win = await window.appTracker.getActiveApplication();
  if (!win) return;

  const rawName = (win.name && win.name.trim()) ? win.name : win.title;
  if (!rawName) return;
  const appName = formatAppName(rawName);
  if (appName === 'Unknown') return;
  if (excludedApps.includes(appName.toLowerCase())) return;

  if (!appUsageData[appName]) {
    const icon = iconMapping[appName] ?? win.icon;
    iconMapping[appName] = icon;
    localStorage.setItem('appIcons', JSON.stringify(iconMapping));
    appUsageData[appName] = { dbTime: 0, localTime: 0, icon };
  }

  // Increments only the unsaved localTime
  appUsageData[appName].localTime += 1;
 
  // Flushes data every 30s
  appSecondCounter += 1;
  if (appSecondCounter >= 30) {
    await flushUnsavedAppUsageToDatabase();
    appSecondCounter = 0;
  }
  if (currentUsageType === 'weekly') {
    renderWeeklyUsageList();
    renderWeeklyAppUsageChart();
  }
  else {
    renderAppUsage();
    updateChart();
  }
}

// Calls `trackApplicationUsage` every second
setInterval(trackApplicationUsage, 1000);

// Formats the app names 
function formatAppName(appName) {
  if (!appName || !appName.trim()) return "Unknown";
  let formatted = appName.replace(/\.exe$/i, "");
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

// Function to format time in HH:MM:SS
function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Renders the weekly app usage chart
async function renderWeeklyAppUsageChart() {
  if (!currentUserId) return;

  // Formats seconds into readable time (HH:MM:SS)
  const fmt = v => {
    if (v < 60) return `${v}s`;
    if (v < 3600) {
      const m = Math.floor(v / 60), s = v % 60;
      return s ? `${m}m ${s}s` : `${m}m`;
    }
    const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  try {
    const rows = await window.dbAPI.getWeeklyAppUsage(currentUserId);

    const data = rows
  .map(r => {
    const name = formatAppName(r.app_name);
    const dbSecs = r.total_seconds != null
      ? parseInt(r.total_seconds, 10)
      : (parseFloat(r.total_minutes) || 0) * 60;
    const localSecs = appUsageData[name]?.localTime || 0;
    return { app: name, secs: dbSecs + localSecs };
  })
  .filter(d => !excludedApps.includes(d.app.toLowerCase()))    
  .sort((a, b) => b.secs - a.secs)
      .slice(0, 5);
      

    const labels = data.map(d => d.app);
    const values = data.map(d => d.secs);

    const maxSec = Math.max(...values, 1);
    const step = maxSec < 60 ? 10 : maxSec < 3600 ? 60 : 600;
    const chartMax = step * Math.ceil(maxSec / step);

    const ctx = document.getElementById('weeklyAppUsageChart').getContext('2d');
    if (!weeklyAppUsageChart) {
      weeklyAppUsageChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels, datasets: [{
            data: values,
            backgroundColor: 'rgba(0,102,255,0.8)',
            borderColor: 'rgba(0,85,204,1)',
            borderWidth: 1,
            borderRadius: 10,
            barThickness: 100
          }]
        },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          animation: { duration: 500 },
          scales: {
            y: {
              beginAtZero: true,
              max: chartMax,
              ticks: { stepSize: step, callback: fmt },
              grid: { color: 'rgba(255,255,255,0.1)' }
            },
            x: {
              grid: { display: false },
              ticks: {
                font: { size: 14, weight: 'bold', family: 'Inter, sans-serif' },
                color: '#A0AEC0'
              }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => fmt(ctx.parsed.y) } }
          }
        }
      });
    } else {
      weeklyAppUsageChart.data.labels = labels;
      weeklyAppUsageChart.data.datasets[0].data = values;
      weeklyAppUsageChart.options.scales.y.max = chartMax;
      weeklyAppUsageChart.options.scales.y.ticks.stepSize = step;
      weeklyAppUsageChart.update({ duration: 500, easing: 'easeOutQuart' });
    }

  } catch (err) {
    console.error('renderWeeklyAppUsageChart error:', err);
  }
}

// Renders the weekly app usage list
async function renderWeeklyUsageList() {
  const listEl = document.getElementById('app-usage-list');
  if (!listEl) return;

  const rows = await window.dbAPI.getWeeklyAppUsage(currentUserId);
  const data = rows
  .map(r => {
    const appName = formatAppName(r.app_name);
    const dbSecs = r.total_seconds != null
      ? parseInt(r.total_seconds, 10)
      : (parseFloat(r.total_minutes) || 0) * 60;
    const localSecs = appUsageData[appName]?.localTime || 0;
    const icon = iconMapping[appName] ?? null;
    return { app: appName, secs: dbSecs + localSecs, icon };
  })
  .filter(d => !excludedApps.includes(d.app.toLowerCase()))
    .sort((a, b) => b.secs - a.secs);

  listEl.innerHTML = data.map(d => `
    <li class="flex justify-between w-72 items-center py-2 border-b last:border-b-0">
      <div class="flex items-center gap-2">
        ${d.icon
      ? `<img src="${d.icon}" class="w-6 h-6 object-contain" onerror="this.style.display='none'">`
      : ''
    }
        <span class="font-semibold">${d.app}</span>
      </div>
      <span class="text-sm text-gray-400">${formatTime(d.secs)}</span>
    </li>
  `).join('');
}

// Loads app usage data from the database
async function loadAppUsageFromDatabase() {
  if (!currentUserId) return;

  // Keeps any localTime that isnt updated to the DB
  const oldData = appUsageData;
  const fresh = {};


  // Fetches app usage data from the database and merges it with local data
  try {
    const rows = await window.dbAPI.getDailyAppUsage(currentUserId);
    for (const r of rows) {
      const name = formatAppName(r.app_name);
      const seconds = r.total_seconds != null
        ? parseInt(r.total_seconds, 10)
        : (parseFloat(r.total_minutes) || 0) * 60;
      const icon = iconMapping[name] ?? null;
      fresh[name] = { dbTime: seconds, localTime: 0, icon };
    }
    appUsageData = fresh;
    renderAppUsage();
    updateChart();
  } catch (err) {
    console.error('loadAppUsageFromDatabase error:', err);
  }
}

// Flushes unsaved app usage data to the database
async function flushUnsavedAppUsageToDatabase() {
  if (!currentUserId) return;
  const promises = [];

  for (const [app, entry] of Object.entries(appUsageData)) {
    const { localTime } = entry;
    if (localTime > 0) {
      promises.push(
        window.dbAPI.addAppUsage(currentUserId, app, localTime)
      );
      entry.dbTime += localTime;
      entry.localTime = 0;
    }
  }
  if (promises.length === 0) return;

  await Promise.all(promises);
  // Reloads whichever view the user is on
  if (currentUsageType === 'daily') {
    await loadAppUsageFromDatabase();      // Daily list + chart
  } else {
    await renderWeeklyUsageList();         // weekly list 
    await renderWeeklyAppUsageChart();     // weekly chart 
  }
}

setInterval(flushUnsavedAppUsageToDatabase, 30000);
window.addEventListener('beforeunload', flushUnsavedAppUsageToDatabase);

// Function to update the application usage list in the UI
function renderAppUsage() {
  const ul = document.getElementById('app-usage-list');
  if (!ul) return;

  ul.innerHTML = Object.entries(appUsageData)
    .filter(([app]) => !excludedApps.includes(app.toLowerCase()))
    .sort(([, a], [, b]) =>
      (b.dbTime + b.localTime) - (a.dbTime + a.localTime)
    )

    .map(([app, { dbTime, localTime, icon }]) => {
      const totalSec = dbTime + localTime;
      return `
        <li class="flex justify-between w-72 items-center py-2 border-b last:border-b-0">
          <div class="flex items-center gap-2">
            ${icon ? `<img src="${icon}" class="w-6 h-6 object-contain" onerror="this.style.display='none'">` : ''}
            <span class="font-semibold">${app}</span>
          </div>
          <span class="text-sm text-gray-400">${formatTime(totalSec)}</span>
        </li>
      `;
    }).join('');
}

// Graph for time spent on each application
let appUsageChart = null;

// Updates the chart with the latest app usage data
function updateChart() {
  const ctx = document.getElementById('appUsageChart').getContext('2d');

  // Sorts out the top 5 apps by time spent
  const sorted = Object.entries(appUsageData)
    .filter(([app]) => !excludedApps.includes(app.toLowerCase()))   // Filters out the excluded apps
    .sort(([, a], [, b]) => (b.dbTime + b.localTime) - (a.dbTime + a.localTime))
    .slice(0, 5);

  const labels = sorted.map(([app]) => app);
  const values = sorted.map(([, { dbTime, localTime }]) => dbTime + localTime);

  const maxSec = Math.max(...values, 1);
  const step = maxSec < 60 ? 10 : maxSec < 3600 ? 60 : 600;
  const chartMax = step * Math.ceil(maxSec / step);

  const fmt = v => {
    const hrs = Math.floor(v / 3600);
    const mins = Math.floor((v % 3600) / 60);
    const secs = v % 60;
    if (hrs) return `${hrs}h ${mins}m`;
    if (mins) return secs ? `${mins}m ${secs}s` : `${mins}m`;
    return `${secs}s`;
  };

  if (!appUsageChart) {
    appUsageChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'App Usage',
          data: values,
          backgroundColor: 'rgba(0,102,255,0.8)',
          borderColor: 'rgba(0,85,204,1)',
          borderWidth: 1,
          borderRadius: 10,
          barThickness: 100
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: { duration: 500 },
        scales: {
          y: {
            beginAtZero: true,
            max: chartMax,
            ticks: {
              stepSize: step,
              callback: fmt
            },
            grid: { color: 'rgba(255,255,255,0.1)' }
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 14, weight: 'bold', family: 'Inter, sans-serif' },
              color: '#A0AEC0'
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => fmt(ctx.parsed.y)
            }
          }
        }
      }
    });
  } else {
    // Updates existing chart
    appUsageChart.data.labels = labels;
    appUsageChart.data.datasets[0].data = values;
    Object.assign(appUsageChart.options.scales.y, {
      max: chartMax,
      ticks: { stepSize: step, callback: fmt }
    });
    appUsageChart.update({ duration: 500, easing: 'easeOutQuart' });
  }
}

/*
--------------------------
FOLDERS SECTION 
--------------------------
*/
const removalTimers = {};

// Toggles task completion and updates the UI aswell
async function toggleTaskCompletion(taskId) {
  const btn = document.querySelector(`button[data-task-id="${taskId}"]`);
  if (!btn) return;
  const li = btn.closest('li');
  const details = li.closest('details');
  const folderId = details.dataset.folderId;
  const folderIdNum = parseInt(folderId, 10);
  const isUndo = btn.textContent.trim() === 'Undo';

  if (!isUndo) {
    btn.textContent = 'Undo';
    btn.classList.replace('btn-success', 'btn-warning');
    awardExp(20);
    renderDeadlines();
    updateProfileUI();

    // Fades out the task item
    li.style.transition = 'opacity 3s linear';
    li.style.opacity = '0';

    removalTimers[taskId] = setTimeout(async () => {
      await window.dbAPI.completeTask(taskId);
      totalTasksCompleted++;
      await loadFoldersAndTasks(folderIdNum);

      // Ensures the folder is open after task completion
      const detailEl = document.querySelector(`details[data-folder-id="${folderId}"]`);
      if (detailEl) detailEl.setAttribute('open', '');

      renderDeadlines();
      updateProfileUI();
    }, 3000);

  } else {
    // Cancels the task completion
    clearTimeout(removalTimers[taskId]);
    delete removalTimers[taskId];

    // Rolls back the text and removes xp
    btn.textContent = 'Complete';
    btn.classList.replace('btn-warning', 'btn-success');
    removeExp(20);

    // Cancels the fade out effect
    li.style.transition = '';
    li.style.opacity = '1';

    renderDeadlines();
    updateProfileUI();
  }
}

/*
--------------------------
EXP SECTION
-------------------------- 
*/
const expThreshold = 100; // EXP needed to level up

// Awards EXP and Handles level Up 
function awardExp(points) {
  userExp += points;
  if (userExp >= expThreshold) {
    userExp -= expThreshold;
    userLevel++;
    showLevelUpAnimation();
  }
  updateLevelUI();
  updateRewardsUI();
  updateProfileUI();
  showExpAnimation(points);
}

// Removes EXP and handles level down
function removeExp(points) {
  userExp -= points;

  // Handles level‑down (if XP goes below 0, drop a level) 
  while (userExp < 0 && userLevel > 1) {
    userLevel--;
    userExp += expThreshold;
  }
  userExp = Math.max(0, userExp);
  showRemoveExpAnimation(points);
  updateProfileUI();
  updateLevelUI();
}

// UI update for circular progress bar
function updateLevelUI() {
  const expProgressCircle = document.getElementById('exp-progress-circle');
  const expProgressLevel = document.getElementById('exp-progress-level');

  if (expProgressCircle && expProgressLevel) {
    const expPercent = Math.round((userExp / expThreshold) * 100);
    expProgressCircle.style.setProperty('--value', expPercent);
    expProgressLevel.innerText = `Level ${userLevel}`;
  }

  const profExp = document.getElementById('profile-exp-progress');
  const xpNext = document.getElementById('xp-to-next');
  const profLevel = document.getElementById('profile-level');

  if (profExp && xpNext && profLevel) {
    profExp.value = userExp;
    profExp.max = expThreshold;
    xpNext.innerText = (expThreshold - userExp) + ' XP to next level';
    profLevel.innerText = userLevel;
  }
}

// Creates level up animation
function showLevelUpAnimation() {
  const el = document.createElement('div');
  el.innerText = 'LEVEL UP!';

  // Random position near center & rotation
  const randomOffsetX = (Math.random() - 0.5) * 150;
  const randomOffsetY = (Math.random() - 0.5) * 75;
  const randomRotation = (Math.random() - 0.5) * 16;

  Object.assign(el.style, {
    position: 'fixed',
    top: `calc(50% + ${randomOffsetY}px)`,
    left: `calc(50% + ${randomOffsetX}px)`,
    transform: `translate(-50%, -50%) rotate(${randomRotation}deg) scale(0)`,
    fontSize: '4rem',
    fontWeight: '900',
    color: '#4ade80',
    textShadow: '0 0 12px rgba(74, 222, 128, 0.9)',
    opacity: '0',
    pointerEvents: 'none',
    zIndex: '999',
  });
  document.body.appendChild(el);
  // Adds confetti animation
  confetti({ particleCount: 60, spread: 80, origin: { x: 0.5, y: 0.4 } });

  // Fades in and out the level up text
  el.animate([
    { transform: `translate(-50%, -50%) rotate(${randomRotation}deg) scale(0)`, opacity: 0 },
    { transform: `translate(-50%, -50%) rotate(${randomRotation}deg) scale(1.4)`, opacity: 1, offset: 0.4 },
    { transform: `translate(-50%, -50%) rotate(${randomRotation}deg) scale(1.1)`, opacity: 1, offset: 0.7 },
    { transform: `translate(-50%, -50%) rotate(${randomRotation}deg) scale(1.1)`, opacity: 0 },
  ], {
    duration: 4000,
    easing: 'cubic-bezier(0.22,1,0.36,1)'
  }).onfinish = () => el.remove();
}

// Creates animation for removing XP
function showRemoveExpAnimation(amount) {
  const el = document.createElement('div');
  el.innerText = `-${amount} XP`;
  const randomOffsetX = (Math.random() - 0.5) * 200;
  const randomOffsetY = (Math.random() - 0.5) * 100;
  Object.assign(el.style, {
    position: 'fixed',
    top: `calc(50% + ${randomOffsetY}px)`,
    left: `calc(50% + ${randomOffsetX}px)`,
    transform: 'translate(-50%, -50%)',
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#f87171',
    textShadow: '0 0 10px rgba(248, 113, 113, 0.7)',
    opacity: '1',
    pointerEvents: 'none',
    zIndex: 998,
  });
  document.body.appendChild(el);
  el.animate([
    { transform: `translate(-50%, -50%)`, opacity: 1 },
    { transform: `translate(-50%, -150%)`, opacity: 0 }
  ], { duration: 1000, easing: 'ease-out' }).onfinish = () => el.remove();
}

// Creates exp animation
function showExpAnimation(amount) {
  const el = document.createElement('div');
  el.innerText = `+${amount} XP!`;

  // Random position near center & rotation
  const randomOffsetX = (Math.random() - 0.5) * 200;
  const randomOffsetY = (Math.random() - 0.5) * 100;
  const randomRotation = (Math.random() - 0.5) * 40;

  Object.assign(el.style, {
    position: 'fixed',
    top: `calc(50% + ${randomOffsetY}px)`,
    left: `calc(50% + ${randomOffsetX}px)`,
    transform: `translate(-50%, -50%) rotate(${randomRotation}deg)`,
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#FFD700',
    textShadow: '0 0 10px rgba(29, 45, 190, 0.7)',
    opacity: '1',
    pointerEvents: 'none',
    zIndex: 998,
  });
  document.body.appendChild(el);

  // Animates the exp text up and then fades it out
  el.animate([
    { transform: `translate(-50%, -50%) rotate(${randomRotation}deg)`, opacity: 1 },
    { transform: `translate(-50%, -150%) rotate(${randomRotation}deg)`, opacity: 0 }
  ], {
    duration: 1000,
    easing: 'ease-out',
  }).onfinish = () => el.remove();
}

/*
-------------------------- 
LEADERBOARD & REWARDS HUB
--------------------------
*/

// Rewards hub setup
function updateRewardsUI() {
  // Lock icon for locked themes
  const LOCK_SVG = `
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-400" fill="none"
           viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 11c-1.657 0-3 1.343-3 3v2a2 2 0 002 2h2a2 2 0 002-2v-2c0-1.657-1.343-3-3-3z"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M7 11V7a5 5 0 1110 0v4"/>
      </svg>`;

  const container = document.getElementById('themes-container');
  if (!container) return;  // Page might not have loaded the section yet
  container.innerHTML = '';

  // Adds each theme to the container
  themes.forEach(({ name, level }) => {
    const unlocked = userLevel >= level;
    const btn = document.createElement('button');
    btn.className = [
      'btn btn-outline w-full',
      'text-sm sm:text-base py-3 px-4',
      'flex justify-between items-center',
      unlocked ? '' : 'opacity-50 pointer-events-none'
    ].join(' ');
    btn.innerHTML = `
        <span class="capitalize">
          ${name} <small class="text-xs text-gray-400">Lv ${level}</small>
        </span>
        ${unlocked ? '' : LOCK_SVG}
      `;
    if (unlocked) {
      btn.addEventListener('click', () => {
        document.documentElement.setAttribute('data-theme', name);

        // Saves the selected theme to localStorage
        const themesByUser = JSON.parse(localStorage.getItem('userThemes') || '{}');
        themesByUser[currentUserId] = name;
        localStorage.setItem('userThemes', JSON.stringify(themesByUser));
      });
    }
    container.appendChild(btn);
  });
}

// Updates user profile
function updateProfileUI() {
  const expBar = document.getElementById('exp-progress');
  const levelBadge = document.getElementById('level-badge');
  if (expBar && levelBadge) {
    expBar.value = userExp;
    expBar.max = expThreshold;
    levelBadge.innerText = 'Level ' + userLevel;
  }
  const newStreak = getCurrentStreak();
  if (newStreak !== streakDays) {
    streakDays = newStreak;
    window.dbAPI.updateStreakDays(currentUserId, streakDays);
  }
  // Profile‑card elements
  const profLevel = document.getElementById('profile-level');
  const profExp = document.getElementById('profile-exp-progress');
  const xpNext = document.getElementById('xp-to-next');
  const focusH = document.getElementById('focus-hours-week');
  const tasksEl = document.getElementById('tasks-completed');
  const streakEl = document.getElementById('focus-streak');

  if (profLevel) profLevel.innerText = userLevel;

  if (profExp && xpNext) {
    profExp.value = userExp;
    profExp.max = expThreshold;
    xpNext.innerText = (expThreshold - userExp) + ' XP to next level';
  }

  if (focusH) {
    const weekSecs = Object.values(weeklyFocusData).reduce((a, b) => a + b, 0);
    const hrs = Math.floor(weekSecs / 3600);
    const mins = Math.floor((weekSecs % 3600) / 60);
    focusH.innerText = `${hrs} h ${mins} m`;
  }
  let streak = getCurrentStreak();
  if (tasksEl) tasksEl.innerText = totalTasksCompleted;
  if (streakEl) streakEl.innerText = `${streak} day${streak === 1 ? '' : 's'}`;

  // Shows unlocked themes 
  const profileContainer = document.getElementById('profile-themes');
  if (profileContainer) {
    profileContainer.innerHTML = themes
      .filter(t => userLevel >= t.level)
      .map(t => `<span class="badge badge-primary capitalize">${t.name}</span>`)
      .join('');
  }
}

// Calculates the current streak of focus days
function getCurrentStreak() {
  const today = new Date().getDay();
  let streak = 0;
  for (let i = 0; i < 7; i++) {
    const d = (today - i + 7) % 7;
    if (weeklyFocusData[d] > 0) streak++;
    else break;
  }
  return streak;
}

// Renders the leaderboard section
async function renderLeaderboard() {
  await window.dbAPI.refreshLeaderboard();
  const rows = await window.dbAPI.getLeaderboard();
  const tbody = document.querySelector('#leaderboard-section table tbody');
  tbody.innerHTML = rows.map((r, i) => `
    <tr><th>${i + 1}</th><td>${r.username}</td><td>${r.level}</td></tr>
  `).join('');
}