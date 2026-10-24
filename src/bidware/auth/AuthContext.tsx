import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  getSession,
  getUser,
  onAuthStateChange,
  signInWithOAuth,
  signOut,
} from "@/lib/auth";
import { isTeamEmail } from "@/lib/team";
import { allows, setCurrentTeamRole, teamRoleOf, type Need, type TeamRole } from "@/lib/roles";

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  user: User | null;
  /** The account that just signed in outside the team's domains, if any. */
  deniedEmail: string | null;
  /** The account's team role, read from the server (see lib/roles). */
  role: TeamRole;
  /** False until the server's copy of the role arrived; the session's may be an hour old. */
  roleLoaded: boolean;
  can: (need: Need) => boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null);
  // The server's copy of the account: app_metadata in the session is as old as its token.
  const [fresh, setFresh] = useState<User | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);

  useEffect(() => {
    let active = true;
    // An account outside the team's domains is signed straight back out, so no
    // screen ever calls the backend with it.
    const accept = (session: Session | null) => {
      // Every session notification invalidates the last verification, even
      // when Supabase reuses the same User object during token refresh.
      setFresh(null);
      setCurrentTeamRole("viewer");
      setSessionRevision((revision) => revision + 1);
      const next = session?.user ?? null;
      if (next && !isTeamEmail(next.email)) {
        setDeniedEmail(next.email ?? "");
        setUser(null);
        void signOut();
      } else {
        if (next) setDeniedEmail(null);
        setUser(next);
      }
      setLoading(false);
    };
    // Initial session (also processes the OAuth redirect via detectSessionInUrl).
    getSession().then((session) => {
      if (active) accept(session);
    });
    // Keep in sync with sign-in / sign-out / token refresh.
    const unsubscribe = onAuthStateChange(accept);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // A role given or taken minutes ago must count now, not at the next token
  // refresh; each new session object (sign-in, refresh) asks the server again.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!user) {
      setFresh(null);
      return;
    }
    let active = true;
    getUser()
      .then((next) => {
        if (active && next?.id === user.id) setFresh(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, sessionRevision]);

  const role = teamRoleOf(fresh && fresh.id === userId ? fresh : user);
  const roleLoaded = Boolean(fresh && fresh.id === userId);
  // The API client checks the same role. Set while rendering too, so the first
  // calls a page makes on mount already see it (children's effects run first).
  const verifiedRole = roleLoaded ? role : "viewer";
  setCurrentTeamRole(verifiedRole);
  useEffect(() => setCurrentTeamRole(verifiedRole), [verifiedRole]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      authenticated: Boolean(user),
      user,
      deniedEmail,
      role,
      roleLoaded,
      can: (need: Need) => need === "read" || (roleLoaded && allows(role, need)),
      login: signInWithOAuth,
      logout: signOut,
    }),
    [loading, user, deniedEmail, role, roleLoaded],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
