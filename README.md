# Ayushman Kitchen 🍱

A modern, full-stack campus meal subscription and dining management system built with **FastAPI** (Python 3.13) and **React / TypeScript / Vite**.

Ayushman Kitchen streamlines daily campus meal planning by providing real-time meal selection windows for students, flexible Standard vs. Premium plan management, kitchen headcount reporting (with PDF & Excel export), and complete administrative oversight.

---

## ⚡ One-Command Quick Start (Frontend + Backend Together)

You can launch both the **FastAPI Backend** and the **Vite Frontend** concurrently with a single command from either the project root or the `frontend` folder:

```bash
# Run from repository root
npm run dev

# OR from the frontend folder
cd frontend && npm run dev
```

- **Frontend Application**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 👥 Default Usernames and Passwords (Demo Logins)

The system comes pre-seeded with ready-to-use accounts. You can also click the **1-Click Quick Demo Access** buttons directly on the sign-in screen:

| Role | Name | Email (Username) | Password | Student ID / Details |
| :--- | :--- | :--- | :--- | :--- |
| 👑 **Admin** | Ayushman Admin | `admin@ayushman.kitchen` | `AdminPass123!` | Full kitchen & student administration |
| ⭐ **Premium Student** | Priya Patel | `student.premium@ayushman.kitchen` | `PremiumPass123!` | `STD-2026-002` (Active Premium Plan - Veg / Chicken) |
| 🍱 **Standard Student** | Rahul Sharma | `student.standard@ayushman.kitchen` | `StudentPass123!` | `STD-2026-001` (Active Standard Plan) |
| ⚠️ **Expired Student** | Amit Verma | `student.expired@ayushman.kitchen` | `StudentPass123!` | `STD-2026-003` (Expired Subscription) |
| 👨‍🍳 **Kitchen Staff** | Chef Rajesh Kumar | `staff@ayushman.kitchen` | `StaffPass123!` | `STAFF-001` |

---

## 🌟 Key Business Rules & Features

- **⏱️ Time-Locked Meal Selection Windows (Asia/Kolkata - IST)**:
  - **☀️ Lunch Window**: `06:00 AM – 11:00 AM IST` (Locks at 11:00 AM)
  - **🌙 Dinner Window**: `04:00 PM – 07:00 PM IST` (Locks at 07:00 PM)
  - *After 11:00 AM for lunch and after 07:00 PM for dinner, no meal can be selected, changed, or cancelled.*

- **🚫 Strict Cancellation Policy**:
  - Once a student cancels their Lunch or Dinner for the day, the slot is marked **Cancelled** and is locked — it **cannot be re-selected or modified** for that day.

- **🍱 Subscription Plans & Options**:
  - **Standard Plan**: Default nutritious campus meal for lunch and dinner.
  - **Premium Plan**: Students choose between **Veg** and **Chicken** options daily.

- **📊 Comprehensive Admin Operations**:
  - Dashboard analytics: Total students, active subscriptions, today's confirmed headcount.
  - Student directory: Search, enroll new students, change plans, renew, and suspend subscriptions.
  - Meal options catalogue: Manage Veg and Chicken dish availability.
  - Daily headcount reports: Breakdown by slot and dish, with **PDF** and **Excel** export.
  - Audit logging: Complete trace of changes, meal selections, and cancellations.

---

## 🚀 Manual Step-by-Step Setup (Alternative)

### Prerequisites
- **Python 3.11+** (Tested on Python 3.13)
- **Node.js 18+** & `npm`

---

### 1. Environment Configuration

Copy `.env.example` to `.env` in the repository root:

```bash
cp .env.example .env
```

Default configuration for local SQLite development:
```env
DATABASE_URL=sqlite:///./ayushman_kitchen.db
SECRET_KEY=ayushman-kitchen-secret-key-32-chars-minimum
ACCESS_TOKEN_MINUTES=60
REFRESH_TOKEN_DAYS=30
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000
```

---

### 2. Backend Setup Separately

```bash
cd backend

# Create and activate virtual environment (optional)
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations & seed demo data
alembic upgrade head
python3 -m app.seed

# Start the backend server
uvicorn app.main:app --reload --port 8000
```

---

