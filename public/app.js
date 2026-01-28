const API_URL = 'http://localhost:8080';
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

const adminDashboard = document.getElementById('admin-dashboard');
const studentDashboard = document.getElementById('student-dashboard');
const examTakingView = document.getElementById('exam-taking-view');
const examTimerEl = document.getElementById('exam-timer');

let isLogin = true;
let examTimerInterval = null;

// Simple hash-based routing helper
function navigate(hash) {
    if (location.hash !== hash) {
        location.hash = hash;
    } else {
        handleRouteChange();
    }
}

// Initialize
function init() {
    if (token && user) {
        showDashboard();
        if (!location.hash) {
            navigate(user.role === 'Admin' ? '#/admin' : '#/student');
        } else {
            handleRouteChange();
        }
    } else {
        showAuth();
        if (!location.hash || location.hash === '#/admin' || location.hash === '#/student') {
            navigate('#/auth');
        }
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
        adminDashboard.classList.remove('hidden');
        studentDashboard.classList.add('hidden');
        examTakingView.classList.add('hidden');
        fetchExamsAdmin();
    } else {
        adminDashboard.classList.add('hidden');
        studentDashboard.classList.remove('hidden');
        examTakingView.classList.add('hidden');
        setupStudentTabs();
        fetchExamsStudent();
    }
}

