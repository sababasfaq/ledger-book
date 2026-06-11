import { useEffect, useState } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import { api } from "./api";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import GeneralLedger from "./pages/GeneralLedger.jsx";
import UnofficialLedger from "./pages/UnofficialLedger.jsx";
import StudentAssociation from "./pages/StudentAssociation.jsx";
import DepartmentalCost from "./pages/DepartmentalCost.jsx";
import AdminUsers from "./pages/AdminUsers.jsx";
import NotFound from "./pages/NotFound.jsx";
import { useAuth } from "./state/AuthContext.jsx";
import DepartmentLedger from "./pages/DepartmentLedger.jsx";
import LogBook from "./pages/LogBook.jsx";
import TaxPage from "./pages/TaxPage.jsx";
import Profile from "./pages/Profile.jsx";
import TaxReturnChallanPage from "./pages/TaxReturnChallanPage.jsx";
import InstructionsPage from "./pages/InstructionsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import logoImg from "./assets/logo.png";
import uniBg from "./assets/uni.png";
import { Bell, ChevronDown } from "lucide-react";

export default function App() {
  const { user, logout } = useAuth();
  const [instructionBadge, setInstructionBadge] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const refreshBadges = async () => {
    if (!user) return;
    
    if (user.role === "official") {
      try {
        const { count } = await api.getInstructionsPendingCount();
        setInstructionBadge(count ?? 0);
      } catch {
        setInstructionBadge(0);
      }
    }

    if (user.role === "super_admin") {
      try {
        const list = await api.listPendingUsers();
        setPendingApprovals(list.length || 0);
      } catch {
        setPendingApprovals(0);
      }
    }
  };

  useEffect(() => {
    refreshBadges();
    const interval = setInterval(refreshBadges, 60000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const onUpdate = () => refreshBadges();
    window.addEventListener("instructions-updated", onUpdate);
    return () => window.removeEventListener("instructions-updated", onUpdate);
  }, [user]);

  const badgeCount = user?.role === "super_admin" ? pendingApprovals : instructionBadge;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {user && (
        <div
          className="fixed inset-0 pointer-events-none bg-center bg-no-repeat bg-contain opacity-[0.06] z-0"
          style={{ backgroundImage: `url(${uniBg})` }}
        />
      )}

      <div className="relative z-10">
        <header className="sticky top-0 bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={logoImg}
                alt="App Logo"
                className="w-10 h-10 object-contain"
              />
              <div className="font-semibold text-lg">Ledger Book</div>
            </div>

            {user ? (
              <div className="flex items-center gap-4">
                {/* Notification Bell */}
                <div className="relative">
                  <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="p-2 rounded-full hover:bg-slate-100 transition relative"
                    aria-label="Notifications"
                    aria-haspopup="true"
                    aria-expanded={showNotifications}
                  >
                    <Bell size={22} className="text-slate-600" />
                    {badgeCount > 0 && (
                      <span className="absolute top-1 right-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
                        {badgeCount}
                      </span>
                    )}
                  </button>

                  {showNotifications && (
                    <div 
                      role="dialog" 
                      aria-modal="true" 
                      aria-label="Notifications panel"
                      className="absolute right-0 mt-2 w-72 bg-white border rounded-lg shadow-xl z-50 overflow-hidden"
                    >
                      <div className="p-3 border-b bg-slate-50 font-semibold text-sm">Notifications</div>
                      <div className="max-h-80 overflow-y-auto">
                        {user.role === "super_admin" && pendingApprovals > 0 && (
                          <NavLink 
                            to="/admin/users" 
                            onClick={() => setShowNotifications(false)}
                            className="block p-4 hover:bg-slate-50 border-b last:border-0"
                          >
                            <div className="text-sm font-medium">Pending Approvals</div>
                            <div className="text-xs text-slate-500 mt-1">{pendingApprovals} user(s) waiting for approval.</div>
                          </NavLink>
                        )}
                        {user.role === "official" && instructionBadge > 0 && (
                          <NavLink 
                            to="/instructions" 
                            onClick={() => setShowNotifications(false)}
                            className="block p-4 hover:bg-slate-50 border-b last:border-0"
                          >
                            <div className="text-sm font-medium">Pending Instructions</div>
                            <div className="text-xs text-slate-500 mt-1">You have {instructionBadge} instruction(s) to complete.</div>
                          </NavLink>
                        )}
                        {badgeCount === 0 && (
                          <div className="p-8 text-center text-slate-400 text-sm">No new notifications</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-5 border-l pl-4">
                  <img
                    src={user.pictureUrl || logoImg}
                    alt="Profile"
                    className="w-10 h-10 rounded-full object-cover border"
                    onError={(e) => {
                      e.currentTarget.src = logoImg;
                    }}
                  />

                  <NavLink
                    to="/profile"
                    className="text-right hover:opacity-80 transition"
                  >
                    <div className="text-sm font-medium leading-tight">
                      {user.name}
                    </div>
                    <div className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 inline-block mt-1">
                      {user.role.toUpperCase()}
                    </div>
                  </NavLink>

                  <button
                    className="px-4 py-2 text-sm font-medium rounded bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm"
                    onClick={logout}
                    aria-label="Log out of Ledger Book"
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {user && (
            <nav className="bg-slate-100/70 border-t" aria-label="Main navigation">
              <ul role="list" className="max-w-7xl mx-auto px-4 py-2 flex gap-4 flex-wrap list-none">
                <li><Tab to="/dashboard" label="Dashboard" /></li>
                <li><Tab to="/general-ledger" label="General Ledger" /></li>
                <li><Tab to="/unofficial-ledger" label="Unofficial Ledger" /></li>
                <li><Tab to="/student-association" label="Student Association" /></li>
                <li><Tab to="/department-ledger" label="Department Ledger" /></li>
                <li><Tab to="/departmental-cost" label="Departmental Cost" /></li>
                <li><Tab to="/reports" label="Reports" /></li>
                <li><Tab to="/tax-return-challan" label="Tax Return Challan" /></li>
                <li>
                  <Tab
                    to="/instructions"
                    label="Instructions"
                    badge={instructionBadge}
                  />
                </li>
                {user.role === "super_admin" && (
                  <>
                    <li><Tab to="/tax" label="Tax" /></li>
                    <li><Tab to="/log-book" label="Log Book" /></li>
                  </>
                )}
              </ul>
            </nav>
          )}
        </header>

        <main id="main-content" aria-label="Page content" className="max-w-7xl mx-auto px-4 py-6">
          <Routes>
            <Route
              path="/"
              element={
                user ? <Navigate to="/dashboard" replace /> : <Login />
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/general-ledger"
              element={
                <ProtectedRoute>
                  <GeneralLedger />
                </ProtectedRoute>
              }
            />
            <Route
              path="/unofficial-ledger"
              element={
                <ProtectedRoute>
                  <UnofficialLedger />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student-association"
              element={
                <ProtectedRoute>
                  <StudentAssociation />
                </ProtectedRoute>
              }
            />
            <Route
              path="/department-ledger"
              element={
                <ProtectedRoute>
                  <DepartmentLedger />
                </ProtectedRoute>
              }
            />
            <Route
              path="/departmental-cost"
              element={
                <ProtectedRoute>
                  <DepartmentalCost />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tax"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <TaxPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <AdminUsers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/log-book"
              element={
                <ProtectedRoute requireSuperAdmin>
                  <LogBook />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tax-return-challan"
              element={
                <ProtectedRoute>
                  <TaxReturnChallanPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/instructions"
              element={
                <ProtectedRoute>
                  <InstructionsPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Tab({ to, label, badge = 0 }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative w-64 h-14 flex items-center justify-center px-4 rounded-xl text-[14px] font-bold uppercase tracking-wider transition-all duration-200 shrink-0 ${
          isActive 
            ? "bg-slate-900 text-white shadow-xl shadow-slate-200 scale-105 z-10" 
            : "text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-md"
        }`
      }
    >
      <span className="truncate">{label}</span>
      {badge > 0 && (
        <span
          className="absolute -top-2 -right-1 min-w-[24px] h-[24px] px-1 flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-black border-2 border-white shadow-md"
          aria-label={`${badge} pending instructions`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}