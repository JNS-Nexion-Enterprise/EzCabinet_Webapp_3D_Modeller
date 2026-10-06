# Auth diagrams

Drawn from the code as of 2026-10-06 (`src/lib/auth.ts`, `src/lib/auth/*`, `src/proxy.ts`).
Prose and reasoning live in `CLAUDE.md` → Auth and `docs/superpowers/specs/2026-09-20-rbac-design.md`,
`2026-10-06-staff-2fa-design.md`.

## 1. Request gate: proxy redirects, `requireAuth` decides

`proxy.ts` never reads the database, so it never knows a role. The boundary is
`requireAuth()`, reached through `withAuth` (API routes) or `requirePage` (pages).

```mermaid
flowchart TD
    REQ["Request to /admin/* or /api/admin/*"] --> P0{"authEnabled()?"}
    P0 -- "no, local only" --> PASS["proxy passes"]
    P0 -- yes --> P1{"login, forgot-password<br/>or reset-password page?"}
    P1 -- yes --> PASS
    P1 -- no --> P2{"session cookie present?"}
    P2 -- yes --> PASS
    P2 -- "no, API" --> R401["401 unauthorized"]
    P2 -- "no, page" --> RLOGIN["redirect /admin/login?next=…"]

    PASS --> RA["requireAuth(permission)"]
    RA --> A0{"authEnabled()?"}
    A0 -- no --> BYPASS["BYPASS_USER, SUPERADMIN"]
    A0 -- yes --> A1{"currentUser()<br/>session + fresh DB row,<br/>not disabled?"}
    A1 -- no --> E401["AuthError 401"]
    A1 -- yes --> A2{"role is CUSTOMER?"}
    A2 -- yes --> E404["AuthError 404"]
    A2 -- no --> A3{"can(role, permission)?"}
    A3 -- no --> E403["AuthError 403"]
    A3 -- yes --> G1{"mustChangePassword?"}
    BYPASS --> OK
    G1 -- yes --> CP["page: redirect /admin/change-password<br/>API: 403 password_change_required"]
    G1 -- no --> G2{"mustSetupTwoFactor?"}
    G2 -- yes --> S2["page: redirect /admin/setup-2fa<br/>API: 403 two_factor_setup_required"]
    G2 -- no --> OK["handler / page runs"]

    E401 --> X401["page: redirect /admin/login<br/>API: 401"]
    E404 --> X404["page: notFound()<br/>API: 404"]
    E403 --> X403["page: notFound()<br/>API: 403"]
```

## 2. Staff sign-in

Password accounts meet the code prompt; Google carries its own second factor.
A staff account that has a password but no enrolled authenticator is sent to
`/admin/setup-2fa` whichever door it used, because the gate is keyed on the
account, not the session.

```mermaid
sequenceDiagram
    actor Staff
    participant Login as /admin/login
    participant BA as Better Auth /api/auth
    participant Google
    participant DB as Postgres
    participant Admin as Admin page (requirePage)

    alt Password
        Staff->>Login: email + password
        Login->>BA: signIn.email
        alt wrong email or password
            BA-->>Login: error
            Login-->>Staff: Wrong email or password
        else 2FA enrolled, device not trusted
            BA-->>Login: twoFactorRedirect, no session yet
            Staff->>Login: 6-digit code or backup code, optional trust device 30 days
            Login->>BA: twoFactor.verifyTotp or verifyBackupCode
            BA->>DB: create session
            BA-->>Login: session cookie
        else not enrolled, or trusted device
            BA->>DB: create session
            BA-->>Login: session cookie
        end
    else Google
        Staff->>Login: Continue with Google
        Login->>BA: signIn.social, callbackURL = next
        BA->>Google: OAuth redirect
        Google-->>BA: callback
        BA->>DB: create session, link to verified row
        BA-->>Staff: redirect to callbackURL
    end

    Note over BA,DB: session.create hook stamps lastLoginAt
    Login->>Admin: router.push(safeNext(next))
    Admin->>DB: currentUser() reads the row fresh
    alt mustChangePassword
        Admin-->>Staff: redirect /admin/change-password
    else mustSetupTwoFactor
        Admin-->>Staff: redirect /admin/setup-2fa
    else
        Admin-->>Staff: page
    end
```

## 3. Staff account lifecycle

