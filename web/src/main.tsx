import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Progress, ProgressProvider, useAnchorProgress } from "@bprogress/react";
import { queryClient } from "./lib/query-client";
import "./index.css";
import { HomePage } from "./pages/home";
import { ThemeProvider } from "./lib/theme";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/toaster";
import { JoinPage } from "./pages/join";

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
                <Route path="/" element={<HomePage />} />
                <Route path="/join" element={<JoinPage />} />
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
