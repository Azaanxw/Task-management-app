document.addEventListener('DOMContentLoaded', () => {
  // window control buttons
  const { minimise, toggleMax, close } = window.globalDataAPI;
  document.getElementById('min-btn').addEventListener('click', minimise);
  document.getElementById('max-btn').addEventListener('click', toggleMax);
  document.getElementById('close-btn').addEventListener('click', close);


  // Login/Register section 
  const loginSection = document.getElementById('login-section');
  const registerSection = document.getElementById('register-section');

  document.getElementById('show-register').addEventListener('click', e => {
    e.preventDefault();
    loginSection.style.display = 'none';
    registerSection.style.display = 'block';
  });
  document.getElementById('show-login').addEventListener('click', e => {
    e.preventDefault();
    registerSection.style.display = 'none';
    loginSection.style.display = 'block';
  });

  // Login form logic 
  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    window.authAPI.forceLogin();
  });

  // Register form logic
  document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-password-confirm').value;
    if (!username || !password) return;
    if (password !== confirm) {
      showAlert('Passwords do not match', 'error');
      return;
    }

    const result = await window.authAPI.register(username, password);
    if (result.success) {
      showAlert('Registration successful! Please log in.', 'success');
      registerSection.style.display = 'none';
      loginSection.style.display = 'block';
    } else {
      showAlert('Registration failed', 'error');
    }
  });
});

/* NOTIFICATION SECTION */
function showAlert(message, type = 'info', duration = 3000) {
  const container = document.getElementById('alert-container');
  if (!container) return;

  // If same message is displayed then don't do anything 
  const existing = container.firstElementChild;
  if (existing) {
    const existingMsg = existing.querySelector('span')?.textContent;
    if (existingMsg === message) return;
    container.removeChild(existing);
  }

  // Icons
  const icons = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6"
                   fill="none" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6"
                   fill="none" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M10 14L14 10M10 10l4 4"/><circle cx="12" cy="12" r="9"/>
              </svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6"
                   fill="none" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M12 9v2m0 4h.01"/><path stroke-linecap="round" stroke-linejoin="round"
                      d="M12 3a9 9 0 100 18 9 9 0 000-18z"/>
              </svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6"
                   fill="none" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                      d="M13 16h-1v-4h-1m0-4h.01"/><path stroke-linecap="round" stroke-linejoin="round"
                      d="M12 2a10 10 0 11-10 10A10 10 0 0112 2z"/>
              </svg>`
  };

  let bgClass;
  switch (type) {
    case 'error': bgClass = 'bg-red-500'; break;
    case 'warning': bgClass = 'bg-yellow-500'; break;
    case 'success': bgClass = 'bg-green-500'; break;
    default: bgClass = 'bg-blue-500'; break;
  }

  const alertEl = document.createElement('div');
  alertEl.setAttribute('role', 'alert');
  alertEl.className = ['alert', bgClass, 'text-black', 'shadow-lg', 'pointer-events-auto'].join(' ');
  alertEl.innerHTML = `
    <div class="flex items-center space-x-2">
      ${icons[type] || icons.info}
      <span>${message}</span>
    </div>
  `;

  container.appendChild(alertEl);
  setTimeout(() => {
    if (alertEl.parentNode) alertEl.remove();
  }, duration);
}

