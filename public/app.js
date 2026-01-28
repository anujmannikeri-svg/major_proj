const API_URL = 'http://localhost:5000';
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user'));

// DOM Elements
const authView = document.getElementById('auth-view');
const appView = document.getElementById('app-view');
const authForm = document.getElementById('auth-form');
const switchAuth = document.getElementById('switch-auth');
const nameGroup = document.getElementById('name-group');
const roleGroup = document.getElementById('role-group');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const userDisplay = document.getElementById('user-display');
const logoutBtn = document.getElementById('logout-btn');

let isLogin = true;

// Initialize
function init() {
    if (token && user) {
        showDashboard();
    } else {
        showAuth();
    }
}

// UI Switching
function showAuth() {
    authView.classList.remove('hidden');
    appView.classList.add('hidden');
}

function showDashboard() {
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
    userDisplay.innerText = `Hello, ${user.name} (${user.role})`;

    if (user.role === 'Admin') {
        document.getElementById('admin-dashboard').classList.remove('hidden');
        document.getElementById('student-dashboard').classList.add('hidden');
        fetchExamsAdmin();
    } else {
        document.getElementById('admin-dashboard').classList.add('hidden');
        document.getElementById('student-dashboard').classList.remove('hidden');
        fetchExamsStudent();
    }
}

// Auth Handlers
switchAuth.addEventListener('click', () => {
    isLogin = !isLogin;
    authTitle.innerText = isLogin ? 'Login' : 'Sign Up';
    authSubtitle.innerText = isLogin ? 'Welcome back! Please enter your details.' : 'Join us and start your journey.';
    nameGroup.classList.toggle('hidden');
    roleGroup.classList.toggle('hidden');
    document.getElementById('toggle-text').innerHTML = isLogin ?
        'Don\'t have an account? <span id="switch-auth">Sign Up</span>' :
        'Already have an account? <span id="switch-auth">Login</span>';
    // Re-bind because innerHTML destroys old elements
    document.getElementById('switch-auth').addEventListener('click', () => switchAuth.click());
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name').value;
    const role = document.getElementById('role').value;

    const endpoint = isLogin ? '/auth/login' : '/auth/signup';
    const body = isLogin ? { email, password } : { name, email, password, role };

    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) {
            token = data.token;
            user = data.user;
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            showDashboard();
            showToast('Success!', 'success');
        } else {
            showToast(data.message || 'Error occurred', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    }
});

logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    location.reload();
});

