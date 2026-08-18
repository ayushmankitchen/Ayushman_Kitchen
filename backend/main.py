import os
from backend.server import app

# Expose 'app' to be used by uvicorn: `uvicorn backend.main:app --reload`

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)

