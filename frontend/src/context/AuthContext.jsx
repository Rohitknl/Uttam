import { createContext, useContext, useState, useEffect } from 'react';
import { authApi, settingsApi } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('ul_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);
  const [crudPasswordSet, setCrudPasswordSet] = useState(false);

  const refreshSecurity = async (role) => {
    if (role !== 'ROLE_ADMIN') {
      setCrudPasswordSet(true);
      return true;
    }
    try {
      const status = await settingsApi.security();
      setCrudPasswordSet(Boolean(status.crudPasswordSet));
      return true;
    } catch {
      // Do not assume password is set on failure — that blocks first-time setup / reset.
      return false;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('ul_token');
    if (token && user) {
      authApi.me()
        .then(async (u) => {
          setUser(u);
          localStorage.setItem('ul_user', JSON.stringify(u));
          await refreshSecurity(u.role);
        })
        .catch(() => { logout(); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const result = await authApi.login({ username, password });
    localStorage.setItem('ul_token', result.token);
    const userData = {
      userId: result.userId,
      username: result.username,
      role: result.role,
      fullName: result.fullName,
      email: result.email || null,
      mustChangePassword: Boolean(result.mustChangePassword),
    };
    localStorage.setItem('ul_user', JSON.stringify(userData));
    setUser(userData);

    let crudSet = false;
    if (result.role === 'ROLE_ADMIN') {
      try {
        const status = await settingsApi.security();
        crudSet = Boolean(status.crudPasswordSet);
      } catch {
        crudSet = false;
      }
    }
    setCrudPasswordSet(crudSet);

    return {
      ...result,
      needsPasswordSetup:
        Boolean(result.mustChangePassword)
        || (result.role === 'ROLE_ADMIN' && !crudSet),
    };
  };

  const logout = () => {
    localStorage.removeItem('ul_token');
    localStorage.removeItem('ul_user');
    setUser(null);
    setCrudPasswordSet(false);
  };

  const refreshUser = async () => {
    const u = await authApi.me();
    setUser(u);
    localStorage.setItem('ul_user', JSON.stringify(u));
    await refreshSecurity(u.role);
    return u;
  };

  const isAdmin = user?.role === 'ROLE_ADMIN';
  const isViewer = user?.role === 'ROLE_VIEWER';
  const isDealer = user?.role === 'ROLE_DEALER';
  const canWrite = isAdmin;
  const needsLoginPasswordSetup = Boolean(user?.mustChangePassword);
  const needsCrudPasswordSetup = isAdmin && !crudPasswordSet;
  const needsPasswordSetup = needsLoginPasswordSetup || needsCrudPasswordSetup;

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      loading,
      isAdmin,
      isViewer,
      isDealer,
      canWrite,
      crudPasswordSet,
      needsLoginPasswordSetup,
      needsCrudPasswordSetup,
      needsPasswordSetup,
      refreshUser,
      refreshSecurity: () => refreshSecurity(user?.role),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
