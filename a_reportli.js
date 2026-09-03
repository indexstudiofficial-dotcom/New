export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "POST required"
        }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Read the exact JSON body
    const rawBody = await request.text();

    if (!rawBody) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Empty request body"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Verify it is valid JSON
    let event;

    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Check Cloudflare secrets
    if (!env.SUPABASE_URL) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "SUPABASE_URL is missing"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "SUPABASE_SERVICE_ROLE_KEY is missing"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Remove trailing slash from Supabase URL
    const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");

    // Insert the EXACT received JSON into user_activity.event
    const supabaseResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_activity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          event: event
        })
      }
    );

    if (!supabaseResponse.ok) {
      const details = await supabaseResponse.text();

      return new Response(
        JSON.stringify({
          success: false,
          error: "Supabase insert failed",
          status: supabaseResponse.status,
          details: details
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        saved: true
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