// Admin Functions
async function fetchExamsAdmin() {
    try {
        const res = await fetch(`${API_URL}/exams`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const exams = await res.json();
        const list = document.getElementById('admin-exam-list');
        list.innerHTML = exams.map(exam => `
            <div class="glass-card exam-card">
                <h3>${exam.title}</h3>
                <p style="color: var(--text-muted); margin: 10px 0;">${new Date(exam.date).toLocaleDateString()}</p>
                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <button class="btn btn-primary" onclick="viewResults('${exam._id}')">Results</button>
                    <button class="btn" style="background: var(--error); color: white;" onclick="deleteExam('${exam._id}')">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        showToast('Failed to fetch exams', 'error');
    }
}

// Create Exam Modal
document.getElementById('create-exam-btn').addEventListener('click', () => {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = `
        <h2>Create New Exam</h2>
        <form id="create-exam-form" style="margin-top: 20px;">
            <div class="input-group">
                <label>Exam Title</label>
                <input type="text" id="exam-title" required>
            </div>
            <div style="display: flex; gap: 15px;">
                <div class="input-group" style="flex: 1;">
                    <label>Date</label>
                    <input type="date" id="exam-date" required>
                </div>
                <div class="input-group" style="flex: 1;">
                    <label>Duration (mins)</label>
                    <input type="number" id="exam-duration" required>
                </div>
            </div>
            <div id="questions-edit" style="margin-top: 10px; max-height: 300px; overflow-y: auto;">
                <h4>Questions</h4>
                <div class="q-item" style="margin-bottom: 20px; padding: 10px; border: 1px dashed var(--glass-border);">
                   <input type="text" placeholder="Question Text" class="q-text" required style="margin-bottom: 10px;">
                   <input type="text" placeholder="Option 1" class="q-opt1" required>
                   <input type="text" placeholder="Option 2" class="q-opt2" required>
                   <select class="q-correct" style="margin-top: 10px;">
                      <option value="0">Option 1 is correct</option>
                      <option value="1">Option 2 is correct</option>
                   </select>
                </div>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Create Exam</button>
            <button type="button" class="btn" onclick="closeModal()" style="width: 100%; margin-top: 10px;">Cancel</button>
        </form>
    `;
    overlay.classList.remove('hidden');

    document.getElementById('create-exam-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('exam-title').value;
        const date = document.getElementById('exam-date').value;
        const duration = document.getElementById('exam-duration').value;

        // Simple one question support for demo
        const questions = [{
            questionText: content.querySelector('.q-text').value,
            options: [content.querySelector('.q-opt1').value, content.querySelector('.q-opt2').value],
            correctAnswer: parseInt(content.querySelector('.q-correct').value)
        }];

        const res = await fetch(`${API_URL}/exams`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ title, date, duration, questions })
        });

        if (res.ok) {
            closeModal();
            fetchExamsAdmin();
            showToast('Exam created!', 'success');
        }
    });
});

// Student Functions
async function fetchExamsStudent() {
    try {
        const res = await fetch(`${API_URL}/exams`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const exams = await res.json();
        const list = document.getElementById('student-exam-list');
        list.innerHTML = exams.map(exam => `
            <div class="glass-card exam-card">
                <h3>${exam.title}</h3>
                <p>${exam.duration} Minutes</p>
                <p style="color: var(--text-muted); font-size: 0.9rem;">${new Date(exam.date).toLocaleDateString()}</p>
                <button class="btn btn-primary" style="margin-top: 15px; width: 100%;" onclick="startExam('${exam._id}')">Take Exam</button>
            </div>
        `).join('');
    } catch (err) {
        showToast('Failed to fetch exams', 'error');
    }
}

async function startExam(id) {
    try {
        const res = await fetch(`${API_URL}/exams/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const exam = await res.json();

        document.getElementById('student-dashboard').classList.add('hidden');
        document.getElementById('exam-taking-view').classList.remove('hidden');
        document.getElementById('current-exam-title').innerText = exam.title;

        const container = document.getElementById('questions-container');
        container.innerHTML = exam.questions.map((q, qIndex) => `
            <div style="margin-bottom: 25px;">
                <p style="font-weight: 600; margin-bottom: 12px;">${qIndex + 1}. ${q.questionText}</p>
                ${q.options.map((opt, oIndex) => `
                    <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                        <input type="radio" name="q${qIndex}" value="${oIndex}" style="width: auto; margin-right: 10px;">
                        ${opt}
                    </label>
                `).join('')}
            </div>
        `).join('');

        document.getElementById('submit-exam-btn').onclick = () => submitExam(id, exam.questions.length);
    } catch (err) {
        showToast('Error starting exam', 'error');
    }
}

async function submitExam(examId, qCount) {
    const answers = [];
    for (let i = 0; i < qCount; i++) {
        const selected = document.querySelector(`input[name="q${i}"]:checked`);
        answers.push(selected ? parseInt(selected.value) : -1);
    }

    try {
        const res = await fetch(`${API_URL}/submit/${examId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ answers })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`Exam submitted! Marks: ${data.marks}`, 'success');
            setTimeout(() => location.reload(), 2000);
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Submission failed', 'error');
    }
}

// Utility
function showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.background = type === 'success' ? 'var(--success)' : 'var(--error)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

window.deleteExam = async (id) => {
    if (!confirm('Are you sure?')) return;
    const res = await fetch(`${API_URL}/exams/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) { fetchExamsAdmin(); showToast('Deleted', 'success'); }
};

window.viewResults = async (examId) => {
    const res = await fetch(`${API_URL}/exams/results/${examId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const results = await res.json();
    const content = document.getElementById('modal-content');
    content.innerHTML = `
        <h2>Exam Results</h2>
        <div style="margin-top: 20px; max-height: 400px; overflow-y: auto;">
            ${results.length ? results.map(r => `
                <div style="padding: 15px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between;">
                    <div>
                        <strong>${r.student.name}</strong><br>
                        <small>${r.student.email}</small>
                    </div>
                    <div style="font-size: 1.2rem; font-weight: 800; color: var(--primary)">${r.marks}</div>
                </div>
            `).join('') : '<p>No submissions yet.</p>'}
        </div>
        <button class="btn btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 20px;">Close</button>
    `;
    document.getElementById('modal-overlay').classList.remove('hidden');
};

// Start
init();
