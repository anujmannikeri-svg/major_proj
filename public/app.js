const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'http://localhost:8080' 
    : 'https://major-proj-adz6.onrender.com';
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user'));
let cachedShareBaseUrl = null;

/** Minimum % of total marks to pass (matches server: passPercentage or legacy passMarks/total). */
function effectivePassPercent(exam) {
    if (!exam) return 40;
    const p = exam.passPercentage;
    if (typeof p === 'number' && !Number.isNaN(p)) {
        return Math.min(100, Math.max(0, p));
    }
    const total = Number(exam.totalMarks) || 0;
    if (total > 0 && typeof exam.passMarks === 'number' && !Number.isNaN(exam.passMarks)) {
        return Math.min(100, Math.max(0, (exam.passMarks / total) * 100));
    }
    return 40;
}

function studentScorePercent(marks, totalPossible) {
    const t = Number(totalPossible) || 0;
    if (t <= 0) return 0;
    return Math.min(100, Math.max(0, ((Number(marks) || 0) / t) * 100));
}

function studentPassed(marks, exam) {
    return studentScorePercent(marks, exam.totalMarks) >= effectivePassPercent(exam);
}

function todayDateInputValue() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function isLocalHostName(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

async function resolveShareBaseUrl() {
    return 'https://major-proj-six.vercel.app';
}

// DOM Elements
const landingView = document.getElementById('landing-view');
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
const forgotPasswordBtn = document.getElementById('forgot-password-btn');

const adminDashboard = document.getElementById('admin-dashboard');
const studentDashboard = document.getElementById('student-dashboard');
const examTakingView = document.getElementById('exam-taking-view');
const examTimerEl = document.getElementById('exam-timer');

let isLogin = true;
let examTimerInterval = null;
let examCameraStream = null;
let mediaRecorder = null;
let mediaRecorderChunks = [];
let recordedExamVideoBlob = null;
let submitInProgress = false;
const PENDING_EXAM_KEY = 'pendingExamId';
const expertApprovalPanel = document.getElementById('expert-approval-panel');
const expertApprovalList = document.getElementById('expert-approval-list');
const passwordResetApprovalPanel = document.getElementById('password-reset-approval-panel');
const passwordResetApprovalList = document.getElementById('password-reset-approval-list');

// Simple hash-based routing helper
function navigate(hash) {
    if (location.hash !== hash) {
        location.hash = hash;
    } else {
        handleRouteChange();
    }
}

function setAuthMode(mode) {
    isLogin = mode !== 'signup';
    authTitle.innerText = isLogin ? 'Login' : 'Sign Up';
    authSubtitle.innerText = isLogin ? 'Welcome back! Please enter your details.' : 'Join us and start your journey.';
    nameGroup.classList.toggle('hidden', isLogin);
    roleGroup.classList.toggle('hidden', isLogin);
    if (forgotPasswordBtn) {
        forgotPasswordBtn.classList.toggle('hidden', !isLogin);
    }
    document.getElementById('toggle-text').innerHTML = isLogin ?
        'Don\'t have an account? <span id="switch-auth">Sign Up</span>' :
        'Already have an account? <span id="switch-auth">Login</span>';
    // Re-bind because innerHTML destroys old elements
    document.getElementById('switch-auth').addEventListener('click', () => switchAuth.click());
}

// Initialize
function init() {
    if (token && user) {
        showDashboard();
        if (!location.hash) {
            if (user.role === 'Admin' || user.role === 'Expert') {
                navigate('#/admin');
            } else {
                navigate('#/student');
            }
        } else {
            handleRouteChange();
        }
    } else {
        if (!location.hash || location.hash === '#/admin' || location.hash === '#/student') {
            navigate('#/');
        } else {
            handleRouteChange();
        }
    }
}

// UI Switching
function showLanding() {
    landingView?.classList.remove('hidden');
    authView.classList.add('hidden');
    appView.classList.add('hidden');
}

function showAuth() {
    landingView?.classList.add('hidden');
    authView.classList.remove('hidden');
    appView.classList.add('hidden');
}

function showDashboard() {
    landingView?.classList.add('hidden');
    authView.classList.add('hidden');
    appView.classList.remove('hidden');
    userDisplay.innerText = `Hello, ${user.name} (${user.role})`;

    if (user.role === 'Admin' || user.role === 'Expert') {
        adminDashboard.classList.remove('hidden');
        studentDashboard.classList.add('hidden');
        examTakingView.classList.add('hidden');
        if (user.role !== 'Admin') {
            expertApprovalPanel?.classList.add('hidden');
            passwordResetApprovalPanel?.classList.add('hidden');
        }
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
        const hash = location.hash || '#/';
        if (hash.startsWith('#/exam/')) {
            const examId = hash.replace('#/exam/', '').trim();
            if (examId) {
                localStorage.setItem(PENDING_EXAM_KEY, examId);
                showAuth();
                setAuthMode('login');
                navigate('#/auth');
                return;
            }
        }
        if (hash === '#/auth' || hash === '#/auth/signup') {
            showAuth();
            setAuthMode(hash === '#/auth/signup' ? 'signup' : 'login');
        } else {
            showLanding();
        }
        return;
    }

    const hash = location.hash || '';

    if (user.role === 'Admin' || user.role === 'Expert') {
        adminDashboard.classList.remove('hidden');
        studentDashboard.classList.add('hidden');
        examTakingView.classList.add('hidden');
        // For Expert, keep same main view but route name doesn't matter for hash
        if (hash === '#/auth') {
            navigate('#/admin');
        }
        return;
    }

    // Student routes
    if (hash.startsWith('#/exam/')) {
        const examId = hash.replace('#/exam/', '').trim();
        if (examId) {
            startExam(examId, true);
            return;
        }
        adminDashboard.classList.add('hidden');
        studentDashboard.classList.remove('hidden');
        examTakingView.classList.add('hidden');
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
    setAuthMode(isLogin ? 'signup' : 'login');
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
            if (data.token) {
                token = data.token;
                user = data.user;
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));
                showDashboard();
                const pendingExamId = localStorage.getItem(PENDING_EXAM_KEY);
                if (user.role === 'Student' && pendingExamId) {
                    localStorage.removeItem(PENDING_EXAM_KEY);
                    navigate(`#/exam/${pendingExamId}`);
                } else {
                    navigate(user.role === 'Admin' ? '#/admin' : '#/student');
                }
                showToast('Success!', 'success');
            } else {
                // For Expert signup, backend returns requiresApproval with no token yet.
                showToast(data.message || 'Request received. Please wait for admin approval.', 'success');
                setAuthMode('login');
            }
        } else {
            showToast(data.message || 'Error occurred', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    }
});

