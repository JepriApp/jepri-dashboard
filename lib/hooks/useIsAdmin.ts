"use client";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export function useIsAdmin() {
  const supabase = createClient();
  const query = useQuery({
    queryKey: ["current-user", "is-admin"],
    queryFn: async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) return { isAdmin: false, adminId: null };
      const { data, error } = await supabase
        .from("admin")
        .select("id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (error || !data) return { isAdmin: false, adminId: null };
      return { isAdmin: true, adminId: data.id };
    },
  });
  return {
    isAdmin: query.data?.isAdmin ?? false,
    adminId: query.data?.adminId ?? null,
    isPending: query.isPending,
  };
}
