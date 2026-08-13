import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(
        { success: false, error: "Missing Authorization Header" },
        401
      );
    }

    const token = authHeader.slice("Bearer ".length);
    const { societyId, email, password } = await req.json();

    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : undefined;
    const normalizedPassword =
      typeof password === "string" ? password : undefined;

    if (!societyId || (!normalizedEmail && !normalizedPassword)) {
      return jsonResponse(
        { success: false, error: "Provide an email or password to update" },
        400
      );
    }

    if (normalizedEmail && !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return jsonResponse({ success: false, error: "Invalid email address" }, 400);
    }

    if (normalizedPassword && normalizedPassword.length < 8) {
      return jsonResponse(
        { success: false, error: "Password must be at least 8 characters" },
        400
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const {
      data: { user: requestingUser },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !requestingUser) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const { data: adminProfile, error: adminProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", requestingUser.id)
      .single();

    if (adminProfileError || adminProfile?.role !== "admin") {
      return jsonResponse(
        { success: false, error: "Admin access required" },
        403
      );
    }

    const { data: customerProfile, error: customerProfileError } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("society_id", societyId)
      .eq("role", "customer")
      .single();

    if (customerProfileError || !customerProfile) {
      return jsonResponse(
        { success: false, error: "No customer account is linked to this society" },
        404
      );
    }

    const authUpdates: { email?: string; password?: string; email_confirm?: boolean } = {};

    if (normalizedEmail && normalizedEmail !== customerProfile.email?.toLowerCase()) {
      authUpdates.email = normalizedEmail;
      authUpdates.email_confirm = true;
    }

    if (normalizedPassword) {
      authUpdates.password = normalizedPassword;
    }

    if (Object.keys(authUpdates).length === 0) {
      return jsonResponse({ success: true, email: customerProfile.email }, 200);
    }

    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
      customerProfile.id,
      authUpdates
    );

    if (authUpdateError) {
      return jsonResponse({ success: false, error: authUpdateError.message }, 400);
    }

    if (authUpdates.email) {
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ email: authUpdates.email })
        .eq("id", customerProfile.id);

      if (profileUpdateError) {
        throw profileUpdateError;
      }
    }

    return jsonResponse(
      {
        success: true,
        email: authUpdates.email || customerProfile.email,
        passwordUpdated: Boolean(authUpdates.password),
      },
      200
    );
  } catch (error) {
    console.error(error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
});