if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener('click', () => openForgotPasswordModal());
}

logoutBtn.addEventListener('click', () => {
    localStorage.clear();
    location.reload();
});

// Landing CTAs
const landingLoginBtn = document.getElementById('landing-login');
const landingSignupBtn = document.getElementById('landing-signup');
const heroStartBtn = document.getElementById('hero-start');
const heroDemoBtn = document.getElementById('hero-demo');

[landingLoginBtn, heroDemoBtn].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
        navigate('#/auth');
        showAuth();
        setAuthMode('login');
    });
});

[landingSignupBtn, heroStartBtn].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
        navigate('#/auth/signup');
        showAuth();
        setAuthMode('signup');
    });
});

// Admin Functions
async function fetchExamsAdmin() {
    try {
        const res = await fetch(`${API_URL}/exams`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        let exams = await res.json();
        
        if (user && user.role === 'Expert') {
            exams = exams.filter(exam => exam.createdBy === user.id || exam.createdBy === user._id);
        }

        const list = document.getElementById('admin-exam-list');
        list.innerHTML = exams.map(exam => {
            const isExpert = exam.moduleType === 'Expert';
            const approvedLabel = isExpert
                ? `<span style="font-size:0.8rem; color:${exam.isApproved ? 'var(--success)' : 'var(--error)'};">
                        ${exam.isApproved ? 'Approved' : 'Waiting for admin approval'}
                   </span>`
                : '';

            const canManage = user.role === 'Admin';
            // Admins can edit any exam (expert papers are Expert module; older rows may lack moduleType).
            const canEditQuestions = canManage;
            const canApprove = canManage && isExpert && !exam.isApproved;

            return `
            <div class="glass-card exam-card">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                    <div>
                        <h3>${exam.title}</h3>
                        <p style="color: var(--text-muted); margin-top: 4px; font-size: 0.85rem;">
                            ${new Date(exam.date).toLocaleDateString()} · ${exam.duration} mins
                        </p>
                        ${isExpert ? `<span class="badge badge-expert">Expert module</span>` : ''}
                        ${approvedLabel}
                    </div>
                </div>
                <div style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                    ${canManage ? `<button class="btn btn-primary" onclick="viewResults('${exam._id}')">Results</button>` : ''}
                    ${canManage ? `<button class="btn btn-ghost" type="button" onclick="shareExamLink('${exam._id}', '${exam.title.replace(/'/g, "\\'")}')">Share link</button>` : ''}
                    ${canEditQuestions ? `<button class="btn btn-ghost" onclick="editExam('${exam._id}')">Edit Questions</button>` : ''}
                    ${canApprove ? `<button class="btn btn-ghost" onclick="approveExam('${exam._id}')">Submit Corrections</button>` : ''}
                    ${canManage ? `<button class="btn" style="background: var(--error); color: white;" onclick="deleteExam('${exam._id}')">Delete</button>` : ''}
                </div>
            </div>
        `;
        }).join('');

        // Load pending expert login approvals (Admin only)
        if (user.role === 'Admin') {
            fetchPendingExperts();
            fetchPendingPasswordResets();
        }
    } catch (err) {
        showToast('Failed to fetch exams', 'error');
    }
}

async function fetchPendingExperts() {
    try {
        if (!expertApprovalList || !expertApprovalPanel) return;
        if (user.role !== 'Admin') return;

        const res = await fetch(`${API_URL}/auth/experts/pending`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const experts = await res.json();

        if (!experts || !experts.length) {
            expertApprovalPanel.classList.add('hidden');
            expertApprovalList.innerHTML = '';
            return;
        }

        expertApprovalPanel.classList.remove('hidden');
        expertApprovalList.innerHTML = experts.map(expert => `
            <div class="glass-card" style="padding: 14px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <div>
                    <div style="font-weight: 800;">${expert.name}</div>
                    <div style="color: var(--text-muted); font-size: 0.85rem;">${expert.email}</div>
                </div>
                <button class="btn btn-primary" onclick="approveExpert('${expert._id}')">Approve</button>
            </div>
        `).join('');
    } catch (e) {
        // Non-blocking UI
    }
}

async function fetchPendingPasswordResets() {
    try {
        if (!passwordResetApprovalList || !passwordResetApprovalPanel) return;
        if (user.role !== 'Admin') return;

        const res = await fetch(`${API_URL}/auth/password-resets/pending`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const requests = await res.json();

        if (!requests || !requests.length) {
            passwordResetApprovalPanel.classList.add('hidden');
            passwordResetApprovalList.innerHTML = '';
            return;
        }

        passwordResetApprovalPanel.classList.remove('hidden');
        passwordResetApprovalList.innerHTML = requests.map((reqItem) => `
            <div class="glass-card" style="padding: 14px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                <div>
                    <div style="font-weight: 800;">${reqItem.name}</div>
                    <div style="color: var(--text-muted); font-size: 0.85rem;">${reqItem.email}</div>
                    <div style="color: var(--text-muted); font-size: 0.8rem;">Role: ${reqItem.role}</div>
                </div>
                <button class="btn btn-primary" onclick="approvePasswordReset('${reqItem._id}')">Approve Reset</button>
            </div>
        `).join('');
    } catch (e) {
        // Non-blocking UI
    }
}

function openForgotPasswordModal() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = `
        <h2>Forgot Password</h2>
        <p style="color: var(--text-muted); margin-top: 8px; font-size: 0.9rem;">Student/Expert password reset needs admin approval first.</p>
        <form id="reset-request-form" style="margin-top: 16px;">
            <div class="input-group">
                <label>Email</label>
                <input type="email" id="reset-request-email" required placeholder="name@company.com">
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Request Admin Approval</button>
        </form>
        <hr style="margin:16px 0; border-color: var(--glass-border);">
        <form id="reset-confirm-form">
            <div class="input-group">
                <label>Email</label>
                <input type="email" id="reset-confirm-email" required placeholder="name@company.com">
            </div>
            <div class="input-group">
                <label>New Password</label>
                <input type="password" id="reset-confirm-password" required minlength="6" placeholder="At least 6 characters">
            </div>
            <button type="submit" class="btn btn-ghost" style="width: 100%;">Set New Password (After Approval)</button>
        </form>
        <button type="button" class="btn" onclick="closeModal()" style="width: 100%; margin-top: 10px;">Close</button>
    `;
    overlay.classList.remove('hidden');

    document.getElementById('reset-request-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-request-email').value.trim();
        const res = await fetch(`${API_URL}/auth/password-reset/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json().catch(() => ({}));
        showToast(data.message || (res.ok ? 'Request sent' : 'Request failed'), res.ok ? 'success' : 'error');
    });

    document.getElementById('reset-confirm-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-confirm-email').value.trim();
        const newPassword = document.getElementById('reset-confirm-password').value;
        const res = await fetch(`${API_URL}/auth/password-reset/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, newPassword })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            showToast(data.message || 'Password updated successfully', 'success');
            closeModal();
            setAuthMode('login');
            navigate('#/auth');
        } else {
            showToast(data.message || 'Password reset failed', 'error');
        }
    });
}

// Create Exam Modal
document.getElementById('create-exam-btn').addEventListener('click', () => {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = `
        <h2>Create New Exam</h2>
        <form id="create-exam-form" style="margin-top: 20px;">
            <div class="input-group">
                <label>Module Type</label>
                <select id="exam-module-type">
                    <option value="Regular">Standard Module</option>
                    <option value="Expert">Expert Module</option>
                </select>
            </div>
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
                    <label>Pass percentage (%)</label>
                    <input type="number" id="exam-pass-percentage" min="0" max="100" value="40" required title="Minimum score as a percent of total marks">
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
    const minAllowedDate = todayDateInputValue();
    const createDateInput = document.getElementById('exam-date');
    createDateInput.min = minAllowedDate;
    if (!createDateInput.value) createDateInput.value = minAllowedDate;

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
        const moduleType = document.getElementById('exam-module-type').value || 'Regular';
        const title = document.getElementById('exam-title').value;
        const date = document.getElementById('exam-date').value;
        if (date < todayDateInputValue()) {
            showToast('Exam date cannot be in the past.', 'error');
            return;
        }
        const duration = document.getElementById('exam-duration').value;
        const maxAttempts = parseInt(document.getElementById('exam-max-attempts').value, 10) || 1;
        const passPercentage = Math.min(100, Math.max(0, parseInt(document.getElementById('exam-pass-percentage').value, 10) || 40));
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
            body: JSON.stringify({ title, date, duration, maxAttempts, passPercentage, allowResume, questions, moduleType })
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
                const isExpert = exam.moduleType === 'Expert';
                
                return `
                    <div class="glass-card exam-card">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                            <div>
                                <h3>${exam.title}</h3>
                                <p style="color: var(--text-muted); font-size: 0.9rem; margin-top:4px;">
                                    ${exam.duration} Minutes · ${new Date(exam.date).toLocaleDateString()}
                                </p>
                                <p style="color: var(--text-muted); font-size: 0.8rem; margin-top:2px;">
                                    Max Attempts: ${exam.maxAttempts || 1} | Pass: ${effectivePassPercent(exam).toFixed(0)}% of total
                                </p>
                                ${isExpert ? `<span class="badge badge-expert" style="margin-top:6px; display:inline-block;">Expert module</span>` : ''}
                            </div>
                        </div>
                        <p style="color: ${remaining > 0 ? 'var(--success)' : 'var(--error)'}; font-size: 0.85rem; font-weight: 600; margin-top:10px;">
                            ${remaining > 0 ? `Remaining Attempts: ${remaining}` : 'No attempts remaining'}
                        </p>
                        <button class="btn btn-primary" style="margin-top: 12px; width: 100%;" 
                                onclick="startExam('${exam._id}')" 
                                ${!canAttempt ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
                            ${canAttempt ? 'Take Exam' : 'Max Attempts Reached'}
                        </button>
                    </div>
                `;
            } catch {
                // Fallback if status check fails
                const isExpert = exam.moduleType === 'Expert';
                return `
                    <div class="glass-card exam-card">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                            <div>
                                <h3>${exam.title}</h3>
                                <p style="color: var(--text-muted); font-size: 0.9rem; margin-top:4px;">
                                    ${exam.duration} Minutes · ${new Date(exam.date).toLocaleDateString()}
                                </p>
                                <p style="color: var(--text-muted); font-size: 0.8rem; margin-top:2px;">
                                    Max Attempts: ${exam.maxAttempts || 1} | Pass: ${effectivePassPercent(exam).toFixed(0)}% of total
                                </p>
                                ${isExpert ? `<span class="badge badge-expert" style="margin-top:6px; display:inline-block;">Expert module</span>` : ''}
                            </div>
                        </div>
                        <button class="btn btn-primary" style="margin-top: 12px; width: 100%;" onclick="startExam('${exam._id}')">Take Exam</button>
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
        const totalPossibleMarks = results.reduce((sum, r) => sum + (r.exam?.totalMarks || 0), 0);
        const avgPercent = totalPossibleMarks ? ((totalMarks / totalPossibleMarks) * 100).toFixed(2) : '0.00';
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
                <p>Average Percentage: <strong>${avgPercent}%</strong></p>
                <p>Last Exam Marks: <strong>${lastMarks}</strong></p>
                <p>Trend: <strong>${trendText}</strong></p>
            </div>
        `;

        // Prepare chart data for student's own performance
        const chartLabels = results.map((r, idx) => {
            const examTitle = r.exam?.title || 'Exam';
            return `${examTitle.substring(0, 15)}${examTitle.length > 15 ? '...' : ''}`;
        });
        const chartScorePercents = results.map((r) => studentScorePercent(r.marks, r.exam?.totalMarks));
        const chartPassPercents = results.map((r) => effectivePassPercent(r.exam));
        const chartId = 'student-performance-chart-' + Date.now();

        const historyCards = results.map(r => {
            const totalPossible = r.exam?.totalMarks || 0;
            const passed = studentPassed(r.marks, r.exam);
            const percent = totalPossible ? studentScorePercent(r.marks, totalPossible).toFixed(2) : '0.00';
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
                        ${passed ? 'Passed' : 'Failed'} (${percent}%)
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
                            label: 'Your score %',
                            data: chartScorePercents,
                            borderColor: 'rgb(99, 102, 241)',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            tension: 0.4,
                            fill: true
                        }, {
                            label: 'Pass %',
                            data: chartPassPercents,
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
                                beginAtZero: true,
                                max: 100
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

async function startExam(id, fromRoute = false) {
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

        // Start camera for verification (best-effort)
        startExamCamera();

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

        if (!fromRoute) {
            navigate(`#/exam/${id}`);
        }

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

        submitInProgress = false;
        const submitBtn = document.getElementById('submit-exam-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.onclick = () => submitExam(id, exam.questions.length, false);
        }
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
    if (submitInProgress) return;
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

    submitInProgress = true;
    const submitBtn = document.getElementById('submit-exam-btn');
    const originalBtnText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.7';
        submitBtn.textContent = isAuto ? 'Submitting...' : 'Submitting...';
    }

    let recordedVideoBlob = null;
    let submissionSucceeded = false;

    try {
        // Stop recording first so we can upload the final chunk
        recordedVideoBlob = await stopExamRecording();

        // Stop camera tracks (frees the webcam ASAP)
        stopExamCamera();

        if (!recordedVideoBlob) {
            showToast('Video recording failed. Please re-check camera permissions.', 'error');
            submitInProgress = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.textContent = originalBtnText || 'Submit Exam';
            }
            return;
        }

        const formData = new FormData();
        formData.append('answers', JSON.stringify(answers));
        const ext = (recordedVideoBlob.type && recordedVideoBlob.type.includes('mp4')) ? 'mp4' : 'webm';
        formData.append('video', recordedVideoBlob, `exam_${examId}_${Date.now()}.${ext}`);

        const res = await fetch(`${API_URL}/submit/${examId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (res.ok) {
            submissionSucceeded = true;
            if (examTimerInterval) {
                clearInterval(examTimerInterval);
                examTimerInterval = null;
            }
            const storageKey = getExamStorageKey(user.id, examId);
            clearExamState(storageKey);
            const passLabel = typeof data.passed === 'boolean' ? (data.passed ? 'Passed' : 'Not passed') : '';
            showToast(
                `Exam submitted${isAuto ? ' (time up)' : ''}! Marks: ${data.marks}${passLabel ? ` · ${passLabel}` : ''}`,
                'success'
            );
            if (data.passed && data._id) {
                setTimeout(() => {
                    downloadCertificatePdf(data._id).catch(() => {
                        showToast('Exam passed, but certificate download failed.', 'error');
                    });
                }, 200);
            }
            setTimeout(() => {
                submitInProgress = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.style.opacity = '1';
                    submitBtn.textContent = originalBtnText || 'Submit Exam';
                }
                navigate('#/student');
                fetchExamsStudent();
            }, 1000);
            return;
        } else {
            showToast(data.message, 'error');
        }
    } catch (err) {
        showToast('Submission failed', 'error');
    } finally {
        if (submissionSucceeded) return;
        if (submitBtn) {
            submitInProgress = false;
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.textContent = originalBtnText || 'Submit Exam';
        }
    }
}

async function downloadCertificatePdf(submissionId) {
    const res = await fetch(`${API_URL}/submit/certificate/${submissionId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Certificate download failed');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificate_${submissionId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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

// WhatsApp share helper for admins
// (helper retained for future use – not shown on main page)
window.shareExamWhatsApp = (examId, title) => {
    shareExamLink(examId, title);
};

// Share exam link via system share sheet (WhatsApp, etc) with fallback
window.shareExamLink = async (examId, title) => {
    let link = '';
    try {
        const baseUrl = await resolveShareBaseUrl();
        link = `${baseUrl}/#/exam/${examId}`;
    } catch (e) {
        showToast('Unable to create LAN share link. Set PUBLIC_BASE_URL in .env and restart server.', 'error');
        return;
    }

    try {
        if (navigator.share) {
            await navigator.share({ title: 'ExaMinds Exam', url: link });
            return;
        }
    } catch (e) {
        // If user cancels system share, don't open fallback apps
        if (e && e.name === 'AbortError') return;
    }

    // Fallback: open WhatsApp with direct link only
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(link)}`;
    window.open(whatsappUrl, '_blank');
};

// Camera helpers
function pickMediaRecorderMimeType() {
    // Prefer common formats; browser support varies.
    const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
    ];
    for (const mimeType of candidates) {
        if (window.MediaRecorder && window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(mimeType)) {
            return mimeType;
        }
    }
    return null;
}

async function startExamCamera() {
    const videoEl = document.getElementById('exam-camera-video');
    if (!videoEl || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return;
    }
    try {
        examCameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        videoEl.srcObject = examCameraStream;

        // Reset recorder state for this exam run.
        mediaRecorder = null;
        mediaRecorderChunks = [];
        recordedExamVideoBlob = null;

        if (window.MediaRecorder) {
            const mimeType = pickMediaRecorderMimeType();
            try {
                mediaRecorder = mimeType
                    ? new MediaRecorder(examCameraStream, { mimeType })
                    : new MediaRecorder(examCameraStream);

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) {
                        mediaRecorderChunks.push(e.data);
                    }
                };

                // Start as soon as possible; collect chunks in background.
                mediaRecorder.start(1000);
            } catch {
                // Leave recorder null; submit will fail gracefully below.
            }
        }
    } catch (e) {
        // If permission denied, just ignore and continue exam
        showToast('Camera could not be started', 'error');
    }
}

async function stopExamRecording() {
    recordedExamVideoBlob = null;

    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        return null;
    }

    return new Promise((resolve) => {
        const currentRecorder = mediaRecorder;

        currentRecorder.addEventListener('stop', () => {
            // Give the last `dataavailable` event a chance to arrive.
            setTimeout(() => {
                if (!mediaRecorderChunks || mediaRecorderChunks.length === 0) {
                    recordedExamVideoBlob = null;
                } else {
                    const type = currentRecorder.mimeType || 'video/webm';
                    recordedExamVideoBlob = new Blob(mediaRecorderChunks, { type });
                }

                const blobToReturn = recordedExamVideoBlob;
                mediaRecorder = null;
                mediaRecorderChunks = [];
                resolve(blobToReturn);
            }, 250);
        }, { once: true });

        try {
            currentRecorder.stop();
        } catch {
            mediaRecorder = null;
            mediaRecorderChunks = [];
            resolve(null);
        }
    });
}

function stopExamCamera() {
    if (examCameraStream) {
        examCameraStream.getTracks().forEach(t => t.stop());
        examCameraStream = null;
    }
    const videoEl = document.getElementById('exam-camera-video');
    if (videoEl) {
        videoEl.srcObject = null;
    }
}

// Edit Expert exam questions (Admin only)
window.editExam = async (examId) => {
    try {
        if (user.role !== 'Admin') {
            showToast('Only administrators can edit expert question papers.', 'error');
            return;
        }

        const res = await fetch(`${API_URL}/exams/${examId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const exam = await res.json().catch(() => ({}));
        if (!res.ok) {
            showToast(exam.message || 'Failed to load exam for editing', 'error');
            return;
        }

        const isExpertModule = exam.moduleType === 'Expert';
        const expertPaperWasApproved = isExpertModule && !!exam.isApproved;
        const editModalTitle = isExpertModule ? 'Edit Expert Question Paper' : 'Edit exam questions';

        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');

        content.innerHTML = `
            <h2>${editModalTitle}</h2>
            ${expertPaperWasApproved ? `<p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">This paper is already published. Saving updates the live exam for students on future attempts.</p>` : ''}
            <form id="edit-exam-form" style="margin-top: 20px;">
                <div class="input-group">
                    <label>Module Type</label>
                    <select id="edit-exam-module-type" disabled>
                        <option value="Regular">Standard Module</option>
                        <option value="Expert">Expert Module</option>
                    </select>
                </div>
                <div class="input-group">
                    <label>Exam Title</label>
                    <input type="text" id="edit-exam-title" required>
                </div>
                <div style="display: flex; gap: 15px;">
                    <div class="input-group" style="flex: 1;">
                        <label>Date</label>
                        <input type="date" id="edit-exam-date" required>
                    </div>
                    <div class="input-group" style="flex: 1;">
                        <label>Duration (mins)</label>
                        <input type="number" id="edit-exam-duration" min="1" required>
                    </div>
                </div>
                <div style="display: flex; gap: 15px; margin-top: 10px;">
                    <div class="input-group" style="flex: 1;">
                        <label>Max Attempts</label>
                        <input type="number" id="edit-exam-max-attempts" min="1" required>
                    </div>
                    <div class="input-group" style="flex: 1;">
                        <label>Pass percentage (%)</label>
                        <input type="number" id="edit-exam-pass-percentage" min="0" max="100" required title="Minimum score as a percent of total marks">
                    </div>
                </div>
                <div class="input-group" style="margin-top: 10px;">
                    <label style="display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="edit-exam-allow-resume" style="width:auto;">
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
                <button type="submit" class="btn btn-primary" style="width: 100%;">Save Corrections</button>
                <button type="button" class="btn" onclick="closeModal()" style="width: 100%; margin-top: 10px;">Cancel</button>
            </form>
        `;

        overlay.classList.remove('hidden');

        // Prefill top-level fields
        document.getElementById('edit-exam-module-type').value = exam.moduleType || 'Expert';
        document.getElementById('edit-exam-title').value = exam.title || '';

        // Convert to yyyy-mm-dd for <input type="date">
        const dateObj = exam.date ? new Date(exam.date) : null;
        const editDateInput = document.getElementById('edit-exam-date');
        const minAllowedDate = todayDateInputValue();
        editDateInput.min = minAllowedDate;
        editDateInput.value = dateObj ? dateObj.toISOString().slice(0, 10) : minAllowedDate;
        if (editDateInput.value < minAllowedDate) {
            editDateInput.value = minAllowedDate;
        }

        document.getElementById('edit-exam-duration').value = exam.duration || 0;
        document.getElementById('edit-exam-max-attempts').value = exam.maxAttempts || 1;
        {
            const total = exam.totalMarks > 0 ? exam.totalMarks : (Array.isArray(exam.questions) ? exam.questions.reduce((s, q) => s + (parseInt(q.marks, 10) || 1), 0) : 0);
            let pct = typeof exam.passPercentage === 'number' && !Number.isNaN(exam.passPercentage)
                ? exam.passPercentage
                : (total > 0 && typeof exam.passMarks === 'number' ? (exam.passMarks / total) * 100 : 40);
            pct = Math.min(100, Math.max(0, pct));
            document.getElementById('edit-exam-pass-percentage').value = String(Math.round(pct));
        }
        document.getElementById('edit-exam-allow-resume').checked = !!exam.allowResume;

        const questionsEdit = document.getElementById('questions-edit');
        const addQuestionBtn = document.getElementById('add-question-btn');

        // Populate questions (replace the single template item)
        const templateItem = questionsEdit.querySelector('.q-item');
        const existingTemplateValue = templateItem.querySelector('.q-text').value;

        // Remove all existing items except the template; we'll repopulate deterministically.
        templateItem.remove();

        const questions = Array.isArray(exam.questions) ? exam.questions : [];
        const makeItem = () => {
            // Create a new empty item by cloning the last known markup via reusing the template from DOM.
            // We re-inject by cloning from an updated placeholder: easiest is to clone from the first original string above.
            // Fallback: clone from DOM that we recreate below.
            return null;
        };

        // Re-inject a fresh template item by reading back from the DOM we just removed.
        // Since the template is removed, we rebuild it from scratch by cloning from the original HTML snippet:
        // (Instead of trying to read removed node, we rebuild by setting innerHTML again.)
        questionsEdit.innerHTML = `
            <h4>Questions</h4>
        `;

        // Helper: add a question item by cloning a fresh template each time.
        const injectQuestionTemplate = (questionIndex) => {
            const wrap = document.createElement('div');
            wrap.className = 'q-item';
            wrap.style.cssText = 'margin-bottom: 20px; padding: 10px; border: 1px dashed var(--glass-border);';
            wrap.innerHTML = `
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
            `;
            questionsEdit.appendChild(wrap);
            return wrap;
        };

        function applyQuestionTypeUI(item, type) {
            const optionsArea = item.querySelector('.q-options-area');
            const shortArea = item.querySelector('.q-short-answer-area');
            const optionInputs = item.querySelectorAll('.q-opt');
            const correctSelect = item.querySelector('.q-correct');

            if (type === 'ShortAnswer') {
                optionsArea.style.display = 'none';
                shortArea.style.display = 'block';
                optionInputs.forEach(i => { i.required = false; });
                return;
            }

            if (type === 'TrueFalse') {
                optionsArea.style.display = 'block';
                shortArea.style.display = 'none';
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
                correctSelect.innerHTML = `
                    <option value="0">True is correct</option>
                    <option value="1">False is correct</option>
                `;
                correctSelect.value = '0';
                return;
            }

            // MCQ default
            optionsArea.style.display = 'block';
            shortArea.style.display = 'none';
            optionInputs.forEach((i, idx) => {
                i.style.display = 'block';
                i.readOnly = false;
                i.required = idx < 2;
            });
            correctSelect.innerHTML = `
                <option value="0">Option 1 is correct</option>
                <option value="1">Option 2 is correct</option>
                <option value="2">Option 3 is correct</option>
                <option value="3">Option 4 is correct</option>
            `;
            correctSelect.value = '0';
        }

        // Build each question item
        questions.forEach((q, idx) => {
            const item = injectQuestionTemplate(idx);
            item.querySelector('.q-text').value = q.questionText || '';
            item.querySelector('.q-type').value = q.type || 'MCQ';
            item.querySelector('.q-marks').value = q.marks || 1;

            // Apply correct UI for type (so the admin sees/edit the right fields)
            applyQuestionTypeUI(item, q.type || 'MCQ');

            if ((q.type || 'MCQ') === 'ShortAnswer') {
                item.querySelector('.q-correct-text').value = q.correctTextAnswer || '';
            } else if ((q.type || 'MCQ') === 'TrueFalse') {
                item.querySelector('.q-correct').value = String(q.correctAnswer ?? 0);
            } else {
                const opts = Array.isArray(q.options) ? q.options : [];
                const optionInputs = Array.from(item.querySelectorAll('.q-opt'));
                optionInputs.forEach((input, i) => {
                    input.value = opts[i] || '';
                });
                const correct = Number.isFinite(q.correctAnswer) ? q.correctAnswer : 0;
                item.querySelector('.q-correct').value = String(correct);
            }
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
                correctSelect.innerHTML = `
                    <option value="0">Option 1 is correct</option>
                    <option value="1">Option 2 is correct</option>
                    <option value="2">Option 3 is correct</option>
                    <option value="3">Option 4 is correct</option>
                `;
                correctSelect.value = '0';
            }
        });

        // Add question
        addQuestionBtn.addEventListener('click', () => {
            const newItem = injectQuestionTemplate(questionsEdit.querySelectorAll('.q-item').length);
            newItem.querySelector('.q-text').value = '';
            newItem.querySelector('.q-type').value = 'MCQ';
            newItem.querySelector('.q-marks').value = 1;
            const optionInputs = Array.from(newItem.querySelectorAll('.q-opt'));
            optionInputs.forEach((input, idx) => {
                input.value = '';
                input.style.display = 'block';
                input.readOnly = false;
                input.required = idx < 2;
            });
            // Ensure MCQ UI visible
            newItem.querySelector('.q-type').dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Save corrections
        document.getElementById('edit-exam-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const moduleType = document.getElementById('edit-exam-module-type').value || 'Expert';
            const title = document.getElementById('edit-exam-title').value;
            const date = document.getElementById('edit-exam-date').value;
            if (date < todayDateInputValue()) {
                showToast('Exam date cannot be in the past.', 'error');
                return;
            }
            const duration = document.getElementById('edit-exam-duration').value;
            const maxAttempts = parseInt(document.getElementById('edit-exam-max-attempts').value, 10) || 1;
            const passPercentage = Math.min(100, Math.max(0, parseInt(document.getElementById('edit-exam-pass-percentage').value, 10) || 40));
            const allowResume = document.getElementById('edit-exam-allow-resume').checked;

            const questionsPayload = [];
            questionsEdit.querySelectorAll('.q-item').forEach((item) => {
                const questionText = item.querySelector('.q-text').value.trim();
                const type = item.querySelector('.q-type').value;
                const marks = parseInt(item.querySelector('.q-marks').value, 10) || 1;

                if (!questionText) return;

                if (type === 'ShortAnswer') {
                    const correctTextAnswer = item.querySelector('.q-correct-text').value.trim();
                    if (!correctTextAnswer) return;
                    questionsPayload.push({
                        questionText,
                        type,
                        options: [],
                        correctAnswer: null,
                        correctTextAnswer,
                        marks
                    });
                } else if (type === 'TrueFalse') {
                    const correctAnswer = parseInt(item.querySelector('.q-correct').value, 10);
                    questionsPayload.push({
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

                    if (options.length < 2) return;

                    let correctAnswer = parseInt(item.querySelector('.q-correct').value, 10);
                    if (correctAnswer >= options.length || isNaN(correctAnswer)) correctAnswer = 0;

                    questionsPayload.push({
                        questionText,
                        type: 'MCQ',
                        options,
                        correctAnswer,
                        marks
                    });
                }
            });

            if (!questionsPayload.length) {
                showToast('Add at least one valid question with correct answers.', 'error');
                return;
            }

            const saveRes = await fetch(`${API_URL}/exams/${examId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title,
                    date,
                    duration,
                    maxAttempts,
                    passPercentage,
                    allowResume,
                    questions: questionsPayload,
                    moduleType
                })
            });

            if (!saveRes.ok) {
                const data = await saveRes.json().catch(() => ({}));
                showToast(data.message || 'Failed to save corrections', 'error');
                return;
            }

            closeModal();
            fetchExamsAdmin();
            const successMsg = isExpertModule
                ? (expertPaperWasApproved ? 'Expert exam updated.' : 'Corrections saved. Submit corrections to publish.')
                : 'Exam saved.';
            showToast(successMsg, 'success');
        });
    } catch (e) {
        showToast('Failed to edit exam', 'error');
    }
};

// Approve Expert exam (Admin only)
window.approveExam = async (id) => {
    try {
        const res = await fetch(`${API_URL}/exams/${id}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            showToast('Exam approved', 'success');
            fetchExamsAdmin();
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.message || 'Failed to approve exam', 'error');
        }
    } catch (e) {
        showToast('Failed to approve exam', 'error');
    }
};

// Approve Expert user login (Admin only)
window.approveExpert = async (expertId) => {
    try {
        const res = await fetch(`${API_URL}/auth/experts/${expertId}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            showToast('Expert access approved', 'success');
            fetchPendingExperts();
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.message || 'Failed to approve expert', 'error');
        }
    } catch (e) {
        showToast('Failed to approve expert', 'error');
    }
};

