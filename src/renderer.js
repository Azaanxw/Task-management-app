let timer = null;
let timeRemaining = 25 * 60; // Default 25 minutes in seconds
let isPaused = false;
let totalFocusTime = 0; // Tracks total focused time
let focusTime = 25 * 60; // Default focus time
let breakTime = 5 * 60; // Default break time
let isBreak = false;
let lastFocusUpdate = 0;
let focusChart = null;

// Tracking Daily focus time
let weeklyFocusData = {
    0: 0,  // Sunday
    1: 0,  // Monday
    2: 0,  // Tuesday
    3: 0,  // Wednesday
    4: 0,  // Thursday
    5: 0,  // Friday
    6: 0   // Saturday
  };

// Function to update the timer display
function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timerDisplay = document.getElementById("timer-display");
    timerDisplay.innerText = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    updateCircleProgress();
    updateFocusTimeDisplay(); // Update focus time continuously
}

// Function to start the timer
function startTimer() {
    if (timer) return; // Prevent starting a new timer if already running
    isPaused = false;
    lastFocusUpdate = Date.now();
    timer = setInterval(() => {
        if (timeRemaining > 0) {
            timeRemaining--;
            if (!isBreak) {
                const now = Date.now();
                const delta = (now - lastFocusUpdate) / 1000; // Calculates time passed in seconds
                totalFocusTime += delta; // Accumulate overall focus time

                // Updates weekly focus data for the current day
                const currentDay = new Date().getDay();
                weeklyFocusData[currentDay] += delta;

                lastFocusUpdate = now;
                updateFocusChart(); // Refreshes the weekly focus chart with new data
            }
            updateTimerDisplay();
        } else {
            clearInterval(timer);
            timer = null;
            if (!isBreak) {
                alert("Focus session complete! Time for a break.");
                isBreak = true;
                timeRemaining = breakTime;
            } else {
                alert("Break is over! Time to focus.");
                isBreak = false;
                timeRemaining = focusTime;
            }
            startTimer();
        }
    }, 1000);
}

// Function to pause the timer
function pauseTimer() {
    if (timer && !isPaused) {
        clearInterval(timer);
        timer = null;
        isPaused = true;
        if (!isBreak) {
            totalFocusTime += (Date.now() - lastFocusUpdate) / 1000; // Ensures focus time updates on pause
            updateFocusTimeDisplay();
        }
    }
}

