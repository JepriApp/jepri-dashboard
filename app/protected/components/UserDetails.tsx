import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function UserDetails() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/");
  }

  return JSON.stringify(data.claims, null, 2);
}