window.approvePasswordReset = async (userId) => {
    try {
        const res = await fetch(`${API_URL}/auth/password-resets/${userId}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            showToast('Password reset approved', 'success');
            fetchPendingPasswordResets();
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.message || 'Failed to approve reset request', 'error');
        }
    } catch (e) {
        showToast('Failed to approve reset request', 'error');
    }
};

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

    const passThresholdPct = effectivePassPercent(exam);
    const passed = results.filter(r => studentPassed(r.marks, exam)).length;
    const failed = results.length - passed;
    const totalPossible = exam.totalMarks || 0;
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
                <p>Pass threshold: <strong>${passThresholdPct.toFixed(0)}%</strong> of total marks</p>
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
                        <div style="font-size: 0.8rem; color: ${studentPassed(r.marks, exam) ? 'var(--success)' : 'var(--error)'};">
                            ${studentPassed(r.marks, exam) ? 'Passed' : 'Failed'} (${totalPossible ? studentScorePercent(r.marks, totalPossible).toFixed(2) : '0.00'}%)
                        </div>
                        ${(r.video && (r.video.fileId || r.video.path))
                            ? `<button class="btn btn-ghost" style="margin-top:6px;" onclick="watchSubmissionVideo('${r._id}')">Watch Video</button>`
                            : `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px;">No video</div>`
                        }
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

window.watchSubmissionVideo = async (submissionId) => {
    try {
        const res = await fetch(`${API_URL}/submit/video/${submissionId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showToast(data.message || 'Unable to load submission video', 'error');
            return;
        }

        const blob = await res.blob();
        const videoUrl = URL.createObjectURL(blob);
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');

        content.innerHTML = `
            <h2>Submission Video</h2>
            <video controls autoplay style="width: 100%; max-height: 70vh; margin-top: 12px; border-radius: 10px;" src="${videoUrl}">
                Your browser does not support the video tag.
            </video>
            <button class="btn btn-primary" onclick="closeModal()" style="width: 100%; margin-top: 15px;">Close</button>
        `;
        overlay.classList.remove('hidden');

        const cleanup = () => URL.revokeObjectURL(videoUrl);
        setTimeout(() => {
            const closeBtn = content.querySelector('button');
            if (closeBtn) closeBtn.addEventListener('click', cleanup, { once: true });
        }, 0);
    } catch (err) {
        showToast('Unable to load submission video', 'error');
    }
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
            const totalPossible = r.exam?.totalMarks || 0;
            const passed = studentPassed(r.marks, r.exam);
            const percent = totalPossible ? studentScorePercent(r.marks, totalPossible).toFixed(2) : '0.00';
            return `
            <tr>
                <td>${r.exam?.title || 'Exam'}</td>
                <td>${r.exam?.date ? new Date(r.exam.date).toLocaleDateString() : ''}</td>
                <td>
                    <strong>${r.marks}</strong>
                    <span style="color: ${passed ? 'var(--success)' : 'var(--error)'}; font-size: 0.8rem;">
                        (${passed ? 'Pass' : 'Fail'} · ${percent}%)
                    </span>
                </td>
                <td>${r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''}</td>
            </tr>
        `;
        }).join('');

        // Prepare chart data
        const chartLabels = results.map((r, idx) => `Exam ${idx + 1}`);
        const chartScorePercents = results.map((r) => studentScorePercent(r.marks, r.exam?.totalMarks));
        const chartPassPercents = results.map((r) => effectivePassPercent(r.exam));
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
                        label: 'Student score %',
                        data: chartScorePercents,
                        borderColor: 'rgb(99, 102, 241)',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        tension: 0.4,
                        fill: true
                    }, {
                        label: 'Pass %',
                        data: chartPassPercents,
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
                            beginAtZero: true,
                            max: 100
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