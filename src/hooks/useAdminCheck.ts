import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "moderator" | "user";

/** Papel do usuário logado. A permissão real é sempre verificada no servidor. */
export function useRole() {
  const { user, profile } = useAuth();
  const [role, setRole] = useState<AppRole>("user");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRole("user"); setLoading(false); return; }
    let cancelled = false;
    api.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      if (cancelled) return;
      const r = (data as Array<{ role: AppRole }> | null)?.[0]?.role;
      setRole(r || "user");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  const isAdmin = role === "admin";
  const isEditor = isAdmin || (role === "moderator" && profile?.approved === true);
  return { role, isAdmin, isEditor, loading };
}

export function useAdminCheck() {
  const { isAdmin, loading } = useRole();
  return { isAdmin, loading };
}
