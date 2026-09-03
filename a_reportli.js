export default {
  async fetch(request, env) {
    return new Response(
      JSON.stringify({
        success: true,
        supabase_url_exists: !!env.SUPABASE_URL,
        service_role_exists: !!env.SUPABASE_SERVICE_ROLE_KEY,
        supabase_url_length: env.SUPABASE_URL
          ? env.SUPABASE_URL.length
          : 0,
        service_role_length: env.SUPABASE_SERVICE_ROLE_KEY
          ? env.SUPABASE_SERVICE_ROLE_KEY.length
          : 0
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
