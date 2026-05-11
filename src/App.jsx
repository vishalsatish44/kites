import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Shell from './components/Shell';
import Overview from './pages/Overview';
import WBRManagement from './pages/WBRManagement';
import IndividualDashboard from './pages/IndividualDashboard';
import DayWiseSales from './pages/DayWiseSales';
import SalesBreakup from './pages/SalesBreakup';
import DemoTracking from './pages/DemoTracking';
import TeamPerformance from './pages/TeamPerformance';
import Goals from './pages/Goals';
import CurrencyConverter from './pages/CurrencyConverter';
import TimezoneDashboard from './pages/TimezoneDashboard';
import TargetManagement from './pages/TargetManagement';
import Attendance from './pages/Attendance';
import AfterSalesData from './pages/AfterSalesData';
import IncentiveConfigPage from './pages/IncentiveConfig';
import AdminPanel from './pages/AdminPanel';
import Login from './pages/Login';
import ModernDashboard from './pages/ModernDashboard';
import { useAuth } from './contexts/AuthContext';
import { APP_ROLES } from './lib/schema';
import { supabaseReady } from './lib/supabase';

function RoleRoute({ allowed, children }) {
  const { role } = useAuth();
  if (!allowed.includes(role)) return <Navigate to="/" replace />;
  return children;
}

function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  // If Supabase isn't configured, fall back to dev-mode role switcher (no login required).
  if (!supabaseReady()) return children;
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

const M = APP_ROLES.MANAGEMENT;
const S = APP_ROLES.SALES;
const PS = APP_ROLES.PRESALES;
const AR = APP_ROLES.AR;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/modern" element={<RequireAuth><ModernDashboard /></RequireAuth>} />
        <Route element={<RequireAuth><Shell /></RequireAuth>}>
          <Route index element={<Overview />} />
          <Route path="wbr"           element={<RoleRoute allowed={[M]}><WBRManagement /></RoleRoute>} />
          <Route path="me"            element={<IndividualDashboard />} />
          <Route path="day-wise"      element={<RoleRoute allowed={[M, S]}><DayWiseSales /></RoleRoute>} />
          <Route path="sales-breakup" element={<RoleRoute allowed={[M, S, AR]}><SalesBreakup /></RoleRoute>} />
          <Route path="demos"         element={<DemoTracking />} />
          <Route path="team-monthly"  element={<RoleRoute allowed={[M]}><TeamPerformance /></RoleRoute>} />
          <Route path="goals"         element={<RoleRoute allowed={[M]}><Goals /></RoleRoute>} />
          <Route path="currency"      element={<CurrencyConverter />} />
          <Route path="timezones"     element={<TimezoneDashboard />} />
          <Route path="targets"       element={<RoleRoute allowed={[M]}><TargetManagement /></RoleRoute>} />
          <Route path="attendance"    element={<RoleRoute allowed={[M, S, PS]}><Attendance /></RoleRoute>} />
          <Route path="after-sales"   element={<RoleRoute allowed={[M, S, AR]}><AfterSalesData /></RoleRoute>} />
          <Route path="incentives"    element={<RoleRoute allowed={[M]}><IncentiveConfigPage /></RoleRoute>} />
          <Route path="admin"         element={<RoleRoute allowed={[M]}><AdminPanel /></RoleRoute>} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

