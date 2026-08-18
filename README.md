# Ayushman Kitchen

Meal-subscription management for students. The repository contains a FastAPI/PostgreSQL API and React/Vite client.

## Run locally

1. Copy `.env.example` to `.env` and set a strong `SECRET_KEY`.
2. Start PostgreSQL and create the database specified by `DATABASE_URL`.
3. Backend: `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && alembic upgrade head && uvicorn app.main:app --reload`
4. Frontend: `cd frontend && npm install && npm run dev`

The API is served on `http://localhost:8000`; Vite defaults to `http://localhost:5173`.

## Tests

`cd backend && pytest`

All meal actions are validated on the server in Asia/Kolkata time. Seed meal options are intentionally not created automatically: admins manage the catalogue through the API.
