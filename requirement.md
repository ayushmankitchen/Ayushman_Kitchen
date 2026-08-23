# 📋 Ayushman Kitchen — Complete Project Requirement & Handover Guide

> **Master Account Email**: `ayushmankitchen@gmail.com`  
> **Target Audience**: Developers, Maintainers, and System Administrators taking over this project.  
> **Purpose**: Single source of truth containing complete system architecture, credentials overview, setup instructions, dashboard links, API rotation steps, and operational workflows.

---

## 📑 Table of Contents

1. [Master Accounts & Cloud Services Directory](#1-master-accounts--cloud-services-directory)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Environment Variables Reference](#3-environment-variables-reference)
4. [Step-by-Step Local Setup from Scratch](#4-step-by-step-local-setup-from-scratch)
5. [Production Deployment Guide (Render & Vercel)](#5-production-deployment-guide-render--vercel)
6. [How to Rotate / Update API Keys & Credentials](#6-how-to-rotate--update-api-keys--credentials)
7. [System Features & Operational Workflows](#7-system-features--operational-workflows)
8. [Troubleshooting & Common Fixes](#8-troubleshooting--common-fixes)

---

## 1. Master Accounts & Cloud Services Directory

All external cloud services for Ayushman Kitchen are registered and managed using the primary master email: **`ayushmankitchen@gmail.com`**.

| Service | Purpose | Direct Dashboard URL | Credentials / Key Location |
| :--- | :--- | :--- | :--- |
| **GitHub** | Source Code Repository & Version Control | [github.com/ayushmankitchen/Ayushman_Kitchen](https://github.com/ayushmankitchen/Ayushman_Kitchen) | Log in via `ayushmankitchen@gmail.com` |
| **MongoDB Atlas** | Cloud Database (Cluster: `AyushmanKitchen`) | [cloud.mongodb.com](https://cloud.mongodb.com) | Database Access & Network Whitelist |
| **Render.com** | Production Backend Hosting (FastAPI) | [dashboard.render.com](https://dashboard.render.com) | Environment Variables on Render Web Service |
| **Vercel** | Production Frontend Hosting (React PWA) | [vercel.com](https://vercel.com) | Vercel Project Settings & Domains |
| **Brevo (Sendinblue)** | Transactional Email API (Password Resets) | [app.brevo.com](https://app.brevo.com) | [Brevo API Keys Page](https://app.brevo.com/settings/keys/api) |
| **Cloudinary** | Media & Audio Storage (Photos & Voice notes) | [console.cloudinary.com](https://console.cloudinary.com) | [Cloudinary API Keys](https://console.cloudinary.com/settings/api-keys) |
| **Web Push (VAPID)** | Browser Notifications for Students & Admin | Built-in Python `pywebpush` | `backend/.env` (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) |

---

## 2. Architecture & Tech Stack

```mermaid
flowchart TD
  Client([Student / Admin Browser & Mobile PWA])
  Client -->|HTTPS Requests| Vercel[Vercel Frontend · React 18]
  Vercel -->|/api rewrite via vercel.json| Render[Render Backend · FastAPI Python 3.11]
  Render -->|Async Motor Client| Mongo[(MongoDB Atlas · ayushman_kitchen)]
  Render -->|HTTPS REST API| Brevo[Brevo API · Password Reset Emails]
  Render -->|Upload / Stream| Cloudinary[Cloudinary CDN · Photos & Audio]
  Render -->|Web Push Protocol| PushServer[Browser Push Service · ServiceWorker]
```

### Technology Matrix
- **Frontend**: React 18, Tailwind CSS, CRACO, Radix UI primitives, Lucide React icons, Sonner toast system, Recharts, Workbox Progressive Web App (PWA).
- **Backend**: Python 3.11, FastAPI (ASGI), Uvicorn, Motor (AsyncIOMotorClient), Pydantic v2, PyJWT (HS256), Bcrypt.
- **Database**: MongoDB Atlas (`ayushman_kitchen` database).
- **Timezone**: `Asia/Kolkata` (Indian Standard Time UTC+5:30) enforced system-wide.

---

## 3. Environment Variables Reference

### Backend (`backend/.env`)

| Variable Name | Required | Example / Default | Description & Where to Obtain |
| :--- | :---: | :--- | :--- |
| `ENVIRONMENT` | Yes | `development` / `production` | `development` for local testing, `production` for Render. |
| `MONGO_URL` | Yes | `mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority` | MongoDB connection URI from [MongoDB Atlas Dashboard](https://cloud.mongodb.com). |
| `DB_NAME` | Yes | `ayushman_kitchen` | Name of the database inside the MongoDB cluster. |
| `JWT_SECRET` | Yes | `min-32-chars-random-string` | Secret key used to sign and verify Admin JWT session tokens. |
| `ADMIN_EMAIL` | Yes | `admin@ayushmankitchen.com` | Initial admin account email address. |
| `ADMIN_USERNAME` | Yes | `admin` | Initial admin login username. |
| `ADMIN_PASSWORD` | Yes | `admin123` | Default seed admin password (change immediately after first login). |
| `CORS_ORIGINS` | Yes | `http://localhost:3003,http://localhost:3000,https://ayushman-kitchen.vercel.app` | Comma-separated list of allowed frontend origins for CORS. |
| `FRONTEND_URL` | Yes | `http://localhost:3003` (local) or `https://ayushman-kitchen.vercel.app` | Base URL of the frontend app. |
| `COOKIE_SECURE` | Yes | `false` (local) / `true` (production) | If `true`, session cookies require HTTPS. |
| `COOKIE_SAMESITE` | Yes | `lax` (local) / `none` (production cross-site) | SameSite cookie policy. |
| `SESSION_MAX_AGE_SECONDS`| Yes | `5184000` (60 days) | Session duration before requiring re-login. |
| `BUSINESS_TIMEZONE` | Yes | `Asia/Kolkata` | Standard operational timezone for kitchen cutoffs. |
| `BREVO_API_KEY` | Yes | `xkeysib-xxxxxxxxxxxx` | Transactional email API key from [Brevo API Keys](https://app.brevo.com/settings/keys/api). |
| `BREVO_SENDER_EMAIL`| Yes | `ayushmankitchen@gmail.com` | Verified sender email in Brevo. |
| `BREVO_SENDER_NAME` | Yes | `Ayushman Kitchen` | Display sender name in student reset emails. |
| `PASSWORD_RESET_URL`| Yes | `http://localhost:3003/reset-password` | Base link included in student password reset emails. |
| `MEDIA_STORAGE` | Yes | `cloudinary` (or `local`) | Media storage backend provider. |
| `CLOUDINARY_URL` | Yes | `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` | Full Cloudinary connection string from [Cloudinary Console](https://console.cloudinary.com). |
| `CLOUDINARY_CLOUD_NAME`| Optional | `pl1uftbe` | Cloudinary cloud identifier. |
| `CLOUDINARY_API_KEY` | Optional | `895281372528729` | Cloudinary API Key. |
| `CLOUDINARY_API_SECRET` | Optional | `9JNs7tnwWbCi0mKss79G6YS5l5I` | Cloudinary API Secret. |
| `VAPID_PUBLIC_KEY` | Yes | `BOPOzr52i-dlEqO-w2jN0JWvzM7cBnyLLwUiwHA_J1ubvt8IpALuTCyZ5nsu754pQz224axtgXgM85MMiHcYfZQ` | VAPID public key for Web Push notifications. |
| `VAPID_PRIVATE_KEY`| Yes | `yslgqxAts9oen8h3JuKJ6KJCXFnxO2n6IcAwuKqTgLw` | VAPID private key (keep secret). |
| `VAPID_SUBJECT` | Yes | `mailto:ayushmankitchen@gmail.com` | Contact email header for push notification providers. |

### Frontend (`frontend/.env`)

| Variable Name | Required | Value | Description |
| :--- | :---: | :--- | :--- |
| `REACT_APP_BACKEND_URL` | Local only | `http://localhost:8000` | Backend API URL. In production Vercel, this is left empty because `vercel.json` proxies `/api` directly to Render. |

---

## 4. Step-by-Step Local Setup from Scratch

### Prerequisites
- **Node.js** v18.0.0 or higher ([Download Node.js](https://nodejs.org/))
- **Python** 3.10 or 3.11 ([Download Python](https://www.python.org/))
- **Git** ([Download Git](https://git-scm.com/))

### 1. Clone the repository
```bash
git clone https://github.com/ayushmankitchen/Ayushman_Kitchen.git
cd Ayushman_Kitchen
```

### 2. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create Python virtual environment
python3 -m venv venv

# Activate virtual environment
# On macOS / Linux:
source venv/bin/activate
# On Windows PowerShell / CMD:
# .\venv\Scripts\activate

# Install all backend requirements
pip install -r requirements.txt

# Create your .env file
cp .env.example .env
# Open backend/.env and ensure MongoDB, Brevo & Cloudinary keys are filled.

# Start backend server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
*Backend will be running at `http://localhost:8000` (Health check: `http://localhost:8000/api/health`).*

### 3. Frontend Setup (in a second terminal)
```bash
# Navigate to frontend directory from project root
cd frontend

# Install Node dependencies
npm install

# Start development server
npm start
```
*Frontend will open in browser at `http://localhost:3000` (or `http://localhost:3003` if port 3000 is occupied).*

---

## 5. Production Deployment Guide (Render & Vercel)

### Backend Deployment (Render.com)
1. Log in to [dashboard.render.com](https://dashboard.render.com) using `ayushmankitchen@gmail.com`.
2. Open the **Ayushman Kitchen API** Web Service.
3. Settings:
   - **Root Directory**: `backend` (or project root)
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4. In **Environment Variables**, ensure the following production values are configured:
   - `ENVIRONMENT=production`
   - `COOKIE_SECURE=true`
   - `COOKIE_SAMESITE=none`
   - `FRONTEND_URL=https://ayushman-kitchen.vercel.app`
   - `CORS_ORIGINS=https://ayushman-kitchen.vercel.app,http://localhost:3000`
   - `PASSWORD_RESET_URL=https://ayushman-kitchen.vercel.app/reset-password`
   - `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `BREVO_API_KEY`, `CLOUDINARY_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`

### Frontend Deployment (Vercel)
1. Log in to [vercel.com](https://vercel.com) using `ayushmankitchen@gmail.com`.
2. Connect the GitHub repository `ayushmankitchen/Ayushman_Kitchen`.
3. Set **Root Directory** to `frontend`.
4. The `frontend/vercel.json` file automatically proxies all `/api/(.*)` requests to the Render backend, preventing any cross-origin cookie or authentication loss:
```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://ayushman-kitchen.onrender.com/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## 6. How to Rotate / Update API Keys & Credentials

### A. If MongoDB Atlas Password Changes
1. Go to [MongoDB Atlas Database Users](https://cloud.mongodb.com/v2#/security/database/users).
2. Click **Edit** on `ayushmankitchen_db_user` and enter a new password.
3. Update `MONGO_URL` in `backend/.env` locally and on **Render Dashboard > Environment Variables**.
4. **Important**: Verify in [Network Access](https://cloud.mongodb.com/v2#/security/network/whitelist) that `0.0.0.0/0` is allowed so Render backend servers can connect.

### B. If Brevo (Sendinblue) Email API Key Changes
1. Log in to [Brevo API Keys](https://app.brevo.com/settings/keys/api).
2. Click **Generate a new API key**, give it a name (e.g. `Ayushman-Production`).
3. Copy the key starting with `xkeysib-...`.
4. Update `BREVO_API_KEY` in `backend/.env` and on **Render Dashboard**.
5. Ensure `ayushmankitchen@gmail.com` is listed under [Brevo Senders](https://app.brevo.com/senders) with green checkmark.

### C. If Cloudinary Media Storage Keys Change
1. Log in to [Cloudinary Console](https://console.cloudinary.com).
2. Go to **Settings > API Keys** ([Link](https://console.cloudinary.com/settings/api-keys)).
3. Copy the **Cloud name**, **API Key**, and **API Secret**.
4. Construct `CLOUDINARY_URL=cloudinary://<API_KEY>:<API_SECRET>@<CLOUD_NAME>`.
5. Update `CLOUDINARY_URL` in `backend/.env` and on **Render Dashboard**.

### D. If VAPID Push Notification Keys Need Regeneration
If push keys are compromised or need to be reset:
```bash
cd backend
source venv/bin/activate
python -c "from pywebpush import Vapid; v = Vapid(); v.generate_keys(); print('Public:', v.public_key); print('Private:', v.private_key)"
```
Update `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `backend/.env`, Render Dashboard, and in `frontend/src/lib/notifications.js`.

---

## 7. System Features & Operational Workflows

### 🍽️ 1. Meal Plans & Subscription Model
- **Standard Plan**: Wholesome homestyle Veg and Non-Veg daily meals.
- **Premium Plan**: Gourmet dishes from chef's catalog + Sunday Biryani Feast.
- **Pool Duration**: Standard 60 meals (30 lunches + 30 dinners), with an operational 45-day validity period.
- **Validity Freezing**: When Admin enables **College Holiday Mode**, students' 45-day validity is frozen/paused so students do not lose active days during vacations.

### ☀️ 2. Sunday Special Biryani Day
- **Sunday Lunch**: Both **Veg Special** (e.g. *Special Veg Paneer Dum Biryani*) and **Non-Veg Special** (e.g. *Special Chicken Dum Biryani*) are served.
- **Student Choice**: Premium students can freely choose between Veg and Non-Veg Biryani anytime before the lunch cutoff window closes.
- **Sunday Dinner**: Regular gourmet catalog menu (Sunday dinner special is not restricted).

### ⏰ 3. Daily Meal Timing Windows & Cutoffs
- **Lunch Window**: Default `08:00 AM – 11:00 AM` (Cutoff at 11:00 AM).
- **Dinner Window**: Default `04:00 PM – 07:00 PM` (Cutoff at 07:00 PM).
- Students can customize dish, toggle Dine-in / Pickup / Delivery, or Cancel (skip) meal before cutoff.
- Once cutoff passes, meals lock automatically to prevent wastage and enable exact kitchen cooking counts.

### 📢 4. Admin Broadcast & Messaging
- Admin can send direct messages to individual students.
- Admin can click the **📢 Broadcast** button in Messages tab to send group announcements in 1 click to:
  - **All Students**
  - **Premium Only Students**
  - **Standard Only Students**
  - **Custom Selected Students (via search checklist)**

### 📄 5. Daily Kitchen Preparation Rosters
Admin can download real-time cooking sheets:
- **Full Roster (PDF & Excel)**: Student-by-student breakdown with dish name, dietary mode, delivery room address, and phone number.
- **Cancelled-Only Roster (PDF & Excel)**: Targeted list of students who opted out of the meal.

---

## 8. Troubleshooting & Common Fixes

| Issue | Likely Cause | Solution |
| :--- | :--- | :--- |
| **"Cannot connect to WorkForce server" toast on login** | Frontend port mismatch (e.g. frontend ran on port 3003 instead of 3000) not included in backend CORS. | Open `backend/.env` and ensure `CORS_ORIGINS` includes `http://localhost:3003,http://localhost:3000`. Restart backend. |
| **MongoDB connection timeout on Render** | Render IP not allowed in MongoDB Atlas whitelist. | Go to [MongoDB Atlas Network Access](https://cloud.mongodb.com/v2#/security/network/whitelist) and add `0.0.0.0/0` (Allow Access from Anywhere). |
| **Password reset emails not received** | Brevo API key expired or sender email not verified. | Verify API key at [Brevo API Keys](https://app.brevo.com/settings/keys/api) and ensure `ayushmankitchen@gmail.com` is verified in Senders. |
| **Profile photos failing to upload** | Cloudinary credentials missing or `MEDIA_STORAGE` set incorrectly. | Ensure `MEDIA_STORAGE=cloudinary` and `CLOUDINARY_URL` is set in `backend/.env`. |
| **Port 8000 or 3000 already in use** | Old python or node background process running. | On macOS/Linux: `lsof -ti:8000 \| xargs kill -9` and `lsof -ti:3000 \| xargs kill -9`. |

---

## 👥 Authors & Maintainers
- **Original Developers**: Swagat & Nishant
- **Primary Support Email**: `ayushmankitchen@gmail.com`
- **License**: Proprietary software developed for Ayushman Kitchen Mess Operations.
