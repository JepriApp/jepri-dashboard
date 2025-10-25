
import { User, UserRole } from "@/store/auth.store";
import { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

interface AuthVerifierProps {
  requireAuth: boolean;
  children: React.ReactNode;
  roles?: UserRole[number][];
  user?: User;
  isLoading?: boolean;
}

const AuthVerifier = ({ user, children }: { user?: User, children: React.ReactNode }): React.ReactNode => {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if(!mounted) {
    return null;
  }
  if(!user) {
    router.replace("/");
    return null;
  }
  return <>{children}</>;
};

export default AuthVerifier;
import { createClient } from "@/utils/supabase/server-props";

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
