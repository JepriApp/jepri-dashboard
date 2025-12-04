import { createClient as createClientFormLib } from "@/lib/supabase/client";

export function createClient() {
  return createClientFormLib();
}
