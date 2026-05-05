const { useState, useEffect, useMemo } = React;

// --- Safe Access to Globals ---
const getRecharts = () => window.Recharts || {};
const getLucide = () => window.lucide || {};

const API_BASE = 'http://localhost:5000/api';

// --- Components ---

const Navbar = ({ username, onLogout }) => {
    const { Wallet, LogOut } = getLucide();
    return (
        <nav className="navbar">
            <div className="nav-logo">
                <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
                    {Wallet ? <Wallet size={24} color="white" /> : '💰'}
                </div>
                <span>SpendWise</span>
            </div>
            <div className="nav-user">
                <span style={{ fontWeight: 600 }}>{username}</span>
                <button onClick={onLogout} className="btn btn-outline" style={{ padding: '8px 12px' }}>
                    {LogOut ? <LogOut size={18} /> : 'Logout'}
                </button>
            </div>
        </nav>
    );
};

const StatCard = ({ title, value, icon: Icon, color, trend }) => (
    <div className="card glass animate-fade-in">
        <div className="card-title">
            {title}
            {Icon && <Icon size={20} color={color} />}
        </div>
        <div className="card-value">{value}</div>
        {trend && (
            <div className="card-trend" style={{ color: trend.startsWith('+') ? 'var(--danger)' : 'var(--success)' }}>
                {trend} from last month
            </div>
        )}
    </div>
);

const ExpenseForm = ({ onAdd, categories }) => {
    const [data, setData] = useState({ amount: '', category: 'Food', description: '', date: new Date().toISOString().split('T')[0] });
    const { Plus } = getLucide();

    const handleSubmit = (e) => {
        e.preventDefault();
        onAdd(data);
        setData({ amount: '', category: 'Food', description: '', date: new Date().toISOString().split('T')[0] });
    };

    return (
        <form onSubmit={handleSubmit} className="glass card animate-fade-in">
            <h3 style={{ marginBottom: '1.5rem' }}>Add Expense</h3>
            <div className="input-group">
                <label>Amount ($)</label>
                <input type="number" step="0.01" required value={data.amount} onChange={e => setData({...data, amount: e.target.value})} placeholder="0.00" />
            </div>
            <div className="input-group">
                <label>Category</label>
                <select value={data.category} onChange={e => setData({...data, category: e.target.value})}>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>
            <div className="input-group">
                <label>Date</label>
                <input type="date" required value={data.date} onChange={e => setData({...data, date: e.target.value})} />
            </div>
            <div className="input-group">
                <label>Description</label>
                <input type="text" value={data.description} onChange={e => setData({...data, description: e.target.value})} placeholder="Lunch, Taxi, etc." />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                {Plus && <Plus size={18} />} Add Transaction
            </button>
        </form>
    );
};

const BudgetModal = ({ currentBudget, onUpdate }) => {
    const [amount, setAmount] = useState(currentBudget || 0);
    return (
        <div className="glass card animate-fade-in">
            <h3 style={{ marginBottom: '1.5rem' }}>Set Monthly Budget</h3>
            <div className="input-group">
                <label>Monthly Limit ($)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <button onClick={() => onUpdate(amount)} className="btn btn-primary" style={{ width: '100%' }}>
                Update Budget
            </button>
        </div>
    );
};

// --- Main App ---

