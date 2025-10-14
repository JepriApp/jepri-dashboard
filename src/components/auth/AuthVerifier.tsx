
import { User, UserRole } from "@/store/auth.store";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

interface AuthVerifierProps {
  requireAuth: boolean;
  children: React.ReactNode;
  roles?: UserRole[number][];
  user?: User;
  isLoading?: boolean;
}

const AuthVerifier = ({
  children,
  requireAuth,
  roles = [],
  user = undefined,
  isLoading = false,
}: AuthVerifierProps): React.ReactNode => {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (isLoading) {
    // Mostrar un mensaje de carga o spinner mientras se verifica la autenticación
    return <p>Loading...</p>;
  }
  // Mantener el mismo HTML en SSR y en el primer render del cliente
  // para evitar mismatches de hidratación.
  if (!mounted) {
    return <>{children}</>;
  }

  if (requireAuth && !user) {
    // Si requireAuth es true y el usuario no está autenticado, redirigir al inicio de sesión.
    router.replace("/");
    return null;
  }

  if (
    roles.length > 0 &&
    !!user?.role &&
    !roles.includes(user.role as UserRole[number])
  ) {
    router.replace("/access-denied");
    return null;
  }

  // Si pasa todas las verificaciones, renderizar el elemento children.
  return <>{children}</>;
};

export default AuthVerifier;
