import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import Dashboard from "@/pages/Dashboard";
import DatabasePage from "@/pages/DatabasePage";
import VersionManager from "@/pages/VersionManager";
import DiseaseDatabases from "@/pages/DiseaseDatabases";
import SettingsPage from "@/pages/SettingsPage";
import AdminPage from "@/pages/AdminPage";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import PendingApprovalPage from "@/pages/PendingApprovalPage";
import LDAnalysisPage from "@/pages/LDAnalysisPage";
import AdvancedHub from "@/pages/advanced/AdvancedHub";
import HardyWeinbergPage from "@/pages/advanced/HardyWeinbergPage";
import AssociationPage from "@/pages/advanced/AssociationPage";
import ComparisonPage from "@/pages/advanced/ComparisonPage";
import LogisticPage from "@/pages/advanced/LogisticPage";
import DescriptiveStatsPage from "@/pages/DescriptiveStatsPage";
import PrivacyPolicyPage from "@/pages/PrivacyPolicyPage";
import MyDataPage from "@/pages/MyDataPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedLayout() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        <span className="ml-3 text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;

  // Check approval status
  if (profile && !profile.approved) {
    return <PendingApprovalPage />;
  }

  return (
    <>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex-1 flex flex-col">
            <AppHeader />
            <main className="flex-1 p-4 lg:p-6 overflow-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/database" element={<DatabasePage />} />
                <Route path="/diseases" element={<DiseaseDatabases />} />
                <Route path="/descriptive-stats" element={<DescriptiveStatsPage />} />
                <Route path="/versions" element={<VersionManager />} />
                <Route path="/avancada" element={<AdvancedHub />} />
                <Route path="/avancada/ld" element={<LDAnalysisPage />} />
                <Route path="/avancada/hardy-weinberg" element={<HardyWeinbergPage />} />
                <Route path="/avancada/associacao" element={<AssociationPage />} />
                <Route path="/avancada/comparacao" element={<ComparisonPage />} />
                <Route path="/avancada/regressao" element={<LogisticPage />} />
                <Route path="/ld-analysis" element={<Navigate to="/avancada/ld" replace />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/my-data" element={<MyDataPage />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}

function AuthRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user) return <Navigate to="/" />;
  return <LoginPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<AuthRoutes />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/privacy-public" element={<PrivacyPolicyPage />} />
            <Route path="/*" element={<ProtectedLayout />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
