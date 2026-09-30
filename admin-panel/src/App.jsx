import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Tracking from './pages/Tracking.jsx';
import Incomplete from './pages/Incomplete.jsx';
import FormBuilder from './pages/FormBuilder.jsx';
import Delivery from './pages/Delivery.jsx';
import Offers from './pages/Offers.jsx';
import Settings from './pages/Settings.jsx';
import PageEditor from './pages/PageEditor.jsx';
import Dashboard from './pages/Dashboard.jsx';
import System from './pages/System.jsx';

function Protected({ children }) {
  const { admin, loading } = useAuth();
  if (loading) return <div className="center-screen muted">Loading…</div>;
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Navigate to="/orders" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/incomplete" element={<Incomplete />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/form-builder" element={<FormBuilder />} />
        <Route path="/delivery" element={<Delivery />} />
        <Route path="/page-editor" element={<PageEditor />} />
        <Route path="/tracking" element={<Tracking />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/system" element={<System />} />
        {/* Phase 4: Dashboard mounts here later. */}
      </Route>
      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  );
}
