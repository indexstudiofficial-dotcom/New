export default {
  async fetch(request, env) {
    console.log("=== REPORTLI WORKER START ===");
    console.log("METHOD:", request.method);
    console.log("URL:", request.url);

    if (request.method !== "POST") {
      console.log("NOT POST");
      return new Response("POST required", { status: 405 });
    }

    try {
      const bodyText = await request.text();

      console.log("BODY RECEIVED:");
      console.log(bodyText);

      let body;

      try {
        body = JSON.parse(bodyText);
      } catch (error) {
        console.log("JSON PARSE ERROR:", error.message);

        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid JSON",
            body: bodyText
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      console.log("JSON PARSED SUCCESSFULLY");
      console.log("BODY:", JSON.stringify(body));

      console.log("SUPABASE URL:", env.SUPABASE_URL ? "SET" : "MISSING");
      console.log(
        "SUPABASE SERVICE KEY:",
        env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING"
      );

      if (!env.SUPABASE_URL) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "SUPABASE_URL secret missing"
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
            error: "SUPABASE_SERVICE_ROLE_KEY secret missing"
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      console.log("ABOUT TO CALL SUPABASE");

      const supabaseResponse = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_activity`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization":
              `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            user_id:
              body.user_id ||
              body.userId ||
              "anonymous",

            session_id:
              body.session_id ||
              body.sessionId ||
              "anonymous",

            time:
              body.time ||
              new Date().toISOString(),

            event: body
          })
        }
      );

      console.log(
        "SUPABASE RESPONSE STATUS:",
        supabaseResponse.status
      );

      const supabaseText = await supabaseResponse.text();

      console.log(
        "SUPABASE RESPONSE:",
        supabaseText
      );

      if (!supabaseResponse.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Supabase insert failed",
            status: supabaseResponse.status,
            details: supabaseText
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      console.log("=== SUPABASE INSERT SUCCESS ===");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Saved to Supabase",
          supabase_status: supabaseResponse.status
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

    } catch (error) {
      console.log("WORKER ERROR:", error.message);
      console.log("STACK:", error.stack);

      return new Response(
        JSON.stringify({
          success: false,
          error: error.message
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};
