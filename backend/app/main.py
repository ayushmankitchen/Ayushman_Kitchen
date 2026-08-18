from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .core import settings
from .routers import admin, auth, reports, student

app=FastAPI(title="Ayushman Kitchen API",version="1.0.0")
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(",")],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
@app.exception_handler(RequestValidationError)
async def validation_error(_:Request,exc:RequestValidationError):return JSONResponse(status_code=422,content={"error":{"code":"VALIDATION_ERROR","message":"Invalid request data.","details":exc.errors()}})
@app.exception_handler(HTTPException)
async def http_error(_:Request,exc:HTTPException):
    detail=exc.detail if isinstance(exc.detail,dict) and "error" in exc.detail else {"error":{"code":"HTTP_ERROR","message":str(exc.detail)}}
    return JSONResponse(status_code=exc.status_code,content=detail)
@app.exception_handler(Exception)
async def unknown_error(_:Request,exc:Exception):
    if hasattr(exc,"status_code"):return JSONResponse(status_code=exc.status_code,content=exc.detail)
    return JSONResponse(status_code=500,content={"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred."}})
app.include_router(auth.router);app.include_router(student.router);app.include_router(admin.router);app.include_router(reports.router)
@app.get("/health")
def health():return {"status":"ok"}
