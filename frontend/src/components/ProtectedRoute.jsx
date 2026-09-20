import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, roles }) {
  const { user, loading, needsPasswordSetup } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-forest-700" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    if (user.role === 'ROLE_DEALER') return <Navigate to="/dealer" replace />;
    return <Navigate to="/admin" replace />;
  }
  if (needsPasswordSetup && location.pathname !== '/setup-password') {
    return <Navigate to="/setup-password" replace />;
  }
  return children;
}

export function GuestRoute({ children }) {
  const { user, loading, needsPasswordSetup } = useAuth();
  if (loading) return null;
  if (user) {
    if (needsPasswordSetup) return <Navigate to="/setup-password" replace />;
    if (user.role === 'ROLE_DEALER') return <Navigate to="/dealer" replace />;
    return <Navigate to="/admin" replace />;
  }
  return children;
}
