import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiClient, AuthResponse } from "../utils/api";
import { User } from "../types";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface Props {
  children: ReactNode;
}

export function AuthProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar si hay un token guardado al cargar
    const token = apiClient.getAccessToken();
    if (token) {
      // TODO: Validar token con el servidor o decodificar JWT
      // Por ahora, si hay token, asumimos que está autenticado
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const response = await apiClient.login(email, password);
    
    if (response.error) {
      return { success: false, error: response.error };
    }

    if (response.data) {
      const { user, accessToken, refreshToken } = response.data as AuthResponse;
      apiClient.setTokens(accessToken, refreshToken);
      setUser(user);
      return { success: true };
    }

    return { success: false, error: "Unknown error" };
  }

  async function register(email: string, password: string, name?: string): Promise<{ success: boolean; error?: string }> {
    const response = await apiClient.register(email, password, name);
    
    if (response.error) {
      return { success: false, error: response.error };
    }

    if (response.data) {
      const { user, accessToken, refreshToken } = response.data as AuthResponse;
      apiClient.setTokens(accessToken, refreshToken);
      setUser(user);
      return { success: true };
    }

    return { success: false, error: "Unknown error" };
  }

  async function logout(): Promise<void> {
    await apiClient.logout();
    setUser(null);
  }

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: user !== null || apiClient.getAccessToken() !== null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
