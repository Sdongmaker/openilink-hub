import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Progress, ProgressProvider, useAnchorProgress } from "@bprogress/react";
import { queryClient } from "./lib/query-client";
import "./index.css";
import { HomePage } from "./pages/home";
import { LoginPage } from "./pages/login";
import { Layout } from "./components/layout";
import { SettingsPage } from "./pages/settings";
import { ThemeProvider } from "./lib/theme";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/toaster";
import { JoinPage } from "./pages/join";
import { AdminAstrBotPage } from "./pages/admin-astrbot";

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
                {/* Public Entry */}
                <Route path="/" element={<HomePage />} />
                <Route path="/join" element={<JoinPage />} />
                <Route path="/login" element={<LoginPage />} />

                {/* Main Application Shell */}
                <Route path="/dashboard" element={<Layout />}>
                  <Route index element={<Navigate to="admin/astrbot" replace />} />
                  <Route path="overview" element={<Navigate to="/dashboard/admin/astrbot" replace />} />
                  <Route path="admin" element={<Navigate to="/dashboard/admin/astrbot" replace />} />
                  <Route path="admin/astrbot" element={<AdminAstrBotPage />} />
                  <Route path="settings" element={<SettingsPage />}>
                    <Route index element={<Navigate to="profile" replace />} />
                    <Route path="profile" element={null} />
                    <Route path="security" element={null} />
                  </Route>
                  <Route path="*" element={<Navigate to="/dashboard/admin/astrbot" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
            <Toaster />
          </ProgressProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
