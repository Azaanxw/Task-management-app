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
const appUsageData = {}; // Store application usage
let lastActiveApp = null;
let lastActiveTime = Date.now();

// Function to update application usage data
async function trackApplicationUsage() {
    const activeApp = await window.appTracker.getActiveApplication();
    const now = Date.now();

    if (activeApp) {
        const appName = activeApp.name;

        // Track time spent on the last active app
        if (lastActiveApp && lastActiveApp !== appName) {
            const elapsedTime = Math.round((now - lastActiveTime) / 1000); // in seconds
            appUsageData[lastActiveApp] = (appUsageData[lastActiveApp] || 0) + elapsedTime;
            lastActiveTime = now;
        }

        lastActiveApp = appName;

        // Update the UI
        const appList = document.getElementById('app-usage-list');
        appList.innerHTML = Object.entries(appUsageData)
            .map(([app, time]) => `<li>${app}: ${time} seconds</li>`)
            .join('');
    }
}

// Track active applications every second
setInterval(trackApplicationUsage, 1000);