function handleRouteChange() {
    if (!token || !user) {
        showAuth();
        return;
    }

    const hash = location.hash || '';

    if (user.role === 'Admin') {
        adminDashboard.classList.remove('hidden');
        studentDashboard.classList.add('hidden');
        examTakingView.classList.add('hidden');
        if (hash === '#/auth') {
            navigate('#/admin');
        }
        return;
    }

    // Student routes
    if (hash.startsWith('#/exam/')) {
        // Already handled by startExam, just ensure visibility
        adminDashboard.classList.add('hidden');
        studentDashboard.classList.add('hidden');
        examTakingView.classList.remove('hidden');
    } else {
        examTakingView.classList.add('hidden');
        studentDashboard.classList.remove('hidden');
        adminDashboard.classList.add('hidden');

        if (hash === '#/student/results') {
            switchStudentTab('results');
        } else {
            // default to available exams
            switchStudentTab('available');
        }
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
            navigate(user.role === 'Admin' ? '#/admin' : '#/student');
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
                   <input type="text" placeholder="Option 1" class="q-opt" required>
                   <input type="text" placeholder="Option 2" class="q-opt" required>
                   <input type="text" placeholder="Option 3 (optional)" class="q-opt">
                   <input type="text" placeholder="Option 4 (optional)" class="q-opt">
                   <select class="q-correct" style="margin-top: 10px;">
                      <option value="0">Option 1 is correct</option>
                      <option value="1">Option 2 is correct</option>
                      <option value="2">Option 3 is correct</option>
                      <option value="3">Option 4 is correct</option>
                   </select>
                </div>
            </div>
            <button type="button" id="add-question-btn" class="btn" style="width: 100%; margin: 10px 0;">Add Question</button>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Create Exam</button>
            <button type="button" class="btn" onclick="closeModal()" style="width: 100%; margin-top: 10px;">Cancel</button>
        </form>
    `;
    overlay.classList.remove('hidden');

    const questionsEdit = document.getElementById('questions-edit');
    const addQuestionBtn = document.getElementById('add-question-btn');

    addQuestionBtn.addEventListener('click', () => {
        const template = questionsEdit.querySelector('.q-item');
        const clone = template.cloneNode(true);
        // Clear values
        clone.querySelector('.q-text').value = '';
        clone.querySelectorAll('.q-opt').forEach((i, idx) => {
            i.value = '';
            if (idx < 2) {
                i.required = true;
            } else {
                i.required = false;
            }
        });
        clone.querySelector('.q-correct').value = '0';
        questionsEdit.appendChild(clone);
    });

    document.getElementById('create-exam-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('exam-title').value;
        const date = document.getElementById('exam-date').value;
        const duration = document.getElementById('exam-duration').value;
        const questions = [];

        questionsEdit.querySelectorAll('.q-item').forEach((item) => {
            const questionText = item.querySelector('.q-text').value.trim();
            const optionInputs = Array.from(item.querySelectorAll('.q-opt'));
            const options = optionInputs
                .map((i) => i.value.trim())
                .filter((v) => v.length > 0);

            if (!questionText || options.length < 2) {
                return;
            }

            let correctAnswer = parseInt(item.querySelector('.q-correct').value, 10);
            if (correctAnswer >= options.length) {
                // If selected answer is for an empty option, default to first
                correctAnswer = 0;
            }

            questions.push({
                questionText,
                options,
                correctAnswer
            });
        });

        if (!questions.length) {
            showToast('Add at least one valid question with two options.', 'error');
            return;
        }

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

// Student tabs and results/history
let studentTabsSetup = false;

function setupStudentTabs() {
    if (studentTabsSetup) return;
    studentTabsSetup = true;

    const tabsContainer = document.querySelector('#student-dashboard .tabs');
    if (!tabsContainer) return;

    const buttons = tabsContainer.querySelectorAll('button');
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            switchStudentTab(tab);
            if (tab === 'results') {
                navigate('#/student/results');
            } else {
                navigate('#/student');
            }
        });
    });
}

function switchStudentTab(tab) {
    const tabsContainer = document.querySelector('#student-dashboard .tabs');
    if (!tabsContainer) return;
    const buttons = tabsContainer.querySelectorAll('button');
    buttons.forEach((btn) => {
        btn.classList.toggle('active-tab', btn.getAttribute('data-tab') === tab);
    });

    const availableEl = document.getElementById('student-exam-list');
    const resultsEl = document.getElementById('student-results-list');

    if (tab === 'results') {
        availableEl.classList.add('hidden');
        resultsEl.classList.remove('hidden');
        fetchMyResults();
    } else {
        availableEl.classList.remove('hidden');
        resultsEl.classList.add('hidden');
    }
}

async function fetchMyResults() {
    try {
        const res = await fetch(`${API_URL}/submit/my-results`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const results = await res.json();
        const list = document.getElementById('student-results-list');

        if (!Array.isArray(results) || !results.length) {
            list.innerHTML = '<p>No exams attempted yet.</p>';
            return;
        }

        // Sort by submittedAt
        results.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

        const totalExams = results.length;
        const totalMarks = results.reduce((sum, r) => sum + (r.marks || 0), 0);
        const avgMarks = (totalMarks / totalExams).toFixed(2);
        const lastMarks = results[results.length - 1].marks || 0;
        const prevMarks = results.length > 1 ? results[results.length - 2].marks || 0 : null;

        let trendText = 'Not enough data';
        if (prevMarks !== null) {
            if (lastMarks > prevMarks) trendText = 'Improving';
            else if (lastMarks < prevMarks) trendText = 'Declining';
            else trendText = 'Stable';
        }

        const analyticsCard = `
            <div class="glass-card" style="margin-bottom: 20px;">
                <h3>Your Performance Summary</h3>
                <p style="margin-top: 10px;">Total Exams: <strong>${totalExams}</strong></p>
                <p>Average Marks: <strong>${avgMarks}</strong></p>
                <p>Last Exam Marks: <strong>${lastMarks}</strong></p>
                <p>Trend: <strong>${trendText}</strong></p>
            </div>
        `;

        const historyCards = results.map(r => `
            <div class="glass-card exam-card">
                <h3>${r.exam?.title || 'Exam'}</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">
                    ${r.exam?.date ? new Date(r.exam.date).toLocaleDateString() : ''}
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <span style="font-weight: 700; color: var(--primary); font-size: 1.2rem;">${r.marks}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">
                        ${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''}
                    </span>
                </div>
            </div>
        `).join('');

        list.innerHTML = analyticsCard + historyCards;
    } catch (err) {
        showToast('Failed to fetch results', 'error');
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
        navigate(`#/exam/${id}`);

        // Setup timer if duration is provided
        if (exam.duration && typeof exam.duration === 'number') {
            startExamTimer(exam.duration, () => submitExam(id, exam.questions.length, true));
        } else {
            examTimerEl.textContent = '';
        }

        document.getElementById('submit-exam-btn').onclick = () => submitExam(id, exam.questions.length, false);
    } catch (err) {
        showToast('Error starting exam', 'error');
    }
}

