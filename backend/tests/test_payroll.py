from backend.services.payroll import PayrollService


def test_calendar_day_payroll_half_day_rounds_once():
    worker = {"salary": 31000}
    attendance = [
        {"date": "2026-08-01", "status": "Present"},
        {"date": "2026-08-02", "status": "Present"},
        {"date": "2026-08-03", "status": "Half Day"},
        {"date": "2026-08-04", "status": "Absent"},
    ]
    result = PayrollService.calculate_worker_month_summary(worker, attendance, [], [], "2026-08-14")
    assert result["earned_salary"] == 2500.00
    assert result["daily_rate"] == 1000.00


def test_advance_and_salary_payment_reduce_remaining():
    worker = {"salary": 31000}
    attendance = [{"date": f"2026-08-{day:02d}", "status": "Present"} for day in range(1, 11)]
    payments = [
        {"date": "2026-08-05", "type": "ADVANCE", "amount": 3000, "deleted_at": None},
        {"date": "2026-08-06", "type": "SALARY_PAYMENT", "amount": 2000, "deleted_at": None},
    ]
    result = PayrollService.calculate_worker_month_summary(worker, attendance, payments, [], "2026-08-14")
    assert result["earned_salary"] == 10000.00
    assert result["remaining_payable"] == 5000.00


def test_soft_deleted_payment_does_not_count():
    worker = {"salary": 31000}
    attendance = [{"date": "2026-08-01", "status": "Present"}]
    payments = [{"date": "2026-08-01", "type": "SALARY_PAYMENT", "amount": 400, "deleted_at": "2026-08-02T00:00:00Z"}]
    result = PayrollService.calculate_worker_month_summary(worker, attendance, payments, [], "2026-08-14")
    assert result["paid_this_month"] == 0
    assert result["remaining_payable"] == 1000