Public sign-up only ever produces a `CUSTOMER`. A role is granted only by a
superadmin on `/admin/users`.

```mermaid
stateDiagram-v2
    state "Customer (Google sign-up)" as Customer
    state "Invited, mustChangePassword" as Invited
    state "Owes 2FA setup, mustSetupTwoFactor" as Owes2FA
    state "Active password staff, 2FA on" as Active
    state "Google-only staff, no 2FA owed" as GoogleStaff
    state "Disabled, currentUser() is null" as Disabled

    [*] --> Customer: Google sign-in
    [*] --> Invited: superadmin invite sets first password
    Customer --> GoogleStaff: superadmin promotes, password and sessions stripped
    Invited --> Owes2FA: changeOwnPassword succeeds
    Owes2FA --> Active: twoFactor.enable then verifyTotp
    Active --> Owes2FA: superadmin Reset 2FA, sessions and trusted devices deleted
    Active --> Active: emailed password reset, 2FA untouched
    Active --> Disabled: superadmin disables
    GoogleStaff --> Disabled: superadmin disables
    Disabled --> Active: superadmin restores
    Disabled --> [*]: superadmin deletes, refused if the account placed orders
    Active --> [*]: superadmin deletes
    GoogleStaff --> [*]: superadmin deletes
```

Locks on role changes (`roleChangeAllowed`): nobody changes their own role, and
the last superadmin cannot be demoted. Delete (`deleteUser`) is refused on your
own row and on an account with orders; `Order.paidByName` keeps who marked an
order paid. `/two-factor/disable` is closed — only
Reset 2FA removes a second factor.

## 4. Forgot password (staff, emailed link)

Better Auth calls `sendResetPassword` for any address with a user row, so
`canEmailReset` decides who is actually mailed. The page answers the same
sentence either way.

```mermaid
sequenceDiagram
    actor Staff
    participant FP as /admin/forgot-password
    participant BA as Better Auth
    participant SR as sendStaffReset
    participant Resend
    participant RP as /admin/reset-password
    participant DB as Postgres

    Staff->>FP: email
    FP->>BA: requestPasswordReset(email, redirectTo)
    BA->>SR: sendResetPassword(user, url) if a row exists
    SR->>DB: role, disabled, credential account, twoFactorEnabled
    alt canEmailReset: staff, not disabled, has password, 2FA enrolled
        SR->>Resend: link, single use, 1 hour
        Resend-->>Staff: email
    else anyone else
        Note over SR: returns silently, nothing sent
    end
    BA-->>FP: same answer either way
    Staff->>RP: opens link with token
    RP->>BA: resetPassword(token, newPassword), min 12 chars
    BA->>DB: update password, revoke all sessions
    BA->>DB: onPasswordReset clears mustChangePassword
    RP-->>Staff: back to /admin/login, authenticator code still required
```

## 5. Roles and permissions

`lib/auth/permissions.ts` is the whole model: a compile-time table, not rows.

```mermaid
flowchart LR
    SUPER["SUPERADMIN"] --> ALL
    SUPER --> UM["users:manage"]
    ADMIN["ADMIN"] --> ALL
    CUST["CUSTOMER"] --> NONE["no admin permissions<br/>ownership of own orders only"]

    subgraph ALL["Shared staff permissions"]
        direction TB
        C1["catalogue:read"]
        C2["catalogue:write"]
        C3["catalogue:publish"]
        O1["orders:read"]
        O2["orders:markPaid"]
        L1["logistics:read"]
        L2["logistics:book"]
        W1["content:write"]
    end
```

## 6. Customer order access

The token in the URL is an address, not a key (`lib/orders/access.ts`).

```mermaid
flowchart TD
    V["GET /[lang]/order/[token]"] --> V0{"authEnabled()?"}
    V0 -- "no, local only" --> V1["viewer = signed-in user, else BYPASS_USER"]
    V0 -- yes --> V2{"currentUser()?"}
    V2 -- none --> SI["redirect /[lang]/sign-in?next=path<br/>Google, then back"]
    V2 -- found --> CV
    V1 --> CV{"canViewOrder:<br/>viewer.id = order.userId<br/>or can(role, orders:read)?"}
    CV -- yes --> SHOW["order page"]
    CV -- no --> NF["notFound(), same as a made-up token"]
```
