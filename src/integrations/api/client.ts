import type { AuthChangeEvent, Session, User } from "@/integrations/api/types";

// "??" (não "||") é importante aqui: em produção atrás de um proxy reverso
// (ver docker-compose.remote.yml) o build define VITE_API_URL="" de propósito,
// para que as chamadas sejam relativas ao próprio domínio (mesma origem,
// evitando CORS). Com "||" essa string vazia cairia no fallback errado.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "dblapoge_access_token";

interface ApiError {
  message: string;
  status?: number;
}

interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

let cachedSession: Session | null = null;
const listeners = new Set<AuthListener>();

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function getResetTokenFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get("token") || url.searchParams.get("reset_token") || null;
}

function notify(event: AuthChangeEvent, session: Session | null) {
  listeners.forEach((listener) => listener(event, session));
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    return { data: null, error: { message: "Servidor indisponível. Verifique a conexão com o servidor do laboratório.", status: 0 } };
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (response.status === 401 && token && !path.startsWith("/auth/login")) {
    // Sessão expirada ou revogada (ex.: senha trocada em outro PC).
    setStoredToken(null);
    if (cachedSession) {
      cachedSession = null;
      notify("SIGNED_OUT", null);
    }
  }

  if (!response.ok) {
    return {
      data: null,
      error: { message: payload?.error || payload?.message || `HTTP ${response.status}`, status: response.status },
    };
  }

  return { data: (payload?.data ?? payload ?? null) as T, error: null };
}

async function loadSession(): Promise<Session | null> {
  if (!getStoredToken()) {
    cachedSession = null;
    return null;
  }
  const { data, error } = await apiFetch<Session>("/auth/session");
  if (error || !data) {
    setStoredToken(null);
    cachedSession = null;
    return null;
  }
  cachedSession = data;
  return data;
}

class QueryBuilder<T = any> implements PromiseLike<ApiResponse<T>> {
  private filters: Array<{ field: string; op: "eq"; value: unknown }> = [];
  private selected = "*";
  private orderBy?: { column: string; ascending: boolean };
  private limitValue?: number;
  private singleResult = false;
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private payload: unknown = null;

  constructor(private readonly table: string) {}

  select(columns = "*") {
    this.selected = columns;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.singleResult = true;
    return this;
  }

  insert(values: unknown) {
    this.operation = "insert";
    this.payload = values;
    return this;
  }

  update(values: unknown) {
    this.operation = "update";
    this.payload = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  async execute(): Promise<ApiResponse<T>> {
    if (this.operation === "select") {
      const params = new URLSearchParams();
      params.set("select", this.selected);
      if (this.filters.length) params.set("filters", JSON.stringify(this.filters));
      if (this.orderBy) params.set("order", JSON.stringify(this.orderBy));
      if (this.limitValue != null) params.set("limit", String(this.limitValue));
      if (this.singleResult) params.set("single", "true");
      return apiFetch<T>(`/api/table/${this.table}?${params.toString()}`);
    }

    if (this.operation === "insert") {
      return apiFetch<T>(`/api/table/${this.table}`, {
        method: "POST",
        body: JSON.stringify({ values: this.payload, select: this.selected, single: this.singleResult }),
      });
    }

    if (this.operation === "update") {
      return apiFetch<T>(`/api/table/${this.table}`, {
        method: "PATCH",
        body: JSON.stringify({ values: this.payload, filters: this.filters, select: this.selected, single: this.singleResult }),
      });
    }

    return apiFetch<T>(`/api/table/${this.table}`, {
      method: "DELETE",
      body: JSON.stringify({ filters: this.filters, single: this.singleResult }),
    });
  }

  then<TResult1 = ApiResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: ApiResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled || undefined, onrejected || undefined);
  }
}

export const api = {
  from<T = any>(table: string) {
    return new QueryBuilder<T>(table);
  },
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const result = await apiFetch<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (result.data?.access_token) {
        setStoredToken(result.data.access_token);
        cachedSession = result.data;
        notify("SIGNED_IN", result.data);
      }
      return result;
    },

    async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
      const result = await apiFetch<{ user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, metadata: options?.data || {} }),
      });
      return result;
    },

    async signOut() {
      setStoredToken(null);
      cachedSession = null;
      notify("SIGNED_OUT", null);
      return { error: null };
    },

    async getSession() {
      const session = await loadSession();
      return { data: { session }, error: null };
    },

    async getUser() {
      const session = await loadSession();
      return { data: { user: session?.user ?? null }, error: null };
    },

    onAuthStateChange(callback: AuthListener) {
      listeners.add(callback);
      setTimeout(async () => {
        const session = await loadSession();
        callback("INITIAL_SESSION", session);
        if (getResetTokenFromUrl()) callback("PASSWORD_RECOVERY", session);
      }, 0);

      return {
        data: {
          subscription: {
            unsubscribe: () => { listeners.delete(callback); },
          },
        },
      };
    },

    async resetPasswordForEmail(email: string, { redirectTo }: { redirectTo?: string } = {}) {
      return apiFetch<{ ok: boolean }>("/auth/reset-password/request", {
        method: "POST",
        body: JSON.stringify({ email, redirectTo }),
      });
    },

    async updateUser({ password, currentPassword }: { password: string; currentPassword?: string }) {
      const resetToken = getResetTokenFromUrl();
      if (resetToken) {
        const result = await apiFetch<{ ok: boolean }>("/auth/reset-password/confirm", {
          method: "POST",
          body: JSON.stringify({ token: resetToken, password }),
        });
        if (!result.error) notify("USER_UPDATED", cachedSession);
        return result;
      }

      const result = await apiFetch<Session>("/auth/user", {
        method: "PATCH",
        body: JSON.stringify({ password, current_password: currentPassword }),
      });
      // A troca de senha revoga as sessões antigas e devolve um token novo.
      if (result.data?.access_token) {
        setStoredToken(result.data.access_token);
        cachedSession = result.data;
        notify("USER_UPDATED", result.data);
      }
      return result;
    },

    /** Encerra a sessão em todos os computadores. */
    async signOutEverywhere() {
      const result = await apiFetch<{ ok: boolean }>("/auth/logout-all", { method: "POST" });
      setStoredToken(null);
      cachedSession = null;
      notify("SIGNED_OUT", null);
      return result;
    },
  },

  // Operações feitas inteiramente no servidor (os dados não passam pelo navegador).
  backups: {
    database(databaseId: string, reason = "manual") {
      return apiFetch<{ versions: number; created: unknown[] }>(`/api/backups/database/${encodeURIComponent(databaseId)}`, {
        method: "POST", body: JSON.stringify({ reason }),
      });
    },
    version(versionId: string, reason = "manual") {
      return apiFetch<{ id: string }>(`/api/backups/version/${encodeURIComponent(versionId)}`, {
        method: "POST", body: JSON.stringify({ reason }),
      });
    },
    restore(backupId: string) {
      return apiFetch<{ backup: { id: string; version_name: string } }>(`/api/backups/${encodeURIComponent(backupId)}/restore`, { method: "POST" });
    },
    sendToDestinations(versionId: string) {
      return apiFetch<Array<{ label: string; success: boolean; error?: string }>>(`/api/backups/send/${encodeURIComponent(versionId)}`, { method: "POST" });
    },
  },

  admin: {
    revokeSessions(userId: string) {
      return apiFetch<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, { method: "POST" });
    },
  },
};

/** Tamanho mínimo de senha (deve bater com PASSWORD_MIN_LENGTH do backend). */
export const PASSWORD_MIN_LENGTH = 10;

export type { Session, User, AuthChangeEvent };
