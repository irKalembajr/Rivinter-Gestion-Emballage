import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function send(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, { error: "Méthode non autorisée." });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return send(res, 500, { error: "Variables serveur Supabase manquantes." });
  }

  const token = String(req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return send(res, 401, { error: "Session manquante." });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !callerData.user) return send(res, 401, { error: "Session invalide." });

  const { data: callerProfile, error: profileError } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", callerData.user.id)
    .single();
  if (profileError || !callerProfile?.active) return send(res, 403, { error: "Profil administrateur introuvable." });

  const callerIsAdmin = ["principal_admin", "admin"].includes(callerProfile.role);
  const callerIsPrincipal = callerProfile.role === "principal_admin";
  if (!callerIsAdmin) return send(res, 403, { error: "Action réservée aux administrateurs." });

  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fullName = String(body.full_name || "").trim();
  const requestedRole = body.role || "user";
  const role = ["principal_admin", "admin", "user"].includes(requestedRole) ? requestedRole : "user";
  const locationId = body.location_id || null;

  if (!email || !password || !fullName) return send(res, 400, { error: "Nom, email et mot de passe sont obligatoires." });
  if (password.length < 8) return send(res, 400, { error: "Le mot de passe doit contenir au moins 8 caractères." });
  if (role === "principal_admin" && !callerIsPrincipal) {
    return send(res, 403, { error: "Seul l'administrateur principal peut créer un autre principal." });
  }
  if (role === "user" && !locationId) {
    return send(res, 400, { error: "Un utilisateur simple doit être affecté à un site ou axe." });
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });
  if (createError) return send(res, 400, { error: createError.message });

  const { error: upsertError } = await admin.from("profiles").upsert({
    id: created.user.id,
    email,
    full_name: fullName,
    role,
    location_id: role === "user" ? locationId : locationId || null,
    active: true
  });
  if (upsertError) return send(res, 400, { error: upsertError.message });

  return send(res, 200, { id: created.user.id, email, role });
}
