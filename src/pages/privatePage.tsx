import type { User } from "@supabase/supabase-js";
import type { GetServerSidePropsContext } from "next";
import { createClient as clientToSignOut } from "@/utils/supabase/component";

import { createClient } from "@/utils/supabase/server-props";
import { useRouter } from "next/router";

export default function PrivatePage({ user }: { user: User }) {
  const supabase = clientToSignOut();
  const router = useRouter();
  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error(error);
      return
    }
    router.push("/");
  }
  return (
    <div>
      <h1>Hello, {user.email || "user"}!</h1>
      <button onClick={signOut}>Sign out</button>
    </div>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const supabase = createClient(context);

  const { data, error } = await supabase.auth.getUser();

  if (error || !data) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  return {
    props: {
      user: data.user,
    },
  };
}