const App = () => {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [user, setUser] = useState(localStorage.getItem('username'));
    const [expenses, setExpenses] = useState([]);
    const [insights, setInsights] = useState(null);
    const [budget, setBudget] = useState(0);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState('login');

    const categories = ['Food', 'Travel', 'Shopping', 'Entertainment', 'Bills', 'Other'];
    const COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#9ca3af'];

    const { 
        PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend 
    } = getRecharts();

    const { 
        TrendingUp, Trash2, Calendar, AlertCircle, Download
    } = getLucide();

    useEffect(() => {
        if (token) {
            fetchData();
            setView('dashboard');
        }
    }, [token]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const [expRes, insRes, budRes] = await Promise.all([
                axios.get(`${API_BASE}/expenses`, config),
                axios.get(`${API_BASE}/insights`, config),
                axios.get(`${API_BASE}/budget`, config)
            ]);
            setExpenses(expRes.data);
            setInsights(insRes.data);
            const totalBudget = budRes.data.find(b => b.category === 'Total');
            setBudget(totalBudget ? totalBudget.amount : 0);
        } catch (err) {
            console.error(err);
            if (err.response?.status === 401) logout();
        }
        setLoading(false);
    };

    const login = async (username, password) => {
        try {
            const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
            localStorage.setItem('token', res.data.access_token);
            localStorage.setItem('username', res.data.username);
            setToken(res.data.access_token);
            setUser(res.data.username);
        } catch (err) {
            alert('Login failed: ' + (err.response?.data?.msg || 'Unknown error'));
        }
    };

    const signup = async (username, password) => {
        try {
            await axios.post(`${API_BASE}/auth/signup`, { username, password });
            alert('Account created! Please login.');
            setView('login');
        } catch (err) {
            alert('Signup failed: ' + (err.response?.data?.msg || 'Unknown error'));
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        setToken(null);
        setUser(null);
        setView('login');
    };

    const addExpense = async (data) => {
        try {
            await axios.post(`${API_BASE}/expenses`, data, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch (err) {
            alert('Failed to add expense');
        }
    };

    const deleteExpense = async (id) => {
        try {
            await axios.delete(`${API_BASE}/expenses/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch (err) {
            alert('Failed to delete expense');
        }
    };

    const updateBudget = async (amount) => {
        try {
            await axios.post(`${API_BASE}/budget`, { category: 'Total', amount }, { headers: { Authorization: `Bearer ${token}` } });
            fetchData();
        } catch (err) {
            alert('Failed to update budget');
        }
    };

    const exportData = () => {
        window.open(`${API_BASE}/export/csv?jwt=${token}`, '_blank');
    };

    const chartData = useMemo(() => {
        const data = {};
        expenses.forEach(e => {
            data[e.category] = (data[e.category] || 0) + e.amount;
        });
        return Object.keys(data).map(k => ({ name: k, value: data[k] }));
    }, [expenses]);

    if (!token) {
        return (
            <div className="auth-container">
                <div className="glass auth-card animate-fade-in">
                    <h2 className="auth-title">SpendWise</h2>
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>
                        {view === 'login' ? 'Welcome back! Please login.' : 'Create your account.'}
                    </p>
                    
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const u = e.target.username.value;
                        const p = e.target.password.value;
                        view === 'login' ? login(u, p) : signup(u, p);
                    }}>
                        <div className="input-group">
                            <label>Username</label>
                            <input name="username" type="text" required />
                        </div>
                        <div className="input-group">
                            <label>Password</label>
                            <input name="password" type="password" required />
                        </div>
                        <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                            {view === 'login' ? 'Login' : 'Sign Up'}
                        </button>
                    </form>
                    
                    <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem' }}>
                        {view === 'login' ? "Don't have an account? " : "Already have an account? "}
                        <span 
                            style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => setView(view === 'login' ? 'signup' : 'login')}
                        >
                            {view === 'login' ? 'Sign Up' : 'Login'}
                        </span>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <React.Fragment>
            <Navbar username={user} onLogout={logout} />
            <main className="main-content">
                <div className="dashboard-grid">
                    <StatCard 
                        title="Total Spent (Month)" 
                        value={`$${insights?.total_this_month || 0}`} 
                        icon={TrendingUp} 
                        color="var(--secondary)"
                    />
                    <StatCard 
                        title="Monthly Budget" 
                        value={`$${budget}`} 
                        icon={Calendar} 
                        color="var(--primary)"
                    />
                    <StatCard 
                        title="AI Prediction (Next Month)" 
                        value={`$${insights?.prediction || 0}`} 
                        icon={TrendingUp} 
                        color="var(--success)"
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <ExpenseForm onAdd={addExpense} categories={categories} />
                        <BudgetModal currentBudget={budget} onUpdate={updateBudget} />
                        
                        <div className="glass card animate-fade-in">
                            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {AlertCircle && <AlertCircle size={20} color="var(--warning)" />} AI Insights
                            </h3>
                            {insights?.overspending?.length > 0 ? (
                                insights.overspending.map((o, i) => (
                                    <div key={i} className="insight-alert insight-warning">
                                        <div>
                                            <strong>{o.category} Overspending!</strong><br/>
                                            <span style={{ fontSize: '0.8rem' }}>You've exceeded budget by ${o.diff.toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="insight-alert insight-success">
                                    <span>All spending is within budget. Great job!</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="glass card animate-fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h3>Spending Breakdown</h3>
                            <button onClick={exportData} className="btn btn-outline" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                                {Download && <Download size={14} />} Export CSV
                            </button>
                        </div>
                        <div className="chart-container">
                            {PieChart && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ background: 'var(--bg-dark)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
                                            itemStyle={{ color: 'white' }}
                                        />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>

                <div className="glass card animate-fade-in">
                    <h3 style={{ marginBottom: '1.5rem' }}>Recent Transactions</h3>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.map(e => (
                                    <tr key={e.id}>
                                        <td>{new Date(e.date).toLocaleDateString()}</td>
                                        <td>
                                            <span className={`category-badge badge-${e.category.toLowerCase()}`}>
                                                {e.category}
                                            </span>
                                        </td>
                                        <td>{e.description || '-'}</td>
                                        <td style={{ fontWeight: 600 }}>${e.amount.toFixed(2)}</td>
                                        <td>
                                            <button 
                                                onClick={() => deleteExpense(e.id)} 
                                                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                                            >
                                                {Trash2 && <Trash2 size={16} />}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {expenses.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                            No transactions found. Add your first expense!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </React.Fragment>
    );
};

// --- Initial Render ---
const init = () => {
    const rootEl = document.getElementById('root');
    if (rootEl && window.ReactDOM) {
        const root = ReactDOM.createRoot(rootEl);
        root.render(<App />);
    } else {
        setTimeout(init, 100);
    }
};
init();