### 3. Frontend Setup Separately

```bash
cd frontend

# Install packages
npm install

# Start Vite development server
npm run dev:frontend
```

---

## 🧪 Running Tests

To run the automated backend test suite:

```bash
cd backend
python3 -m pytest
```

---

## 📁 Project Architecture

```
ayushman_kitchen/
├── backend/
│   ├── alembic.ini             # Alembic migration configuration
│   ├── app/
│   │   ├── core.py             # Config settings, IST time helpers, JWT & password hashing
│   │   ├── database.py         # SQLAlchemy engine & session factory
│   │   ├── deps.py             # FastAPI dependencies (Auth, Role verification)
│   │   ├── main.py             # FastAPI app, CORS, exception handlers, startup lifespan
│   │   ├── models.py           # DB models (User, Subscription, MealOption, MealSelection, AuditLog)
│   │   ├── schemas.py          # Pydantic validation schemas
│   │   ├── seed.py             # Seeding script (Admin, Students, Veg/Chicken options)
│   │   ├── services.py         # Meal selection validation, windows & cancellation checks
│   │   └── routers/
│   │       ├── auth.py         # Login, Register, Refresh Token, Logout, /me
│   │       ├── admin.py        # Dashboard stats, student CRUD, meal options, audit logs
│   │       ├── student.py      # Today's meals, selection, cancellation, history
│   │       └── reports.py      # Daily headcount reports, PDF export, Excel export
│   ├── migrations/             # Database migration versions
│   ├── requirements.txt        # Python dependencies
│   └── tests/                  # Pytest test suite (9 automated tests)
│
├── frontend/
│   ├── index.html              # Entry HTML
│   ├── src/
│   │   ├── App.tsx             # Main React app (Login/Register, Student & Admin Dashboards)
│   │   ├── api.ts              # Axios client with auto JWT refresh & error handling
│   │   ├── auth.tsx            # React Auth context & session hooks
│   │   ├── styles.css          # Design system & responsive UI styles
│   │   └── main.tsx            # Vite root mount
│   ├── package.json            # Node dependencies & build scripts
│   └── vite.config.ts          # Vite build & proxy configuration
│
├── package.json                # Root package.json with concurrent start script
├── .env.example                # Environment variables template
└── README.md                   # Project documentation
```

---

## 📡 API Endpoints Overview

### Authentication (`/auth`)
- `POST /auth/login` - Authenticate with email & password.
- `POST /auth/register` - Student self-registration with automatic 30-day subscription.
- `POST /auth/refresh` - Refresh access token using HTTP-only cookie.
- `POST /auth/logout` - Clear refresh cookie and terminate session.
- `GET /auth/me` - Retrieve current logged-in user profile.

### Student Portal (`/student`)
- `GET /student/dashboard` - Today's subscription status and selected meals.
- `GET /student/meals/today` - Today's meal options and active selections.
- `POST /student/meals/select` - Confirm meal selection (within open window; cannot re-select if cancelled).
- `POST /student/meals/cancel` - Cancel today's meal selection (permanently locked for today).
- `PUT /student/meals/change` - Change meal choice between Veg and Chicken (Premium subscribers).
- `GET /student/meals/history` - View past meal selection history.

### Admin & Operations (`/admin`)
- `GET /admin/dashboard` - Summary counts (Students, Subscriptions, Today's Confirmed).
- `GET /admin/students` - List/search students and subscription details.
- `POST /admin/students` - Enroll a new student with custom subscription window.
- `PUT /admin/students/{id}/plan` - Switch student between Standard and Premium.
- `POST /admin/students/{id}/renew` - Extend / renew subscription dates.
- `POST /admin/students/{id}/suspend` - Suspend a student's meal access.
- `GET /admin/meal-options` - List all meal catalogue options (Veg / Chicken).
- `POST /admin/meal-options` - Add a new dish option.
- `PUT /admin/meal-options/{id}` - Toggle dish availability.
- `GET /admin/reports` - Daily headcount report JSON.
- `GET /admin/reports/pdf` - Export daily kitchen prep report as PDF.
- `GET /admin/reports/excel` - Export daily kitchen prep report as XLSX.
- `GET /admin/audit-logs` - View system activity audit trail.
