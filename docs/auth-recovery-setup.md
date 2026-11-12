# Supabase password recovery setup

The recovery flow sends a Supabase email link directly to the Express callback. The callback verifies the one-time token hash on the server, sets the existing HttpOnly session cookies plus a short-lived recovery-only cookie, and redirects to `http://localhost:5173/?auth=recovery`.

## Local development

The backend currently listens on `PORT` or defaults to port `3002` (`backend/server.js`). With the default port, the callback URL is:

`http://localhost:3002/auth/recovery/callback`

Add that exact callback URL to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**. The final frontend URL is reached by the backend redirect and is not the URL passed to Supabase's `redirectTo` option.

If the backend uses a different public origin or port, set `AUTH_RECOVERY_CALLBACK_URL` to its public callback URL and allowlist that exact URL in Supabase. For local development, keep the default above unless `PORT` is overridden; when `PORT` is overridden, configure `AUTH_RECOVERY_CALLBACK_URL` to match it.

## Recovery email template

In **Authentication → Email Templates → Reset Password**, update the action link to use the `.RedirectTo` value supplied by the backend and the token hash. Do not use the default `{{ .ConfirmationURL }}` link for this flow.

```html
<h2>Restablece tu contraseña de PawHub</h2>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">Crear una nueva contraseña</a></p>
<p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
```

The template must preserve `token_hash` and `type=recovery` in the callback query. Supabase's `verifyOtp` consumes the token hash once; expired, used, malformed, or wrong-type links are sent back to the frontend's invalid-link state.

## External configuration status

This repository does not change Supabase dashboard settings. The local redirect allowlist and recovery email template must be updated before real email links can complete this flow. Production deployments must also allowlist their public backend callback URL and set `AUTH_RECOVERY_CALLBACK_URL` accordingly. Email delivery has not been verified against a live Supabase project.
