import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, GuestRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import PasswordSetupPage from './pages/PasswordSetupPage';
import AdminDashboard from './pages/admin/Dashboard';
import HerbCodesPage from './pages/admin/HerbCodesPage';
import MedicineCodesPage from './pages/admin/MedicineCodesPage';
import BillsPage from './pages/admin/BillsPage';
import HerbsPage from './pages/admin/HerbsPage';
import MedicinesPage from './pages/admin/MedicinesPage';
import FormulaPage from './pages/admin/FormulaPage';
import BackupPage from './pages/admin/BackupPage';
import ProfilePage from './pages/ProfilePage';
import DealerDashboard from './pages/dealer/Dashboard';
import CatalogPage from './pages/dealer/CatalogPage';
import DealerOrdersPage from './pages/dealer/OrdersPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/setup-password" element={<ProtectedRoute><PasswordSetupPage /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute roles={['ROLE_ADMIN', 'ROLE_VIEWER']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/query" element={<Navigate to="/admin/bills?tab=history" replace />} />
          <Route path="/admin/herb-codes" element={<ProtectedRoute roles={['ROLE_ADMIN', 'ROLE_VIEWER']}><HerbCodesPage /></ProtectedRoute>} />
          <Route path="/admin/medicine-codes" element={<ProtectedRoute roles={['ROLE_ADMIN', 'ROLE_VIEWER']}><MedicineCodesPage /></ProtectedRoute>} />
          <Route path="/admin/bills" element={<ProtectedRoute roles={['ROLE_ADMIN', 'ROLE_VIEWER']}><BillsPage /></ProtectedRoute>} />
          <Route path="/admin/herbs" element={<ProtectedRoute roles={['ROLE_ADMIN', 'ROLE_VIEWER']}><HerbsPage /></ProtectedRoute>} />
          <Route path="/admin/medicines" element={<ProtectedRoute roles={['ROLE_ADMIN', 'ROLE_VIEWER']}><MedicinesPage /></ProtectedRoute>} />
          <Route path="/admin/formula" element={<ProtectedRoute roles={['ROLE_ADMIN', 'ROLE_VIEWER']}><FormulaPage /></ProtectedRoute>} />
          <Route path="/admin/backup" element={<ProtectedRoute roles={['ROLE_ADMIN']}><BackupPage /></ProtectedRoute>} />
          <Route path="/admin/bulk-formula" element={<Navigate to="/admin/formula?tab=generate" replace />} />
          <Route path="/admin/production" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/orders" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/users" element={<Navigate to="/admin" replace />} />
          <Route path="/admin/profile" element={<ProtectedRoute roles={['ROLE_ADMIN', 'ROLE_VIEWER']}><ProfilePage /></ProtectedRoute>} />

          <Route path="/dealer" element={<ProtectedRoute roles={['ROLE_DEALER']}><DealerDashboard /></ProtectedRoute>} />
          <Route path="/dealer/catalog" element={<ProtectedRoute roles={['ROLE_DEALER']}><CatalogPage /></ProtectedRoute>} />
          <Route path="/dealer/orders" element={<ProtectedRoute roles={['ROLE_DEALER']}><DealerOrdersPage /></ProtectedRoute>} />
          <Route path="/dealer/profile" element={<ProtectedRoute roles={['ROLE_DEALER']}><ProfilePage portal="dealer" /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
