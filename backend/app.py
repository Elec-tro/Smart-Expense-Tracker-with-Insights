from flask import Flask, request, jsonify, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from models import db, User, Expense, Budget
from datetime import datetime, date, timedelta
import numpy as np
import io
import csv
import os

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///../data/spendwise.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = 'spendwise-super-secret-key'
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=1)

db.init_app(app)
jwt = JWTManager(app)
CORS(app)

with app.app_context():
    db.create_all()

# --- Auth Routes ---

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    if User.query.filter_by(username=data['username']).first():
        return jsonify({"msg": "Username already exists"}), 400
    
    new_user = User(username=data['username'], password=data['password']) # In prod, hash this!
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"msg": "User created successfully"}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data['username'], password=data['password']).first()
    if not user:
        return jsonify({"msg": "Invalid credentials"}), 401
    
    access_token = create_access_token(identity=user.id)
    return jsonify(access_token=access_token, username=user.username)

# --- Expense Routes ---

@app.route('/api/expenses', methods=['GET'])
@jwt_required()
def get_expenses():
    user_id = get_jwt_identity()
    category = request.args.get('category')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    query = Expense.query.filter_by(user_id=user_id)
    
    if category:
        query = query.filter_by(category=category)
    if start_date:
        query = query.filter(Expense.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Expense.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    expenses = query.order_by(Expense.date.desc()).all()
    return jsonify([{
        "id": e.id,
        "amount": e.amount,
        "category": e.category,
        "description": e.description,
        "date": e.date.isoformat(),
        "is_recurring": e.is_recurring
    } for e in expenses])

@app.route('/api/expenses', methods=['POST'])
@jwt_required()
def add_expense():
    user_id = get_jwt_identity()
    data = request.get_json()
    new_expense = Expense(
        user_id=user_id,
        amount=float(data['amount']),
        category=data['category'],
        description=data.get('description', ''),
        date=datetime.strptime(data['date'], '%Y-%m-%d').date(),
        is_recurring=data.get('is_recurring', False)
    )
    db.session.add(new_expense)
    db.session.commit()
    return jsonify({"msg": "Expense added", "id": new_expense.id}), 201

@app.route('/api/expenses/<id>', methods=['DELETE'])
@jwt_required()
def delete_expense(id):
    user_id = get_jwt_identity()
    expense = Expense.query.filter_by(id=id, user_id=user_id).first()
    if not expense:
        return jsonify({"msg": "Expense not found"}), 404
    db.session.delete(expense)
    db.session.commit()
    return jsonify({"msg": "Expense deleted"})

# --- Budget Routes ---

@app.route('/api/budget', methods=['GET'])
@jwt_required()
def get_budget():
    user_id = get_jwt_identity()
    month = int(request.args.get('month', datetime.now().month))
    year = int(request.args.get('year', datetime.now().year))
    
    budgets = Budget.query.filter_by(user_id=user_id, month=month, year=year).all()
    return jsonify([{
        "category": b.category,
        "amount": b.amount
    } for b in budgets])

@app.route('/api/budget', methods=['POST'])
@jwt_required()
def set_budget():
    user_id = get_jwt_identity()
    data = request.get_json()
    month = data.get('month', datetime.now().month)
    year = data.get('year', datetime.now().year)
    
    # Update or Create
    existing = Budget.query.filter_by(user_id=user_id, category=data['category'], month=month, year=year).first()
    if existing:
        existing.amount = float(data['amount'])
    else:
        new_budget = Budget(
            user_id=user_id,
            category=data['category'],
            amount=float(data['amount']),
            month=month,
            year=year
        )
        db.session.add(new_budget)
    
    db.session.commit()
    return jsonify({"msg": "Budget updated"})

# --- AI Insights ---

@app.route('/api/insights', methods=['GET'])
@jwt_required()
def get_insights():
    user_id = get_jwt_identity()
    expenses = Expense.query.filter_by(user_id=user_id).all()
    
    if not expenses:
        return jsonify({"overspending": [], "prediction": 0, "msg": "Not enough data for insights"})

    # 1. Overspending Analysis (vs current month budget)
    current_month = datetime.now().month
    current_year = datetime.now().year
    
    budgets = Budget.query.filter_by(user_id=user_id, month=current_month, year=current_year).all()
    budget_dict = {b.category: b.amount for b in budgets}
    
    current_spending = {}
    for e in expenses:
        if e.date.month == current_month and e.date.year == current_year:
            current_spending[e.category] = current_spending.get(e.category, 0) + e.amount
    
    overspending = []
    for cat, spent in current_spending.items():
        if cat in budget_dict and spent > budget_dict[cat]:
            overspending.append({
                "category": cat,
                "spent": spent,
                "budget": budget_dict[cat],
                "diff": spent - budget_dict[cat]
            })
    
    # 2. Prediction (Simple linear trend using numpy)
    # Group by month/year
    monthly_data = {}
    for e in expenses:
        key = (e.date.year, e.date.month)
        monthly_data[key] = monthly_data.get(key, 0) + e.amount
    
    sorted_months = sorted(monthly_data.keys())
    y = [monthly_data[k] for k in sorted_months]
    
    if len(y) >= 2:
        x = np.arange(len(y))
        z = np.polyfit(x, y, 1)
        p = np.poly1d(z)
        prediction = max(0, p(len(y))) # Predict next month
    elif len(y) == 1:
        prediction = y[0]
    else:
        prediction = 0

    return jsonify({
        "overspending": overspending,
        "prediction": round(float(prediction), 2),
        "total_this_month": sum(current_spending.values())
    })

# --- Export ---

@app.route('/api/export/csv', methods=['GET'])
@jwt_required()
def export_csv():
    user_id = get_jwt_identity()
    expenses = Expense.query.filter_by(user_id=user_id).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Date', 'Category', 'Amount', 'Description', 'Recurring'])
    for e in expenses:
        writer.writerow([e.date.isoformat(), e.category, e.amount, e.description, e.is_recurring])
    
    output.seek(0)
    return send_file(
        io.BytesIO(output.getvalue().encode()),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f'spendwise_report_{date.today().isoformat()}.csv'
    )

if __name__ == '__main__':
    app.run(debug=True, port=5000)
