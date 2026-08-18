from datetime import date
from io import BytesIO
from fastapi import APIRouter, Depends, Response
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import func, select
from ..deps import CurrentUser, Db, require_roles
from ..models import MealOption, MealSelection, Role, SelectionStatus

router=APIRouter(prefix="/admin/reports",tags=["reports"])
Admin=Depends(require_roles(Role.ADMIN))
def rows(db:Db, report_date:date):
    statement=select(MealSelection.meal_type,MealOption.name,func.count(MealSelection.id)).join(MealOption,MealOption.id==MealSelection.meal_option_id,isouter=True).where(MealSelection.date==report_date,MealSelection.status==SelectionStatus.SELECTED).group_by(MealSelection.meal_type,MealOption.name).order_by(MealSelection.meal_type,MealOption.name)
    return [{"meal_type":m.value,"meal":name or "Standard default meal","count":count} for m,name,count in db.execute(statement).all()]
@router.get("")
def report(report_date:date,db:Db,_=Admin):return {"date":report_date,"items":rows(db,report_date)}
@router.get("/pdf")
def pdf(report_date:date,db:Db,_=Admin):
    output=BytesIO();c=canvas.Canvas(output,pagesize=A4);c.setTitle(f"Kitchen report {report_date}");c.setFont("Helvetica-Bold",16);c.drawString(48,800,"Ayushman Kitchen — Daily Meal Report");c.setFont("Helvetica",11);c.drawString(48,778,f"Date: {report_date.isoformat()}");y=740
    for item in rows(db,report_date):c.drawString(58,y,f"{item['meal_type'].title()} — {item['meal']}: {item['count']}");y-=24
    c.save();return Response(output.getvalue(),media_type="application/pdf",headers={"Content-Disposition":f'attachment; filename="meal-report-{report_date}.pdf"'})
@router.get("/excel")
def excel(report_date:date,db:Db,_=Admin):
    wb=Workbook();ws=wb.active;ws.title="Meal report";ws.append(["Ayushman Kitchen Daily Meal Report"]);ws.append(["Date",report_date.isoformat()]);ws.append([]);ws.append(["Meal Type","Option","Confirmed Count"])
    for item in rows(db,report_date):ws.append([item["meal_type"],item["meal"],item["count"]])
    output=BytesIO();wb.save(output);return Response(output.getvalue(),media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",headers={"Content-Disposition":f'attachment; filename="meal-report-{report_date}.xlsx"'})