// Function to reset the timer
function resetTimer() {
    clearInterval(timer);
    timer = null;
    isPaused = false;
    isBreak = false;
    focusTime = parseInt(document.getElementById("focus-input").value) * 60;
    breakTime = parseInt(document.getElementById("break-input").value) * 60;
    timeRemaining = focusTime;
    totalFocusTime = 0; // Reset total focus time
    updateTimerDisplay();
    updateFocusTimeDisplay();
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
    const progress = 1 - (timeRemaining / (isBreak ? breakTime : focusTime)); // Flip progress calculation for clockwise motion
    progressCircle.style.strokeDasharray = `${circumference}`;
    progressCircle.style.strokeDashoffset = `${circumference * progress}`;
    progressCircle.style.transform = "rotate(270deg) scale(1, -1)"; // Ensures proper clockwise motion starting from the top
    progressCircle.style.transformOrigin = "center";
    progressCircle.style.stroke = isBreak ? "green" : "blue"; // Change color based on session type
    progressCircle.style.display = "block"; // Ensure proper centering
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

// Initialize the timer display
updateTimerDisplay();
updateFocusTimeDisplay();
// Track time spent on applications
const appUsageData = {};
let lastActiveApp = null;
let lastActiveTime = Date.now();

// List of applications to exclude from tracking
const excludedApps = [
    "Windows Shell Experience Host",
    "SearchHost.exe",
    "Electron",
    "RuntimeBroker.exe",
    "Application Frame Host",
    "LockApp.exe"
];

// Function to format application names
function formatAppName(appName) {
    if (!appName) return "Unknown";

    // Remove .exe extension
    let formattedName = appName.replace(/\.exe$/i, "");

    // Capitalize first letter
    formattedName = formattedName.charAt(0).toUpperCase() + formattedName.slice(1);

    return formattedName;
}

// Function to format time in HH:MM:SS
function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Function to update the application usage list in the UI
function renderAppUsage() {
    const appList = document.getElementById("app-usage-list");
    appList.innerHTML = Object.entries(appUsageData)
        .filter(([app]) => !excludedApps.includes(app)) // Exclude unwanted apps
        .map(([app, data]) => {
            const { time, icon } = data;
            const displayName = formatAppName(app);

            return `
                <li style="display: flex; justify-content: center; gap: 10px;">
                    ${icon ? `<img src="${icon}" alt="${displayName}" width="24" height="24" onerror="this.style.display='none';">` : ''}
                    <strong>${displayName}</strong>: ${formatTime(time)}
                </li>
            `;
        })
        .join("");
}

// Function to track active applications continuously
async function trackApplicationUsage() {
    const now = Date.now();

    // Fetch the currently active application
    const activeApp = await window.appTracker.getActiveApplication();
    if (!activeApp) return;

    let { name: appName, icon } = activeApp;

    if (!appName || excludedApps.includes(appName)) return; // Skip excluded apps

    appName = formatAppName(appName);

    // Updates time spent on the last active app
    if (lastActiveApp) {
        const elapsedTime = Math.round((now - lastActiveTime) / 1000);
        if (!appUsageData[lastActiveApp]) {
            appUsageData[lastActiveApp] = { time: 0, icon: null };
        }
        appUsageData[lastActiveApp].time += elapsedTime;
    }

    // Stores the icon only when first tracking the app
    if (!appUsageData[appName]) {
        appUsageData[appName] = { time: 0, icon: icon };
    }

    lastActiveApp = appName;
    lastActiveTime = now;
    renderAppUsage();
    updateChart(); 
}

// Call `trackApplicationUsage` every second
setInterval(trackApplicationUsage, 1000);

// Adding tasks 
const folders = {}; // Example: { "Work": [{ title: "Complete project", completed: false }] }
let currentFolder = null; // Tracks the currently selected folder

// Function to render folder list
function renderFolders() {
    const folderContainer = document.getElementById("folders-container");

    // Stores which folders are open
    const openFolders = {};
    document.querySelectorAll(".collapse[open]").forEach((el) => {
        openFolders[el.getAttribute("data-folder")] = true;
    });

    folderContainer.innerHTML = Object.keys(folders)
        .map(folder => {
            // Auto capitalize folder name
            const formattedFolder = folder.charAt(0).toUpperCase() + folder.slice(1).toLowerCase();

            return `
            <details class="collapse bg-base-100 rounded-lg shadow-md p-3" data-folder="${folder}" ${openFolders[folder] ? "open" : ""}>
                <summary class="collapse-title text-lg font-semibold flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px;" class="inline-block flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                            d="M3 7h18M3 7l2-2h5l2 2h8M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10H5z"/>
                    </svg>
                    <span class="text-base relative top-[1px]">${formattedFolder}</span>
                </summary>
                <div class="collapse-content mt-2">
                    <ul class="space-y-2">
                        ${folders[folder].map((task, index) => `
                            <li class="flex justify-between items-center bg-base-300 p-2 rounded-lg shadow-sm">
                                <span class="${task.completed ? 'line-through text-gray-400' : ''}">
                                    ${task.title}
                                </span>
                                <button class="btn btn-xs ${task.completed ? 'btn-warning' : 'btn-success'} task-btn" 
                                    data-folder="${folder}" data-index="${index}">
                                    ${task.completed ? "Undo" : "Complete"}
                                </button>
                            </li>
                        `).join("")}
                    </ul>
                    <div class="mt-2">
                        <input type="text" class="input input-sm input-bordered w-full" id="task-input-${folder}" placeholder="New Task">
                        <button class="btn btn-sm btn-neutral mt-2 w-full" onclick="addTask('${folder}')">Add Task</button>
                    </div>
                </div>
            </details>
            `;
        })
        .join("");

    // Prevents collapse from closing when clicking task buttons
    document.querySelectorAll(".task-btn").forEach(button => {
        button.addEventListener("click", (event) => {
            event.stopPropagation(); // Prevents collapse from closing
            const folder = event.target.getAttribute("data-folder");
            const index = event.target.getAttribute("data-index");
            toggleTaskCompletion(folder, index);
        });
    });
}


// Function to render tasks in the current folder
function renderTasks() {
    const taskList = document.getElementById("task-list");
    if (!currentFolder) {
        taskList.innerHTML = "<p>Please select a folder to view tasks.</p>";
        return;
    }
    const tasks = folders[currentFolder];
    taskList.innerHTML = tasks
        .map(
            (task, index) => `
        <li>
            <span style="text-decoration: ${task.completed ? "line-through" : "none"}">
                ${task.title}
            </span>
            <button onclick="toggleTaskCompletion('${currentFolder}', ${index})">
                ${task.completed ? "Undo" : "Complete"}
            </button>
        </li>
        `
        )
        .join("");
}

// Function to add a folder
function addFolder() {
    const folderName = document.getElementById("folder-name").value.trim();
    if (!folderName) {
        alert("Folder name cannot be empty.");
        return;
    }
    if (folders[folderName]) {
        alert("Folder already exists.");
        return;
    }
    folders[folderName] = [];
    document.getElementById("folder-name").value = ""; // Clear input
    renderFolders();
}

// Function to add a task to the current folder
function addTask(folder) {
    const taskInput = document.getElementById(`task-input-${folder}`);
    const taskTitle = taskInput.value.trim();
    if (!taskTitle) {
        alert("Task title cannot be empty.");
        return;
    }
    folders[folder].push({ title: taskTitle, completed: false });
    taskInput.value = ""; 
    renderFolders();
}


// Function to toggle task completion
function toggleTaskCompletion(folder, taskIndex) {
    folders[folder][taskIndex].completed = !folders[folder][taskIndex].completed;
    renderFolders();
}

// Function to select a folder
function selectFolder(folder) {
    currentFolder = folder;
    document.getElementById("current-folder").innerText = folder;
    renderTasks();
}

// Initial Render
renderFolders();

// Graph for time spent on each application (bar chart)
let appUsageChart = null; // Stores the chart instance

function updateChart() {
    const ctx = document.getElementById('appUsageChart').getContext('2d');

    // Gets sorted application data (Top 5 only)
    const sortedApps = Object.entries(appUsageData)
        .sort((a, b) => b[1].time - a[1].time) // Sort by highest time spent
        .slice(0, 5); 

    const labels = sortedApps.map(([app]) => app);
    const times = sortedApps.map(([_, data]) => data.time);
    const maxTime = Math.max(...times, 10); // Ensures minimum value for y-axis

    if (appUsageChart) {
        // Smoothly updates the chart with up anim
        appUsageChart.data.labels = labels;
        appUsageChart.data.datasets[0].data = times;
        appUsageChart.options.scales.y.max = maxTime;
        appUsageChart.update();
        return;
    }

    // Create a new bar chart
    appUsageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Time Spent (seconds)',
                data: times,
                backgroundColor: 'rgba(0, 102, 255, 0.8)',
                borderColor: 'rgba(0, 85, 204, 1)', 
                borderWidth: 1,
                borderRadius: 10,
                barThickness: 100,
                maxBarThickness: 120
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 600, 
                easing: 'easeOutExpo' 
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: maxTime,
                    ticks: {
                        font: {
                            size: 14,
                            weight: "bold", 
                            family: 'Inter, sans-serif'
                        },
                        color: '#A0AEC0'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: 16,
                            weight: "bold", 
                            family: 'Inter, sans-serif'
                        },
                        color: '#A0AEC0'
                    },
                    grid: {
                        display: false
                    },
                    barPercentage: 0.85, 
                    categoryPercentage: 0.9
                }
            },
            plugins: {
                legend: { display: false }, 
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    bodyFont: { family: 'Inter, sans-serif', size: 14 },
                    padding: 10,
                    borderRadius: 8
                }
            }
        }
    });
}

