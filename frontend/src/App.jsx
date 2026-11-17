import { Navigate, Route, Routes } from 'react-router-dom';
import Shell from './components/Shell';
import { Spinner } from './components/ui';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import RecordsPage from './pages/RecordsPage';
import LetterView from './pages/LetterView';
import DataUpload from './pages/DataUpload';
import DraftEditor from './pages/DraftEditor';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminLogs from './pages/admin/Logs';
import AdminDataManagement from './pages/admin/DataManagement';
import AdminReports from './pages/admin/Reports';
import AdminSettings from './pages/admin/Settings';

function RequireAuth({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'compliance_admin') return <Navigate to="/" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={user.role === 'compliance_admin' ? '/admin' : '/'} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />

      <Route path="/letters/:id/print" element={<RequireAuth><LetterView /></RequireAuth>} />

      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="claimed" element={<RecordsPage key="claimed" scope="claimed" />} />
        <Route path="unclaimed" element={<RecordsPage key="unclaimed" scope="unclaimed" />} />
        <Route path="letters" element={<RecordsPage key="letters" scope="letters" />} />
        <Route path="upload" element={<DataUpload />} />
        <Route path="upload/:draftId" element={<DraftEditor />} />
      </Route>

      <Route path="/admin" element={<RequireAuth admin><Shell admin /></RequireAuth>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="logs" element={<AdminLogs />} />
        <Route path="data" element={<AdminDataManagement />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
