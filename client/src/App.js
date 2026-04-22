import React, { useState, useEffect } from 'react';
import './App.css';
import ExamList from './components/ExamList';
import AdminResults from './components/AdminResults';
import { apiFetch } from './api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [activeView, setActiveView] = useState('Exams'); // 'Exams' or 'Results'
  const [selectedExam, setSelectedExam] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setActiveView('Exams');
  };

  const handleViewResults = (exam) => {
    setSelectedExam(exam);
    setActiveView('Results');
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>Online Exam System - React Interface</h1>
        <div className="auth-status">
          {token && user ? (
            <div>
               <span>Logged in as: <strong>{user.name} ({user.role})</strong></span>
               <button onClick={handleLogout} className="btn-small" style={{ marginLeft: '10px' }}>Logout</button>
            </div>
          ) : (
            <form onSubmit={handleLogin} style={{ display: 'flex', gap: '10px' }}>
               <input type="email" placeholder="admin@gmail.com" value={email} onChange={e => setEmail(e.target.value)} required />
               <input type="password" placeholder="admin@123" value={password} onChange={e => setPassword(e.target.value)} required />
               <button type="submit" className="btn-small">Login</button>
            </form>
          )}
        </div>
      </header>
      
      <main className="app-main">
        {activeView === 'Exams' && (
          <ExamList onViewResults={handleViewResults} />
        )}
        
        {activeView === 'Results' && selectedExam && (
           <AdminResults 
              exam={selectedExam} 
              onBack={() => setActiveView('Exams')} 
           />
        )}
      </main>
    </div>
  );
}

export default App;