function updateFocusChart() {
const ctx = document.getElementById('focusChart').getContext('2d');
const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const focusTimes = labels.map((_, index) => weeklyFocusData[index]);

const focusTimesInMinutes = focusTimes.map(seconds => Math.round(seconds / 60));

if (focusChart) {
// Updates existing chart data
focusChart.data.datasets[0].data = focusTimesInMinutes;
focusChart.update();
} else {
// Creates the chart for the first time
focusChart = new Chart(ctx, {
    type: 'bar',
    data: {
    labels: labels,
    datasets: [{
        label: 'Focus Time (minutes)',
        data: focusTimesInMinutes,
        backgroundColor: 'rgba(0, 102, 255, 0.8)',
        borderColor: 'rgba(0, 85, 204, 1)',
        borderWidth: 1,
        borderRadius: 10,
        barThickness: 40,
    }]
    },
    options: {
    scales: {
        y: {
        beginAtZero: true,
        ticks: {
            // Displays the y-axis in minutes
            callback: function(value) {
            return value + ' min';
            }
        }
        }
    },
    plugins: {
        tooltip: {
        callbacks: {
            label: function(context) {
            return context.parsed.y + ' min';
            }
        }
        },
        legend: {
        display: false
        }
    }
    }
});
}
}

// Renders and shows the list of distracting apps 
function renderDistractingApps(appList) {
    const listElement = document.getElementById('distracting-app-list');
    listElement.innerHTML = appList.map(app => `<li>${app}</li>`).join('');
  }
  
  // Fetches the global data
  window.globalDataAPI.getGlobalData().then(data => {
    renderDistractingApps(data.distractingApps);
  });
  
  // Listens for updates broadcast from the main process
  window.globalDataAPI.onGlobalDataUpdate((data) => {
    renderDistractingApps(data.distractingApps);
  });
  
  // Function to add a distracting ap by user
  async function addDistractingApp() {
    const input = document.getElementById('distracting-app-input');
    const appName = input.value.trim();
    if (appName) {
      const updatedData = await window.globalDataAPI.addDistractingApp(appName);
      // Render the updated list
      renderDistractingApps(updatedData.distractingApps);
      input.value = '';
    } else {
      alert('App already listed or invalid input.');
    }
  }

// Initial render
renderDistractingApps();