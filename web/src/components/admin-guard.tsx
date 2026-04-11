import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { tgApi, type AuthUser } from "../lib/telegram-api";

export function AdminGuard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    tgApi
      .me()
      .then((u) => {
        if (u.role === "superadmin" || u.role === "admin") {
          setUser(u);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet context={{ user }} />;
}
