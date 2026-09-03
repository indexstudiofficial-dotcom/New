export default {
  async fetch(request, env) {
    console.log("=== REPORTLI WORKER START ===");
    console.log("METHOD:", request.method);
    console.log("URL:", request.url);

    // -----------------------------
    // CORS
    // -----------------------------

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-api-key"
        }
      });
    }

    // -----------------------------
    // GET
    // -----------------------------

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          success: true,
          worker: "Reportli AI",
          status: "running"
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    // -----------------------------
    // ONLY POST
    // -----------------------------

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

    // -----------------------------
    // CHECK ENVIRONMENT VARIABLES
    // -----------------------------

    console.log(
      "SUPABASE_URL:",
      env.SUPABASE_URL ? "SET" : "MISSING"
    );

    console.log(
      "SUPABASE_SERVICE_ROLE_KEY:",
      env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING"
    );

    if (!env.SUPABASE_URL) {
      console.log("ERROR: SUPABASE_URL IS MISSING");

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
      console.log(
        "ERROR: SUPABASE_SERVICE_ROLE_KEY IS MISSING"
      );

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

    // -----------------------------
    // READ BODY
    // -----------------------------

    let rawBody;

    try {
      rawBody = await request.text();

      console.log(
        "BODY LENGTH:",
        rawBody.length
      );

      console.log(
        "BODY:",
        rawBody.slice(0, 2000)
      );
    } catch (error) {
      console.log(
        "BODY READ ERROR:",
        error.message
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Could not read request body"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!rawBody) {
      console.log("ERROR: EMPTY BODY");

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

    // -----------------------------
    // PARSE JSON
    // -----------------------------

    let body;

    try {
      body = JSON.parse(rawBody);

      console.log(
        "JSON PARSE: SUCCESS"
      );

      console.log(
        "PARSED BODY:",
        JSON.stringify(body).slice(0, 2000)
      );
    } catch (error) {
      console.log(
        "JSON PARSE ERROR:",
        error.message
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON",
          details: error.message
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // -----------------------------
    // GET API KEY
    // -----------------------------

    const apiKey =
      request.headers.get("x-api-key") ||
      body.api_key ||
      body.apiKey ||
      null;

    console.log(
      "API KEY:",
      apiKey ? "RECEIVED" : "MISSING"
    );

    // -----------------------------
    // SUPABASE URL
    // -----------------------------

    const supabaseUrl =
      env.SUPABASE_URL.replace(/\/+$/, "");

    const supabaseEndpoint =
      `${supabaseUrl}/rest/v1/user_activity`;

    console.log(
      "SUPABASE ENDPOINT:",
      supabaseEndpoint
    );

    // -----------------------------
    // DATA TO INSERT
    // -----------------------------

    const insertData = {
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
    };

    console.log(
      "INSERT DATA:",
      JSON.stringify(insertData).slice(0, 3000)
    );

    // -----------------------------
    // CALL SUPABASE
    // -----------------------------

    console.log(
      "=== CALLING SUPABASE ==="
    );

    let supabaseResponse;

    try {
      supabaseResponse = await fetch(
        supabaseEndpoint,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            "apikey":
              env.SUPABASE_SERVICE_ROLE_KEY,

            "Authorization":
              `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,

            "Prefer":
              "return=representation"
          },

          body: JSON.stringify(insertData)
        }
      );
    } catch (error) {
      console.log(
        "SUPABASE FETCH ERROR:",
        error.message
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Could not connect to Supabase",
          details: error.message
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    // -----------------------------
    // READ SUPABASE RESPONSE
    // -----------------------------

    const supabaseText =
      await supabaseResponse.text();

    console.log(
      "=== SUPABASE RESPONSE ==="
    );

    console.log(
      "STATUS:",
      supabaseResponse.status
    );

    console.log(
      "STATUS TEXT:",
      supabaseResponse.statusText
    );

    console.log(
      "BODY:",
      supabaseText
    );

    // -----------------------------
    // SUPABASE FAILED
    // -----------------------------

    if (!supabaseResponse.ok) {
      console.log(
        "=== SUPABASE INSERT FAILED ==="
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Supabase insert failed",
          supabase_status:
            supabaseResponse.status,
          supabase_status_text:
            supabaseResponse.statusText,
          supabase_response:
            supabaseText
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    // -----------------------------
    // SUCCESS
    // -----------------------------

    console.log(
      "=== SUPABASE INSERT SUCCESS ==="
    );

    return new Response(
      JSON.stringify({
        success: true,
        saved: true,
        supabase_status:
          supabaseResponse.status,
        supabase_response:
          supabaseText
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
};
