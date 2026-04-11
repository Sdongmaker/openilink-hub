import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Progress, ProgressProvider, useAnchorProgress } from "@bprogress/react";
import { queryClient } from "./lib/query-client";
import "./index.css";
import { ThemeProvider } from "./lib/theme";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/toaster";
import { JoinPage } from "./pages/join";
import { AdminGuard } from "./components/admin-guard";
import { AdminLayout } from "./components/admin-layout";
import { LoginPage } from "./pages/admin/login";
import { DashboardPage } from "./pages/admin/dashboard";
import { AccountPage } from "./pages/admin/account";
import { TargetsPage } from "./pages/admin/targets";
import { MessagesPage } from "./pages/admin/messages";
import { StoragePage } from "./pages/admin/storage";

function RouterProgress() {
  useAnchorProgress({ startOnLoad: false });
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <ProgressProvider color="oklch(0.693 0.195 151.5)">
            <BrowserRouter>
              <RouterProgress />
              <Progress />
              <Routes>
                <Route path="/" element={<JoinPage />} />
                <Route path="/join" element={<JoinPage />} />
                <Route path="/admin/login" element={<LoginPage />} />
                <Route element={<AdminGuard />}>
                  <Route element={<AdminLayout />}>
                    <Route path="/admin" element={<DashboardPage />} />
                    <Route path="/admin/account" element={<AccountPage />} />
                    <Route path="/admin/targets" element={<TargetsPage />} />
                    <Route path="/admin/messages" element={<MessagesPage />} />
                    <Route path="/admin/storage" element={<StoragePage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
            <Toaster />
          </ProgressProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
