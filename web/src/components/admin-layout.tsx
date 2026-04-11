import { NavLink, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import {
  LayoutDashboard,
  UserCircle,
  Crosshair,
  MessageSquare,
  HardDrive,
  LogOut,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { tgApi, type AuthUser } from "../lib/telegram-api";

const navItems = [
  { to: "/admin", icon: LayoutDashboard, label: "仪表盘", end: true },
  { to: "/admin/account", icon: UserCircle, label: "TG 账号" },
  { to: "/admin/targets", icon: Crosshair, label: "监听目标" },
  { to: "/admin/messages", icon: MessageSquare, label: "消息" },
  { to: "/admin/storage", icon: HardDrive, label: "存储" },
];

export function AdminLayout() {
  const { user } = useOutletContext<{ user: AuthUser }>();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await tgApi.logout();
    } catch {}
    navigate("/admin/login");
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold">TG 管理面板</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{user.display_name || user.username}</p>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
