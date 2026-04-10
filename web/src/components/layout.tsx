import { Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useUser } from "@/hooks/use-auth";
import { useAuthStore } from "@/stores/auth-store";
import {
  LogOut,
  Sun,
  Moon,
  ChevronsUpDown,
  Settings2,
  House,
  ShieldAlert,
  Unplug,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useTheme } from "../lib/theme";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import * as React from "react";

function SidebarLogo() {
  const { open } = useSidebar();

  return open ? (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
        <Unplug className="size-4" />
      </div>
      <span className="text-sm font-semibold tracking-tight">AstrBot</span>
    </div>
  ) : (
    <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
      <Unplug className="size-4" />
    </div>
  );
}

const BREADCRUMB_LABELS: Record<string, string> = {
  admin: "后台",
  astrbot: "机器人接入",
  settings: "设置",
  profile: "个人资料",
  security: "安全认证",
};

const statusColors: Record<string, string> = {
  connected: "text-green-500 fill-green-500",
  disconnected: "text-muted-foreground fill-muted-foreground",
  error: "text-destructive fill-destructive",
  session_expired: "text-destructive fill-destructive",
};

function LayoutHeader() {
  const location = useLocation();
  const { resolvedTheme, setTheme } = useTheme();

  const rawSegments = location.pathname
    .split("/")
    .filter((s) => Boolean(s) && s !== "dashboard" && s !== "overview");
  const breadcrumbs: { label: string; path: string; isLast: boolean }[] = [];

  for (let i = 0; i < rawSegments.length; i++) {
    const segment = rawSegments[i];
    const path = `/dashboard/${rawSegments.slice(0, i + 1).join("/")}`;
    let label = BREADCRUMB_LABELS[segment] || segment;
    if (segment.length > 20) label = "详情";
    breadcrumbs.push({ label, path, isLast: i === rawSegments.length - 1 });
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background/95 backdrop-blur px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-2 h-9 w-9" />
        <Separator orientation="vertical" className="h-4 opacity-50" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link
                  to="/dashboard/admin/astrbot"
                  className="flex items-center text-muted-foreground hover:text-primary transition-colors"
                >
                  <House className="h-3.5 w-3.5" />
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {breadcrumbs.length > 0 && <BreadcrumbSeparator className="opacity-30" />}
            {breadcrumbs.map((bc, i) => (
              <React.Fragment key={bc.path}>
                {i > 0 && <BreadcrumbSeparator className="opacity-30" />}
                <BreadcrumbItem>
                  {bc.isLast ? (
                    <BreadcrumbPage className="font-bold text-foreground">
                      {bc.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link
                        to={bc.path}
                        className="hover:text-primary transition-colors font-medium"
                      >
                        {bc.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
  );
}

function SecurityBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="flex items-center gap-3 px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-sm">
      <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
      <span className="text-amber-700 dark:text-amber-400">
        您的账号尚未设置密码或绑定通行密钥，登出后可能无法再次登录。
        <Link to="/dashboard/settings/security" className="underline font-medium ml-1 hover:no-underline">
          前往设置
        </Link>
      </span>
      <button onClick={() => setDismissed(true)} className="ml-auto text-amber-500/60 hover:text-amber-500">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: user, isError } = useUser();
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (isError) navigate("/login", { replace: true });
  }, [isError, navigate]);

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "superadmin") {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    api.info().then((data) => setVersion(data.version || "")).catch(() => {});
  }, []);

  if (!user) return null;

  const isAdmin = user.role === "admin" || user.role === "superadmin";

  // Logical matching for active states
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon" className="border-r-0 shadow-none">
        <SidebarHeader className="h-16 justify-center">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/dashboard/admin/astrbot">
                  <SidebarLogo />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {isAdmin && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/dashboard/admin/astrbot")} tooltip="机器人接入">
                      <Link to="/dashboard/admin/astrbot">
                      <Unplug />
                      <span>机器人接入</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive("/dashboard/settings")}
                tooltip="个人设置"
              >
                <Link to="/dashboard/settings/profile">
                  <Settings2 />
                  <span>偏好设置</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarSeparator className="mx-0" />
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="h-8 w-8 rounded-lg shadow-sm border border-border/50">
                      <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-bold text-xs">
                        {user.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight ml-1">
                      <span className="truncate font-semibold">{user.username}</span>
                      <span className="truncate text-[10px] text-muted-foreground font-medium uppercase">
                        {user.role}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 opacity-50" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-xl shadow-2xl"
                  side="top"
                  align="end"
                  sideOffset={8}
                >
                  <DropdownMenuItem
                    onClick={async () => {
                      await useAuthStore.getState().logout();
                      navigate("/login");
                    }}
                    className="cursor-pointer font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    退出登录
                  </DropdownMenuItem>
                  {version && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] text-muted-foreground text-center font-normal">
                        {/^\d/.test(version) ? `v${version}` : version}
                      </DropdownMenuLabel>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="flex flex-col bg-background/50 rounded-tl-2xl overflow-hidden">
        <LayoutHeader />

        {user && !user.has_password && !user.has_passkey && !user.has_oauth && (
          <SecurityBanner />
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden [&:has([data-full-page])]:overflow-hidden">
          <div className="h-full mx-auto w-full max-w-[1400px] p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-2 duration-500 [&:has([data-full-page])]:p-0 [&:has([data-full-page])]:max-w-none">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
