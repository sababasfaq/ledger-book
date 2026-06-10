import { createContext, useContext, useMemo, useState } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  const signup = (payload) => api.signup(payload);

  const login = async (username, password) => {
    try {
      const res = await api.login(username, password);
      if (res.twoFactor) {
        return {
          ok: true,
          twoFactor: true,
          email: res.email,
          message: res.message,
        };
      }
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      setUser(res.user);
      return { ok: true, twoFactor: false };
    } catch (e) {
      if (String(e.message).includes("Approval pending")) {
        return { ok: false, pendingApproval: true };
      }
      return { ok: false, message: e.message };
    }
  };

  const complete2FA = async (email, code) => {
    const res = await api.verifyOtp(email, code);
    localStorage.setItem("token", res.token);
    localStorage.setItem("user", JSON.stringify(res.user));
    setUser(res.user);
    return { ok: true };
  };

  const refreshMe = async () => {
    const me = await api.getMe();
    localStorage.setItem("user", JSON.stringify(me));
    setUser(me);
    return me;
  };

  const updateProfile = async (payload) => {
    const res = await api.updateMe(payload);
    localStorage.setItem("user", JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      signup,
      login,
      complete2FA,
      refreshMe,
      updateProfile,
      logout,
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