function startExamTimer(durationMinutes, onTimeUp) {
    if (examTimerInterval) {
        clearInterval(examTimerInterval);
        examTimerInterval = null;
    }

    const endTime = Date.now() + durationMinutes * 60 * 1000;

    function update() {
        const remaining = endTime - Date.now();
        if (remaining <= 0) {
            clearInterval(examTimerInterval);
            examTimerInterval = null;
            examTimerEl.textContent = '00:00';
            onTimeUp && onTimeUp();
            return;
        }

        const totalSeconds = Math.floor(remaining / 1000);
        const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const secs = String(totalSeconds % 60).padStart(2, '0');
        examTimerEl.textContent = `${mins}:${secs}`;
    }

    update();
    examTimerInterval = setInterval(update, 1000);
}

async function submitExam(examId, qCount, isAuto = false) {
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
            if (examTimerInterval) {
                clearInterval(examTimerInterval);
                examTimerInterval = null;
            }
            showToast(`Exam submitted${isAuto ? ' (time up)' : ''}! Marks: ${data.marks}`, 'success');
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
                <div style="padding: 15px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
                    <div style="cursor: pointer;" onclick="viewStudentAnalytics('${r.student._id}')">
                        <strong>${r.student.name}</strong><br>
                        <small>${r.student.email}</small><br>
                        <small style="color: var(--primary); text-decoration: underline;">View analytics</small>
                    </div>
                    <div style="font-size: 1.2rem; font-weight: 800; color: var(--primary)">${r.marks}</div>
                </div>
            `).join('') : '<p>No submissions yet.</p>'}
        </div>
        <button class="btn btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 20px;">Close</button>
    `;
    document.getElementById('modal-overlay').classList.remove('hidden');
};

// Admin per-student analytics
window.viewStudentAnalytics = async (studentId) => {
    try {
        const res = await fetch(`${API_URL}/submit/student/${studentId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const results = await res.json();
        const content = document.getElementById('modal-content');

        if (!Array.isArray(results) || !results.length) {
            content.innerHTML = `
                <h2>Student Analytics</h2>
                <p style="margin-top: 20px;">No exams attempted by this student yet.</p>
                <button class="btn btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 20px;">Close</button>
            `;
            document.getElementById('modal-overlay').classList.remove('hidden');
            return;
        }

        // Assume all entries have the same student identity; use first result's populated path
        const studentName = results[0].student?.name || 'Student';
        const studentEmail = results[0].student?.email || '';

        // Sort by submittedAt
        results.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));

        const totalExams = results.length;
        const totalMarks = results.reduce((sum, r) => sum + (r.marks || 0), 0);
        const avgMarks = (totalMarks / totalExams).toFixed(2);
        const lastMarks = results[results.length - 1].marks || 0;
        const prevMarks = results.length > 1 ? results[results.length - 2].marks || 0 : null;

        let trendText = 'Not enough data';
        if (prevMarks !== null) {
            if (lastMarks > prevMarks) trendText = 'Improving';
            else if (lastMarks < prevMarks) trendText = 'Declining';
            else trendText = 'Stable';
        }

        const historyRows = results.map(r => `
            <tr>
                <td>${r.exam?.title || 'Exam'}</td>
                <td>${r.exam?.date ? new Date(r.exam.date).toLocaleDateString() : ''}</td>
                <td>${r.marks}</td>
                <td>${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''}</td>
            </tr>
        `).join('');

        content.innerHTML = `
            <h2>Student Analytics</h2>
            <p style="margin-top: 10px; color: var(--text-muted);">
                <strong>${studentName}</strong><br>
                <small>${studentEmail}</small>
            </p>
            <div class="glass-card" style="margin-top: 20px;">
                <h3>Performance Summary</h3>
                <p style="margin-top: 10px;">Total Exams: <strong>${totalExams}</strong></p>
                <p>Average Marks: <strong>${avgMarks}</strong></p>
                <p>Last Exam Marks: <strong>${lastMarks}</strong></p>
                <p>Trend: <strong>${trendText}</strong></p>
            </div>
            <h3 style="margin-top: 20px;">Exam History</h3>
            <div style="max-height: 250px; overflow-y: auto; margin-top: 10px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--glass-border);">Exam</th>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--glass-border);">Date</th>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--glass-border);">Marks</th>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--glass-border);">Submitted At</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyRows}
                    </tbody>
                </table>
            </div>
            <button class="btn btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 20px;">Close</button>
        `;

        document.getElementById('modal-overlay').classList.remove('hidden');
    } catch (err) {
        showToast('Failed to load student analytics', 'error');
    }
};

// Start
window.addEventListener('hashchange', handleRouteChange);
init();
