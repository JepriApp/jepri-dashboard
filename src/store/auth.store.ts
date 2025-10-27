import { create } from "zustand";
import { getProfileById, logIn, signOut } from "../services/supabase.service";
import { persist, PersistOptions, createJSONStorage } from "zustand/middleware";

export type UserRole = "admin" | "operator" | "supplier" | "customer";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
  // Campos adicionales que pueden venir de la base de datos
  created_at?: string;
  updated_at?: string;
}

interface AuthState {
  user: User | null;
  fetchUserDetails: (email: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const STORE_NAME = "AuthStore";
type MyPersist = PersistOptions<AuthState>;
export const useAuthStore = create<AuthState>()(
  persist<AuthState, [], [], MyPersist>(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      fetchUserDetails: async (email) => {
        try {
          // Usar el id del usuario actual para leer perfiles y evitar duplicar lógica
          const currentUser = get().user;
          if (!currentUser?.id) {
            console.error("No hay usuario en el store para enriquecer");
            return;
          }

          const profile = await getProfileById(currentUser.id);
          if (profile) {
            set({
              user: {
                ...currentUser,
                role: profile.role ?? currentUser.role,
                name: profile.name ?? currentUser.name,
                created_at: profile.created_at ?? currentUser.created_at,
              },
            });
            console.log("Perfil de usuario obtenido:", profile);
          } else {
            console.error("No se encontró perfil para el usuario");
          }
        } catch (error) {
          console.error("Error al obtener perfil del usuario:", error);
        }
      },
      login: async (email, password) => {
        try {
          const loginData = await logIn(email, password);
          if (loginData?.user) {
            set({
              user: {
                id: loginData.user.id,
                email: loginData.user.email || "",
                role: loginData.user.role as UserRole, 
              },
            });
          }
        } catch (error) {
          console.error("Error en el flujo de login:", error);
        }
      },
      logout: async () => {
        try {
          await signOut();
          set({ user: null });
        } catch (error) {
          console.error("Error en el flujo de logout:", error);
        }
      },
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
