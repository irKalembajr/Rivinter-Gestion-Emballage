import { createClient } from "@supabase/supabase-js";

function normalizeSupabaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const dashboardProject = raw.match(/supabase\.com\/dashboard\/project\/([^/?#]+)/i);
  if (dashboardProject?.[1]) return `https://${dashboardProject[1]}.supabase.co`;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".supabase.co")) return url.origin;
  } catch (_error) {
    return raw;
  }
  return raw;
}

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function send(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return send(res, 405, { error: "Méthode non autorisée." });
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return send(res, 500, { error: "Variables serveur Supabase manquantes: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY." });
    }

    const token = String(req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return send(res, 401, { error: "Session manquante." });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData.user) {
      return send(res, 401, { error: callerError?.message || "Session invalide." });
    }

    const { data: callerProfiles, error: profileError } = await admin
      .from("profiles")
      .select("role, active")
      .eq("id", callerData.user.id)
      .limit(2);
    if (profileError) {
      return send(res, 403, { error: `Lecture du profil impossible: ${profileError.message}` });
    }
    if (!callerProfiles?.length) {
      return send(res, 403, {
        error: "Profil administrateur introuvable. Vérifiez que SUPABASE_SERVICE_ROLE_KEY est la vraie clé service_role et que votre compte existe dans public.profiles."
      });
    }
    if (callerProfiles.length > 1) {
      return send(res, 403, { error: "Plusieurs profils trouvés pour ce compte. Vérifiez la table public.profiles." });
    }
    const callerProfile = callerProfiles[0];
    if (!callerProfile.active) {
      return send(res, 403, { error: "Votre profil administrateur est désactivé." });
    }

    const callerIsAdmin = ["principal_admin", "admin"].includes(callerProfile.role);
    const callerIsPrincipal = callerProfile.role === "principal_admin";
    if (!callerIsAdmin) return send(res, 403, { error: "Action réservée aux administrateurs." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.full_name || "").trim();
    const requestedRole = body.role || "user";
    const role = ["principal_admin", "admin", "user"].includes(requestedRole) ? requestedRole : "user";
    const locationId = body.location_id || null;

    if (!email || !password || !fullName) {
      return send(res, 400, { error: "Nom, email et mot de passe sont obligatoires." });
    }
    if (password.length < 8) {
      return send(res, 400, { error: "Le mot de passe doit contenir au moins 8 caractères." });
    }
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
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: error.message || "Erreur serveur pendant la création du compte." });
  }
}
