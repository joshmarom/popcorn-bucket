export type AuthSession = {
  email: string
  name: string
  role: string
}

export type AuthStatus = { signedIn: false } | ({ signedIn: true } & AuthSession)

export type AuthSignInResult =
  | ({ ok: true } & AuthSession)
  | { ok: false; error: string }
