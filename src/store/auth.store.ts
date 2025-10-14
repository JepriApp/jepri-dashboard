import { create } from "zustand";
import { getUserByEmail } from "../services/supabase.service";
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
  isAuthenticated: boolean;
  availableUsers: User[];
  setUser: (user: User) => void;
  fetchUserDetails: (email: string) => Promise<void>;
  logout: () => void;
  setAvailableUsers: (users: User[]) => void;
}

const STORE_NAME = "AuthStore";
type MyPersist = PersistOptions<AuthState>;
export const useAuthStore = create<AuthState>()(
  persist<AuthState, [], [], MyPersist>(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      availableUsers: [
        { id: "1", email: "admin@jepri.com", role: "admin" },
        { id: "2", email: "operador@jepri.com", role: "operator" },
        {
          id: "3",
          email: "proveedor1@ejemplo.com",
          role: "supplier",
          name: "Frutas y Verduras El Campesino",
        },
        {
          id: "4",
          email: "proveedor2@ejemplo.com",
          role: "supplier",
          name: "Plaza Bazurto - Puesto 45",
        },
        {
          id: "5",
          email: "cliente1@ejemplo.com",
          role: "customer",
          name: "Restaurante El Buen Sabor",
        },
        {
          id: "6",
          email: "cliente2@ejemplo.com",
          role: "customer",
          name: "Cafetería Central",
        },
      ],
      setUser: (user) => set({ user, isAuthenticated: true }),
      fetchUserDetails: async (email) => {
        try {
          const userDetails = await getUserByEmail(email);
          if (userDetails) {
            // Actualizar el usuario con los detalles completos de la base de datos
            const currentUser = get().user;
            if (currentUser) {
              set({
                user: {
                  ...currentUser,
                  ...userDetails,
                },
              });
            }
            console.log("Detalles de usuario obtenidos:", userDetails);
          } else {
            console.error("No se encontraron detalles del usuario");
          }
        } catch (error) {
          console.error("Error al obtener detalles del usuario:", error);
        }
      },
      logout: () => set({ user: null, isAuthenticated: false }),
      setAvailableUsers: (users) => set({ availableUsers: users }),
    }),
    {
      name: STORE_NAME,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
