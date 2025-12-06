import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, Component, ReactNode } from "react";
import { generatedRouteElements, GeneratedFallback } from "./routes.generated";
import { useSentryUser } from "./hooks/useSentryUser";
import { DawnDataProvider } from "./contexts/DawnDataContext";
import { HamburgerMenu } from "./components/layout/HamburgerMenu";

const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Kids = lazy(() => import("./pages/Kids"));
const Schools = lazy(() => import("./pages/Schools"));
const Parents = lazy(() => import("./pages/Parents"));
const CrmDashboard = lazy(() => import("./pages/crm-demo/dashboard/Dashboard"));
const CrmContacts = lazy(() => import("./pages/crm-demo/contacts/ContactList"));
const GenericList = lazy(() => import("./pages/generic/GenericList"));
const GenericBoard = lazy(() => import("./pages/generic/GenericBoard"));

const queryClient = new QueryClient();

// Error boundary to catch and display errors
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-600">
          <h1 className="text-xl font-bold mb-4">Something went wrong</h1>
          <pre className="bg-red-50 p-4 rounded overflow-auto text-sm">
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

// Component to set up Sentry user context
const SentryUserProvider = ({ children }: { children: React.ReactNode }) => {
  useSentryUser();
  return <>{children}</>;
};

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <DawnDataProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <SentryUserProvider>
                <HamburgerMenu />
                <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
                  <Routes>
                    <Route path="/admin" element={<Navigate to="/admin/ai-pipeline" replace />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/auth/reset-password" element={<ResetPassword />} />
                    <Route path="/kids" element={<Kids />} />
                    <Route path="/schools" element={<Schools />} />
                    <Route path="/parents" element={<Parents />} />
                    <Route path="/crm/dashboard" element={<CrmDashboard />} />
                    <Route path="/teacher" element={<Navigate to="/teacher/dashboard" replace />} />
                    <Route path="/crm/contacts" element={<CrmContacts />} />
                    <Route path="/demo/generic" element={<GenericList />} />
                    <Route path="/demo/generic/board" element={<GenericBoard />} />
                  {generatedRouteElements}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  <GeneratedFallback />
                </Suspense>
              </SentryUserProvider>
            </BrowserRouter>
          </DawnDataProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;