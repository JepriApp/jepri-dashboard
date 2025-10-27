import { User } from "@/store/auth.store";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

interface AuthVerifierProps {
  user?: User;
  children: React.ReactNode;
  roles?: string[]; // Special value: 'authenticated' allows any logged-in user
}

const AuthVerifier = ({ user, children, roles = [] }: AuthVerifierProps): React.ReactNode => {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // If requires generic authentication
  const requiresAuth = roles.includes("authenticated");
  if (requiresAuth) {
    if (!user?.id) {
      router.replace("/");
      return null;
    }
    return <>{children}</>;
  }

  // If specific roles are provided, check membership
  if (roles.length > 0) {
    if (!user?.role || !roles.includes(user.role)) {
      router.replace("/");
      return null;
    }
    return <>{children}</>;
  }

  // No roles specified: allow access by default
  return <>{children}</>;
};

export default AuthVerifier;
