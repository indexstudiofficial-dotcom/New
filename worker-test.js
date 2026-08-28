fetch("https://old-paper-f025.reportliaihq.workers.dev", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    type: "SDK_INITIALIZED",
    session_id: "test-session-001",
    environment: "test",
    browser: "Node.js test"
  })
})
.then(async (response) => {
  console.log("HTTP STATUS:", response.status);
  console.log("WORKER RESPONSE:", await response.text());
})
.catch((error) => {
  console.error("REQUEST FAILED:", error);
});
