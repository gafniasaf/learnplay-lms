import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { generatedRouteElements, GeneratedFallback } from "./routes.generated";
import { useSentryUser } from "./hooks/useSentryUser";
import { DawnDataProvider } from "./contexts/DawnDataContext";

const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CrmDashboard = lazy(() => import("./pages/crm-demo/dashboard/Dashboard"));
const CrmContacts = lazy(() => import("./pages/crm-demo/contacts/ContactList"));
const GenericList = lazy(() => import("./pages/generic/GenericList"));
const GenericBoard = lazy(() => import("./pages/generic/GenericBoard"));

const queryClient = new QueryClient();

// Component to set up Sentry user context
const SentryUserProvider = ({ children }: { children: React.ReactNode }) => {
  useSentryUser();
  return <>{children}</>;
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DawnDataProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <SentryUserProvider>
              <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading...</div>}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/reset-password" element={<ResetPassword />} />
                  <Route path="/crm/dashboard" element={<CrmDashboard />} />
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
  );
};

export default App;
