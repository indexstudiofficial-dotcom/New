export default {
  async fetch(request, env) {
    console.log("REPORTLI TEST WORKER IS RUNNING");

    return new Response(
      "REPORTLI TEST WORKER 12345",
      {
        status: 200,
        headers: {
          "Content-Type": "text/plain"
        }
      }
    );
  }
};
