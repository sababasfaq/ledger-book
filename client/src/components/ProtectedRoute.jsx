import { Navigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";

export default function ProtectedRoute({ children, requireSuperAdmin }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (requireSuperAdmin && user.role !== "super_admin") return <div className="p-4">Super Admin only.</div>;
  return children;
}
