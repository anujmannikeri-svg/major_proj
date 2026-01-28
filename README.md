# Online Examination Management System

A full-stack web application designed to conduct and manage online examinations in a secure, efficient, and scalable manner. The system allows administrators to create and manage exams, while students can attempt exams online and submit responses digitally.

---

## Overview

The **Online Examination Management System** digitizes the traditional examination process by providing a centralized platform for exam creation, participation, and submission. It minimizes manual effort, improves accuracy, and ensures secure handling of examination data.

---

## Features

- User authentication and authorization (Admin and Student)
- Secure login and registration using JWT
- Exam creation and management
- Online exam submission
- Storage of exam details and student submissions
- Role-based access control
- Simple and user-friendly interface

---

## Tech Stack

**Frontend**
- HTML
- CSS
- JavaScript

**Backend**
- Node.js
- Express.js

**Database**
- MongoDB

**Authentication**
- JSON Web Token (JWT)

**Tools**
- Git
- GitHub
- Visual Studio Code

---

## Application Architecture

The application follows a client–server architecture:
- The frontend handles user interactions.
- The backend provides RESTful APIs for authentication, exams, and submissions.
- MongoDB is used for persistent data storage.
- Middleware is used to protect routes and enforce authorization.

---

## Project Structure

Online-Examination-Management-System
│
├── middleware
│ └── auth.js
│
├── models
│ ├── User.js
│ ├── Exam.js
│ └── Submission.js
│
├── routes
│ ├── auth.js
│ ├── exams.js
│ └── submissions.js
│
├── public
│ ├── index.html
│ ├── style.css
│ └── app.js
│
├── .gitignore
├── package.json
├── package-lock.json
├── server.js
└── README.md


---

## Installation and Setup

### Prerequisites
- Node.js
- MongoDB (local or MongoDB Atlas)

### Steps

1. Clone the repository:

   git clone https://github.com/dev-manisha-01/Online-Examination-Management-System.git

2. Navigate to the project directory:

   cd Online-Examination-Management-System

3. Install dependencies:

   npm install

4. Start the server:

   node server.js

5. Open the application in your browser:

   http://localhost:3000


 Author

Manisha
GitHub: https://github.com/dev-manisha-01


