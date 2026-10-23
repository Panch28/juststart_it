import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from './lib/auth';
import { AppLayout } from './components/layout/AppLayout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ProjectForm from './pages/ProjectForm';
import IPR from './pages/IPR';
import IPRDetail from './pages/IPRDetail';
import IPRForm from './pages/IPRForm';
import Approvals from './pages/Approvals';
import ApprovalDetail from './pages/ApprovalDetail';
import Startups from './pages/Startups';
import StartupDetail from './pages/StartupDetail';
import StartupForm from './pages/StartupForm';
import Mentors from './pages/Mentors';
import Funding from './pages/Funding';
import FundingDetail from './pages/FundingDetail';
import Documents from './pages/Documents';
import Analytics from './pages/Analytics';
import Notifications from './pages/Notifications';
import Users from './pages/Users';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <Spinner label="Loading your workspace…" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/** Blocks a module when the signed-in role does not include it. */
function ModuleGate({ module, children }: { module: string; children: ReactElement }) {
  const { canAccess } = useAuth();
  if (!canAccess(module)) return <NotFound restricted />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route
          path="projects"
          element={
            <ModuleGate module="projects">
              <Projects />
            </ModuleGate>
          }
        />
        <Route
          path="projects/new"
          element={
            <ModuleGate module="projects">
              <ProjectForm />
            </ModuleGate>
          }
        />
        <Route
          path="projects/:id"
          element={
            <ModuleGate module="projects">
              <ProjectDetail />
            </ModuleGate>
          }
        />
        <Route
          path="projects/:id/edit"
          element={
            <ModuleGate module="projects">
              <ProjectForm />
            </ModuleGate>
          }
        />
        <Route
          path="ipr"
          element={
            <ModuleGate module="ipr">
              <IPR />
            </ModuleGate>
          }
        />
        <Route
          path="ipr/new"
          element={
            <ModuleGate module="ipr">
              <IPRForm />
            </ModuleGate>
          }
        />
        <Route
          path="ipr/:id"
          element={
            <ModuleGate module="ipr">
              <IPRDetail />
            </ModuleGate>
          }
        />
        <Route
          path="ipr/:id/edit"
          element={
            <ModuleGate module="ipr">
              <IPRForm />
            </ModuleGate>
          }
        />
        <Route
          path="approvals"
          element={
            <ModuleGate module="approvals">
              <Approvals />
            </ModuleGate>
          }
        />
        <Route
          path="approvals/:id"
          element={
            <ModuleGate module="approvals">
              <ApprovalDetail />
            </ModuleGate>
          }
        />
        <Route
          path="startups"
          element={
            <ModuleGate module="startups">
              <Startups />
            </ModuleGate>
          }
        />
        <Route
          path="startups/new"
          element={
            <ModuleGate module="startups">
              <StartupForm />
            </ModuleGate>
          }
        />
        <Route
          path="startups/:id"
          element={
            <ModuleGate module="startups">
              <StartupDetail />
            </ModuleGate>
          }
        />
        <Route
          path="startups/:id/edit"
          element={
            <ModuleGate module="startups">
              <StartupForm />
            </ModuleGate>
          }
        />
        <Route
          path="mentors"
          element={
            <ModuleGate module="mentors">
              <Mentors />
            </ModuleGate>
          }
        />
        <Route
          path="funding"
          element={
            <ModuleGate module="funding">
              <Funding />
            </ModuleGate>
          }
        />
        <Route
          path="funding/:id"
          element={
            <ModuleGate module="funding">
              <FundingDetail />
            </ModuleGate>
          }
        />
        <Route
          path="documents"
          element={
            <ModuleGate module="documents">
              <Documents />
            </ModuleGate>
          }
        />
        <Route
          path="analytics"
          element={
            <ModuleGate module="analytics">
              <Analytics />
            </ModuleGate>
          }
        />
        <Route
          path="notifications"
          element={
            <ModuleGate module="notifications">
              <Notifications />
            </ModuleGate>
          }
        />
        <Route
          path="users"
          element={
            <ModuleGate module="users">
              <Users />
            </ModuleGate>
          }
        />
        <Route
          path="settings"
          element={
            <ModuleGate module="settings">
              <Settings />
            </ModuleGate>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
