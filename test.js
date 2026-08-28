const Reportli = require("reportli");

console.log("🚀 Starting Reportli SDK test...\n");

// 1. Initialize SDK
Reportli.init({
  apiKey: "test",
  environment: "testing",
});

console.log("✅ SDK initialized");

// 2. Identify test user
Reportli.identify({
  userId: "test-user-001",
  email: "test@example.com",
  name: "Test User",
});

console.log("✅ User identified");

// 3. Track user activities
Reportli.track("login");

Reportli.track("page_view", {
  page: "/dashboard",
});

Reportli.track("button_clicked", {
  button: "Create Report",
});

Reportli.track("search", {
  query: "test report",
});

Reportli.track("checkout_started", {
  plan: "Premium",
});

console.log("✅ User activities tracked");

// 4. Send a test error
Reportli.capture(
  new Error("TEST ERROR: Database connection failed")
);

console.log("✅ Test error captured");

// 5. Send a test message
Reportli.captureMessage(
  "TEST MESSAGE: Payment button failed"
);

console.log("✅ Test message captured");

// 6. Wait for the SDK queue to send the error,
//    then flush the session activity.
setTimeout(() => {
  console.log("\n📤 Flushing session...");

  Reportli.flushSession();

  console.log("✅ Session flushed");
  console.log("\n🎉 Test finished.");
}, 5000);
