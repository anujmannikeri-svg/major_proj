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
                    <input type="number" id="exam-duration" min="1" required>
                </div>
            </div>
            <div style="display: flex; gap: 15px; margin-top: 10px;">
                <div class="input-group" style="flex: 1;">
                    <label>Max Attempts</label>
                    <input type="number" id="exam-max-attempts" min="1" value="1" required>
                </div>
                <div class="input-group" style="flex: 1;">
                    <label>Pass Marks</label>
                    <input type="number" id="exam-pass-marks" min="0" value="0" required>
                </div>
            </div>
            <div class="input-group" style="margin-top: 10px;">
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="exam-allow-resume" style="width:auto;">
                    Allow students to resume exam
                </label>
            </div>
            <div id="questions-edit" style="margin-top: 10px; max-height: 300px; overflow-y: auto;">
                <h4>Questions</h4>
                <div class="q-item" style="margin-bottom: 20px; padding: 10px; border: 1px dashed var(--glass-border);">
                   <input type="text" placeholder="Question Text" class="q-text" required style="margin-bottom: 10px;">
                   <div class="input-group" style="margin-bottom: 8px;">
                        <label>Question Type</label>
                        <select class="q-type">
                            <option value="MCQ">Multiple Choice</option>
                            <option value="TrueFalse">True / False</option>
                            <option value="ShortAnswer">Short Answer</option>
                        </select>
                   </div>
                   <div class="q-options-area">
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
                   <div class="q-short-answer-area" style="display:none; margin-top:8px;">
                       <input type="text" placeholder="Correct answer text" class="q-correct-text">
                   </div>
                   <div class="input-group" style="margin-top: 8px;">
                        <label>Marks</label>
                        <input type="number" class="q-marks" min="1" value="1">
                   </div>
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
        clone.querySelector('.q-type').value = 'MCQ';
        clone.querySelector('.q-marks').value = 1;
        clone.querySelector('.q-short-answer-area').style.display = 'none';
        clone.querySelector('.q-options-area').style.display = 'block';
        clone.querySelectorAll('.q-opt').forEach((i, idx) => {
            i.value = '';
            i.style.display = 'block';
            i.readOnly = false;
            i.required = idx < 2;
        });
        clone.querySelector('.q-correct').innerHTML = `
            <option value="0">Option 1 is correct</option>
            <option value="1">Option 2 is correct</option>
            <option value="2">Option 3 is correct</option>
            <option value="3">Option 4 is correct</option>
        `;
        clone.querySelector('.q-correct').value = '0';
        clone.querySelector('.q-correct-text').value = '';
        questionsEdit.appendChild(clone);
    });

    // Handle type-specific UI toggling
    questionsEdit.addEventListener('change', (e) => {
        if (!e.target.classList.contains('q-type')) return;
        const item = e.target.closest('.q-item');
        const type = e.target.value;
        const optionsArea = item.querySelector('.q-options-area');
        const shortArea = item.querySelector('.q-short-answer-area');
        const optionInputs = item.querySelectorAll('.q-opt');
        const correctSelect = item.querySelector('.q-correct');

        if (type === 'ShortAnswer') {
            optionsArea.style.display = 'none';
            shortArea.style.display = 'block';
            optionInputs.forEach(i => { i.required = false; });
        } else if (type === 'TrueFalse') {
            optionsArea.style.display = 'block';
            shortArea.style.display = 'none';
            // Hide option 3 and 4, show only True/False
            optionInputs.forEach((i, idx) => {
                if (idx < 2) {
                    i.style.display = 'block';
                    i.value = idx === 0 ? 'True' : 'False';
                    i.readOnly = true;
                    i.required = true;
                } else {
                    i.style.display = 'none';
                    i.required = false;
                }
            });
            // Update correct answer select to only show True/False
            correctSelect.innerHTML = `
                <option value="0">True is correct</option>
                <option value="1">False is correct</option>
            `;
            correctSelect.value = '0';
        } else {
            optionsArea.style.display = 'block';
            shortArea.style.display = 'none';
            optionInputs.forEach((i, idx) => {
                i.style.display = 'block';
                i.readOnly = false;
                if (idx < 2) {
                    i.required = true;
                } else {
                    i.required = false;
                }
            });
            // Restore correct answer select for MCQ
            correctSelect.innerHTML = `
                <option value="0">Option 1 is correct</option>
                <option value="1">Option 2 is correct</option>
                <option value="2">Option 3 is correct</option>
                <option value="3">Option 4 is correct</option>
            `;
            correctSelect.value = '0';
        }
    });

    document.getElementById('create-exam-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('exam-title').value;
        const date = document.getElementById('exam-date').value;
        const duration = document.getElementById('exam-duration').value;
        const maxAttempts = parseInt(document.getElementById('exam-max-attempts').value, 10) || 1;
        const passMarks = parseInt(document.getElementById('exam-pass-marks').value, 10) || 0;
        const allowResume = document.getElementById('exam-allow-resume').checked;
        const questions = [];

        questionsEdit.querySelectorAll('.q-item').forEach((item) => {
            const questionText = item.querySelector('.q-text').value.trim();
            const type = item.querySelector('.q-type').value;
            const marks = parseInt(item.querySelector('.q-marks').value, 10) || 1;

            if (!questionText) {
                return;
            }

            if (type === 'ShortAnswer') {
                const correctTextAnswer = item.querySelector('.q-correct-text').value.trim();
                if (!correctTextAnswer) return;
                questions.push({
                    questionText,
                    type,
                    options: [],
                    correctAnswer: null,
                    correctTextAnswer,
                    marks
                });
            } else if (type === 'TrueFalse') {
                const correctAnswer = parseInt(item.querySelector('.q-correct').value, 10);
                questions.push({
                    questionText,
                    type,
                    options: ['True', 'False'],
                    correctAnswer: isNaN(correctAnswer) ? 0 : correctAnswer,
                    marks
                });
            } else {
                const optionInputs = Array.from(item.querySelectorAll('.q-opt'));
                const options = optionInputs
                    .map((i) => i.value.trim())
                    .filter((v) => v.length > 0);

                if (options.length < 2) {
                    return;
                }

                let correctAnswer = parseInt(item.querySelector('.q-correct').value, 10);
                if (correctAnswer >= options.length || isNaN(correctAnswer)) {
                    correctAnswer = 0;
                }

                questions.push({
                    questionText,
                    type: 'MCQ',
                    options,
                    correctAnswer,
                    marks
                });
            }
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
            body: JSON.stringify({ title, date, duration, maxAttempts, passMarks, allowResume, questions })
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
        
        // Fetch attempt status for each exam
        const examCards = await Promise.all(exams.map(async (exam) => {
            try {
                const statusRes = await fetch(`${API_URL}/exams/exam-status/${exam._id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const status = await statusRes.json();
                const canAttempt = status.canAttempt !== false;
                const remaining = status.remainingAttempts || 0;
                
                return `
                    <div class="glass-card exam-card">
                        <h3>${exam.title}</h3>
                        <p>${exam.duration} Minutes</p>
                        <p style="color: var(--text-muted); font-size: 0.9rem;">${new Date(exam.date).toLocaleDateString()}</p>
                        <p style="color: var(--text-muted); font-size: 0.8rem;">
                            Max Attempts: ${exam.maxAttempts || 1} | Pass Marks: ${exam.passMarks || 0}
                        </p>
                        <p style="color: ${remaining > 0 ? 'var(--success)' : 'var(--error)'}; font-size: 0.85rem; font-weight: 600;">
                            ${remaining > 0 ? `Remaining Attempts: ${remaining}` : 'No attempts remaining'}
                        </p>
                        <button class="btn btn-primary" style="margin-top: 15px; width: 100%;" 
                                onclick="startExam('${exam._id}')" 
                                ${!canAttempt ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                            ${canAttempt ? 'Take Exam' : 'Max Attempts Reached'}
                        </button>
                    </div>
                `;
            } catch {
                // Fallback if status check fails
                return `
                    <div class="glass-card exam-card">
                        <h3>${exam.title}</h3>
                        <p>${exam.duration} Minutes</p>
                        <p style="color: var(--text-muted); font-size: 0.9rem;">${new Date(exam.date).toLocaleDateString()}</p>
                        <p style="color: var(--text-muted); font-size: 0.8rem;">
                            Max Attempts: ${exam.maxAttempts || 1} | Pass Marks: ${exam.passMarks || 0}
                        </p>
                        <button class="btn btn-primary" style="margin-top: 15px; width: 100%;" onclick="startExam('${exam._id}')">Take Exam</button>
                    </div>
                `;
            }
        }));
        
        list.innerHTML = examCards.join('');
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

        // Prepare chart data for student's own performance
        const chartLabels = results.map((r, idx) => {
            const examTitle = r.exam?.title || 'Exam';
            return `${examTitle.substring(0, 15)}${examTitle.length > 15 ? '...' : ''}`;
        });
        const chartMarks = results.map(r => r.marks || 0);
        const chartPassMarks = results.map(r => r.exam?.passMarks || 0);
        const chartId = 'student-performance-chart-' + Date.now();

        const historyCards = results.map(r => {
            const passMarks = r.exam?.passMarks ?? 0;
            const passed = (r.marks || 0) >= passMarks;
            const attempt = r.attempt || 1;
            return `
            <div class="glass-card exam-card">
                <h3>${r.exam?.title || 'Exam'}</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem;">
                    ${r.exam?.date ? new Date(r.exam.date).toLocaleDateString() : ''}
                    <span style="margin-left: 10px; font-weight: 600;">Attempt #${attempt}</span>
                </p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <span style="font-weight: 700; color: var(--primary); font-size: 1.2rem;">${r.marks}</span>
                    <span style="font-size: 0.85rem; font-weight: 600; color: ${passed ? 'var(--success)' : 'var(--error)'};">
                        ${passed ? 'Passed' : 'Failed'} (Pass: ${passMarks})
                    </span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">
                        ${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''}
                    </span>
                </div>
            </div>
        `;
        }).join('');

        const chartCard = `
            <div class="glass-card" style="margin-bottom: 20px; padding: 15px;">
                <h3>Performance Trend</h3>
                <canvas id="${chartId}" style="max-height: 250px;"></canvas>
            </div>
        `;

        list.innerHTML = analyticsCard + chartCard + historyCards;

        // Render performance chart
        setTimeout(() => {
            const ctx = document.getElementById(chartId);
            if (ctx) {
                new Chart(ctx.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            label: 'Your Marks',
                            data: chartMarks,
                            borderColor: 'rgb(99, 102, 241)',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            tension: 0.4,
                            fill: true
                        }, {
                            label: 'Pass Marks',
                            data: chartPassMarks,
                            borderColor: 'rgb(239, 68, 68)',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            borderDash: [5, 5],
                            fill: false
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        },
                        plugins: {
                            legend: { position: 'top' }
                        }
                    }
                });
            }
        }, 100);
    } catch (err) {
        showToast('Failed to fetch results', 'error');
    }
}

async function startExam(id) {
    try {
        // Check remaining attempts first
        const statusRes = await fetch(`${API_URL}/exams/exam-status/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const status = await statusRes.json();
        
        if (!status.canAttempt) {
            showToast(`Maximum attempts reached for this exam (${status.maxAttempts} attempts)`, 'error');
            return;
        }

        const res = await fetch(`${API_URL}/exams/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const exam = await res.json();

        document.getElementById('student-dashboard').classList.add('hidden');
        document.getElementById('exam-taking-view').classList.remove('hidden');
        document.getElementById('current-exam-title').innerText = exam.title;

        // Randomize question order while preserving original index
        const questionsWithIndex = exam.questions.map((q, index) => ({ ...q, _originalIndex: index }));
        for (let i = questionsWithIndex.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questionsWithIndex[i], questionsWithIndex[j]] = [questionsWithIndex[j], questionsWithIndex[i]];
        }

        const container = document.getElementById('questions-container');
        container.innerHTML = questionsWithIndex.map((q, displayIndex) => {
            const originalIndex = q._originalIndex;
            const type = q.type || 'MCQ';

            if (type === 'ShortAnswer') {
                return `
                    <div style="margin-bottom: 25px;">
                        <p style="font-weight: 600; margin-bottom: 12px;">${displayIndex + 1}. ${q.questionText}</p>
                        <input type="text" name="q${originalIndex}" class="short-answer-input" style="width:100%; padding:8px; border-radius:6px; border:1px solid var(--glass-border);">
                    </div>
                `;
            }

            const optionsHtml = (q.options || []).map((opt, oIndex) => `
                <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                    <input type="radio" name="q${originalIndex}" value="${oIndex}" style="width: auto; margin-right: 10px;">
                    ${opt}
                </label>
            `).join('');

            return `
                <div style="margin-bottom: 25px;">
                    <p style="font-weight: 600; margin-bottom: 12px;">${displayIndex + 1}. ${q.questionText}</p>
                    ${optionsHtml}
                </div>
            `;
        }).join('');

        navigate(`#/exam/${id}`);

        const storageKey = getExamStorageKey(user.id, id);
        const savedStateRaw = localStorage.getItem(storageKey);
        let savedState = null;
        if (savedStateRaw && exam.allowResume) {
            try {
                savedState = JSON.parse(savedStateRaw);
            } catch {
                savedState = null;
            }
        }

        let endTime = null;
        if (exam.duration && typeof exam.duration === 'number') {
            const now = Date.now();
            if (savedState && savedState.endTime && savedState.endTime > now) {
                endTime = savedState.endTime;
            } else {
                endTime = now + exam.duration * 60 * 1000;
            }
            startExamTimerWithEndTime(endTime, () => submitExam(id, exam.questions.length, true));
        } else {
            examTimerEl.textContent = '';
        }

        // Restore saved answers if allowed
        if (savedState && Array.isArray(savedState.answers)) {
            savedState.answers.forEach((ans, idx) => {
                const name = `q${idx}`;
                if (typeof ans === 'string') {
                    const input = document.querySelector(`input[name="${name}"].short-answer-input`);
                    if (input) input.value = ans;
                } else {
                    const radio = document.querySelector(`input[name="${name}"][value="${ans}"]`);
                    if (radio) radio.checked = true;
                }
            });
        }

        // Auto-save on change
        container.addEventListener('change', () => {
            saveExamState(storageKey, exam.questions.length, endTime);
        });
        container.addEventListener('input', () => {
            saveExamState(storageKey, exam.questions.length, endTime);
        });

        document.getElementById('submit-exam-btn').onclick = () => submitExam(id, exam.questions.length, false);
    } catch (err) {
        showToast('Error starting exam', 'error');
    }
}

function getExamStorageKey(studentId, examId) {
    return `exam_state_${studentId}_${examId}`;
}

function saveExamState(storageKey, qCount, endTime) {
    const answers = [];
    for (let i = 0; i < qCount; i++) {
        const name = `q${i}`;
        const shortInput = document.querySelector(`input[name="${name}"].short-answer-input`);
        if (shortInput) {
            answers.push(shortInput.value || '');
        } else {
            const selected = document.querySelector(`input[name="${name}"]:checked`);
            answers.push(selected ? parseInt(selected.value, 10) : -1);
        }
    }

    const state = {
        answers,
        endTime
    };
    localStorage.setItem(storageKey, JSON.stringify(state));
}

function clearExamState(storageKey) {
    localStorage.removeItem(storageKey);
}

function startExamTimerWithEndTime(endTime, onTimeUp) {
    if (examTimerInterval) {
        clearInterval(examTimerInterval);
        examTimerInterval = null;
    }

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
        const name = `q${i}`;
        const shortInput = document.querySelector(`input[name="${name}"].short-answer-input`);
        if (shortInput) {
            answers.push(shortInput.value || '');
        } else {
            const selected = document.querySelector(`input[name="${name}"]:checked`);
            answers.push(selected ? parseInt(selected.value, 10) : -1);
        }
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
            const storageKey = getExamStorageKey(user.id, examId);
            clearExamState(storageKey);
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
    const examRes = await fetch(`${API_URL}/exams/${examId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const exam = await examRes.json();
    const content = document.getElementById('modal-content');

    if (!results.length) {
        content.innerHTML = `
            <h2>Exam Results</h2>
            <p style="margin-top: 20px;">No submissions yet.</p>
            <button class="btn btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 20px;">Close</button>
        `;
        document.getElementById('modal-overlay').classList.remove('hidden');
        return;
    }

    const passMarks = exam.passMarks || 0;
    const passed = results.filter(r => (r.marks || 0) >= passMarks).length;
    const failed = results.length - passed;
    const marksData = results.map(r => r.marks || 0);
    const avgMarks = (marksData.reduce((a, b) => a + b, 0) / marksData.length).toFixed(2);
    const maxMarks = Math.max(...marksData);
    const minMarks = Math.min(...marksData);

    // Create bins for distribution
    const bins = [0, 0, 0, 0, 0]; // 0-20, 21-40, 41-60, 61-80, 81-100
    marksData.forEach(m => {
        if (m <= 20) bins[0]++;
        else if (m <= 40) bins[1]++;
        else if (m <= 60) bins[2]++;
        else if (m <= 80) bins[3]++;
        else bins[4]++;
    });

    const chartId = 'exam-results-chart-' + Date.now();
    const pieChartId = 'exam-pie-chart-' + Date.now();

    content.innerHTML = `
        <h2>Exam Results - ${exam.title}</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
            <div class="glass-card" style="padding: 15px;">
                <h4>Statistics</h4>
                <p>Total Submissions: <strong>${results.length}</strong></p>
                <p>Average Marks: <strong>${avgMarks}</strong></p>
                <p>Highest: <strong>${maxMarks}</strong></p>
                <p>Lowest: <strong>${minMarks}</strong></p>
                <p>Passed: <strong style="color: var(--success);">${passed}</strong></p>
                <p>Failed: <strong style="color: var(--error);">${failed}</strong></p>
            </div>
            <div class="glass-card" style="padding: 15px;">
                <h4>Pass/Fail Distribution</h4>
                <canvas id="${pieChartId}" style="max-height: 200px;"></canvas>
            </div>
        </div>
        <div class="glass-card" style="padding: 15px; margin-top: 15px;">
            <h4>Marks Distribution</h4>
            <canvas id="${chartId}" style="max-height: 250px;"></canvas>
        </div>
        <div style="margin-top: 20px; max-height: 300px; overflow-y: auto;">
            ${results.map(r => `
                <div style="padding: 15px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
                    <div style="cursor: pointer;" onclick="viewStudentAnalytics('${r.student._id}')">
                        <strong>${r.student.name}</strong><br>
                        <small>${r.student.email}</small><br>
                        <small style="color: var(--primary); text-decoration: underline;">View analytics</small>
                    </div>
                    <div>
                        <div style="font-size: 1.2rem; font-weight: 800; color: var(--primary); text-align: right;">${r.marks}</div>
                        <div style="font-size: 0.8rem; color: ${(r.marks || 0) >= passMarks ? 'var(--success)' : 'var(--error)'};">
                            ${(r.marks || 0) >= passMarks ? 'Passed' : 'Failed'}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
        <button class="btn btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 20px;">Close</button>
    `;
    document.getElementById('modal-overlay').classList.remove('hidden');

    // Render charts
    setTimeout(() => {
        // Pass/Fail Pie Chart
        const pieCtx = document.getElementById(pieChartId).getContext('2d');
        new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: ['Passed', 'Failed'],
                datasets: [{
                    data: [passed, failed],
                    backgroundColor: ['#4ade80', '#f87171']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });

        // Marks Distribution Bar Chart
        const barCtx = document.getElementById(chartId).getContext('2d');
        new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['0-20', '21-40', '41-60', '61-80', '81-100'],
                datasets: [{
                    label: 'Number of Students',
                    data: bins,
                    backgroundColor: 'rgba(99, 102, 241, 0.6)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }, 100);
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

        const historyRows = results.map(r => {
            const passMarks = r.exam?.passMarks || 0;
            const passed = (r.marks || 0) >= passMarks;
            return `
            <tr>
                <td>${r.exam?.title || 'Exam'}</td>
                <td>${r.exam?.date ? new Date(r.exam.date).toLocaleDateString() : ''}</td>
                <td><strong>${r.marks}</strong> <span style="color: ${passed ? 'var(--success)' : 'var(--error)'}; font-size: 0.8rem;">(${passed ? 'Pass' : 'Fail'})</span></td>
                <td>${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''}</td>
            </tr>
        `;
        }).join('');

        // Prepare chart data
        const chartLabels = results.map((r, idx) => `Exam ${idx + 1}`);
        const chartMarks = results.map(r => r.marks || 0);
        const chartPassMarks = results.map(r => r.exam?.passMarks || 0);
        const chartId = 'student-chart-' + Date.now();

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
            <div class="glass-card" style="margin-top: 20px; padding: 15px;">
                <h3>Performance Trend</h3>
                <canvas id="${chartId}" style="max-height: 300px;"></canvas>
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

        // Render performance trend chart
        setTimeout(() => {
            const ctx = document.getElementById(chartId).getContext('2d');
            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Student Marks',
                        data: chartMarks,
                        borderColor: 'rgb(99, 102, 241)',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        tension: 0.4,
                        fill: true
                    }, {
                        label: 'Pass Marks',
                        data: chartPassMarks,
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderDash: [5, 5],
                        fill: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    },
                    plugins: {
                        legend: { position: 'top' }
                    }
                }
            });
        }, 100);

        document.getElementById('modal-overlay').classList.remove('hidden');
    } catch (err) {
        showToast('Failed to load student analytics', 'error');
    }
};

// Start
window.addEventListener('hashchange', handleRouteChange);
init();
