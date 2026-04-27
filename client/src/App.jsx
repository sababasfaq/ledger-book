import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
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

import logoImg from "./assets/logo.png";
import uniBg from "./assets/uni.png";

export default function App() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen relative overflow-hidden">
      {user && (
        <div
          className="fixed inset-0 pointer-events-none bg-center bg-no-repeat bg-contain opacity-[0.06] z-0"
          style={{ backgroundImage: `url(${uniBg})` }}
        />
      )}

      <div className="relative z-10">
        <header className="sticky top-0 bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={logoImg}
                alt="App Logo"
                className="w-10 h-10 object-contain"
              />
              <div className="font-semibold">Ledger Book</div>
            </div>

            {user ? (
              <div className="flex items-center gap-3">
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
                  <div className="text-xs px-2 py-1 rounded bg-slate-100 inline-block mt-1">
                    {user.role.toUpperCase()}
                  </div>
                </NavLink>

                <button
                  className="px-3 py-1 text-sm rounded bg-slate-900 text-white"
                  onClick={logout}
                >
                  Logout
                </button>
              </div>
            ) : null}
          </div>

          {user && (
            <nav className="bg-slate-100/70 border-t">
              <div className="max-w-7xl mx-auto px-4 py-2 flex gap-3 flex-wrap">
                <Tab to="/general-ledger" label="General Ledger" />
                <Tab to="/unofficial-ledger" label="Unofficial Ledger" />
                <Tab to="/student-association" label="Student Association" />
                <Tab to="/department-ledger" label="Department Ledger" />
                <Tab to="/departmental-cost" label="Departmental Cost" />
                <Tab to="/tax-return-challan" label="Tax Return Challan" />
                {user.role === "super_admin" && (
                  <>
                    <Tab to="/tax" label="Tax" />
                    <Tab to="/log-book" label="Log Book" />
                  </>
                )}
              </div>
            </nav>
          )}
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          <Routes>
            <Route
              path="/"
              element={
                user ? <Navigate to="/general-ledger" replace /> : <Login />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Tab({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `w-44 text-center px-3 py-1 rounded-md text-sm ${
          isActive ? "bg-slate-900 text-white" : "hover:bg-white"
        }`
      }
    >
      {label}
    </NavLink>
  );
}