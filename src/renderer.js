let timer = null;
let timeRemaining = 25 * 60; // 25 minutes in seconds
let isPaused = false;

// Function to update the timer display
function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const timerDisplay = document.getElementById("timer-display");
    timerDisplay.innerText = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// Function to start the timer
function startTimer() {
    if (timer) return; // Prevent starting a new timer if already running

    isPaused = false;
    timer = setInterval(() => {
        if (timeRemaining > 0) {
            timeRemaining--;
            updateTimerDisplay();
        } else {
            clearInterval(timer);
            timer = null;
            alert("Time's up!");
        }
    }, 1000);
}

// Function to pause the timer
function pauseTimer() {
    if (timer && !isPaused) {
        clearInterval(timer); // Stop the interval
        timer = null;
        isPaused = true; // Mark as paused
    }
}

// Attach event listeners to buttons
document.getElementById("start-timer").addEventListener("click", startTimer);
document.getElementById("pause-timer").addEventListener("click", pauseTimer);

// Initialize the timer display
updateTimerDisplay();

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
    "Application Frame Host"
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
    const folderList = document.getElementById("folder-list");
    folderList.innerHTML = Object.keys(folders)
        .map(
            (folder) => `
        <li>
            <span>${folder}</span>
            <button onclick="selectFolder('${folder}')">Open</button>
        </li>
        `
        )
        .join("");
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
function addTask() {
    if (!currentFolder) {
        alert("Please select a folder first.");
        return;
    }
    const taskTitle = document.getElementById("task-title").value.trim();
    if (!taskTitle) {
        alert("Task title cannot be empty.");
        return;
    }
    folders[currentFolder].push({ title: taskTitle, completed: false });
    document.getElementById("task-title").value = ""; // Clear input
    renderTasks();
}

// Function to toggle task completion
function toggleTaskCompletion(folder, taskIndex) {
    folders[folder][taskIndex].completed = !folders[folder][taskIndex].completed;
    renderTasks();
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