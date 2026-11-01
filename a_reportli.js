/*
|--------------------------------------------------------------------------
| REPORTLI AI - SESSION TRACKING CLOUDFLARE WORKER
|--------------------------------------------------------------------------
|
| ROUTES:
|   GET  /                 Health check
|   GET  /reportli.js      Browser SDK
|   GET  /a_reportli.js    Browser SDK alias
|   POST /                 Event ingestion
|   OPTIONS                CORS preflight
|
| SUPABASE TABLES:
|   applications
|   user_subscriptions
|   user_activity
|
| IMPORTANT:
|   - Supports https://, http:// and hostname-only domains.
|   - Supports www and non-www domains as equivalent.
|   - Supports trailing slashes and page paths.
|   - API key must match exactly.
|   - user_activity insert does NOT include status.
|--------------------------------------------------------------------------
*/

const WORKER_URL =
  "https://reportliai-sbs.reportliaihq.workers.dev";


/*
|--------------------------------------------------------------------------
| BROWSER SDK
|--------------------------------------------------------------------------
*/

const REPORTLI_JS = String.raw`
(function () {
  "use strict";

  if (window.__REPORTLI_LOADED__) return;

  window.__REPORTLI_LOADED__ = true;

  var WORKER_URL = "${WORKER_URL}";

  /*
  |--------------------------------------------------------------------------
  | GET API KEY
  |--------------------------------------------------------------------------
  */

  function getApiKey() {
    try {
      var script = document.currentScript;

      if (script) {
        var key =
          script.getAttribute("api_key") ||
          script.getAttribute("data-key");

        if (key) return String(key).trim();
      }
    } catch (e) {}

    try {
      var scripts = document.getElementsByTagName("script");

      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";

        if (
          src.indexOf("reportli.js") !== -1 ||
          src.indexOf("a_reportli.js") !== -1
        ) {
          var key =
            scripts[i].getAttribute("api_key") ||
            scripts[i].getAttribute("data-key");

          if (key) return String(key).trim();
        }
      }
    } catch (e) {}

    try {
      if (window.REPORTLI_AI_KEY) {
        return String(window.REPORTLI_AI_KEY).trim();
      }
    } catch (e) {}

    return null;
  }

  var API_KEY = getApiKey();

  /*
  |--------------------------------------------------------------------------
  | SESSION
  |--------------------------------------------------------------------------
  */

  var SESSION_ID =
    "sess_" +
    Math.random().toString(36).substring(2) +
    "_" +
    Date.now();

  var SESSION_STARTED_AT = Date.now();

  var SESSION_ENDED = false;


  /*
  |--------------------------------------------------------------------------
  | USER DETECTION
  |--------------------------------------------------------------------------
  */

  function detectUser() {
    try {
      if (window.reportliUser) {
        return {
          email: window.reportliUser.email || null,
          user_id: window.reportliUser.userId || null
        };
      }
    } catch (e) {}

    return {
      email: null,
      user_id: null
    };
  }


  /*
  |--------------------------------------------------------------------------
  | BROWSER INFORMATION
  |--------------------------------------------------------------------------
  */

  function getBrowser() {
    try {
      return navigator.userAgent || "unknown";
    } catch (e) {
      return "unknown";
    }
  }


  /*
  |--------------------------------------------------------------------------
  | LOCAL TIME
  |--------------------------------------------------------------------------
  */

  function getLocalTimeDisplay() {
    try {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    } catch (e) {
      return "";
    }
  }


  /*
  |--------------------------------------------------------------------------
  | DOMAIN
  |--------------------------------------------------------------------------
  */

  function getDomain() {
    try {
      return window.location.hostname
        .trim()
        .toLowerCase()
        .replace(/\.$/, "");
    } catch (e) {
      return "";
    }
  }


  /*
  |--------------------------------------------------------------------------
  | BASE EVENT FIELDS
  |--------------------------------------------------------------------------
  */

  function baseFields() {
    var user = detectUser();

    return {
      api_key: API_KEY,
      domain: getDomain(),
      session_id: SESSION_ID,
      email: user.email,
      user_id: user.user_id,
      page: window.location.href,
      browser: getBrowser(),
      time: new Date().toISOString(),
      local_time_display: getLocalTimeDisplay()
    };
  }


  /*
  |--------------------------------------------------------------------------
  | SEND EVENT
  |--------------------------------------------------------------------------
  */

  function send(payload, useBeacon) {
    if (!API_KEY) return;

    try {
      var body = JSON.stringify(payload);

      if (useBeacon && navigator.sendBeacon) {
        try {
          var blob = new Blob([body], {
            type: "application/json"
          });

          if (navigator.sendBeacon(WORKER_URL, blob)) {
            return;
          }
        } catch (e) {}
      }

      fetch(WORKER_URL, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY
        },

        body: body,
        keepalive: true

      }).catch(function () {});

    } catch (e) {}
  }


  /*
  |--------------------------------------------------------------------------
  | ACTIVITY TRACKING
  |--------------------------------------------------------------------------
  */

  function track(eventName, data) {
    try {
      var eventPayload = Object.assign(
        {},
        baseFields(),
        {
          event_name: eventName
        },
        data || {}
      );

      send({
        type: "ACTIVITY",
        api_key: API_KEY,
        session_id: SESSION_ID,
        event: eventPayload
      }, false);

    } catch (e) {}
  }


  /*
  |--------------------------------------------------------------------------
  | API KEY VALIDATION
  |--------------------------------------------------------------------------
  */

  if (!API_KEY) {
    console.warn(
      "Reportli: API key not found. Add api_key=\"YOUR_KEY\" to the Reportli script tag."
    );

    return;
  }


  /*
  |--------------------------------------------------------------------------
  | SESSION STARTED
  |--------------------------------------------------------------------------
  */

  track("SESSION_STARTED", {
    started_at: new Date().toISOString()
  });


  /*
  |--------------------------------------------------------------------------
  | INITIAL PAGE VIEW
  |--------------------------------------------------------------------------
  */

  track("page_view", {
    url: window.location.href,
    title: document.title
  });


  /*
  |--------------------------------------------------------------------------
  | ELEMENT INFORMATION
  |--------------------------------------------------------------------------
  */

  function getElementInfo(element) {
    try {
      if (!element) return {};

      var tag = element.tagName
        ? element.tagName.toLowerCase()
        : null;

      var text = "";

      try {
        text = (
          element.innerText ||
          element.textContent ||
          ""
        )
          .trim()
          .replace(/\s+/g, " ")
          .substring(0, 200);
      } catch (e) {}

      var className = null;

      try {
        if (typeof element.className === "string") {
          className = element.className;
        }
      } catch (e) {}

      return {
        tag: tag,
        text: text,
        id: element.id || null,
        class_name: className,
        href: element.href || null,

        name: element.getAttribute
          ? element.getAttribute("name")
          : null,

        aria_label: element.getAttribute
          ? element.getAttribute("aria-label")
          : null
      };

    } catch (e) {
      return {};
    }
  }


  /*
  |--------------------------------------------------------------------------
  | CLICK TRACKING
  |--------------------------------------------------------------------------
  */

  document.addEventListener(
    "click",
    function (event) {
      try {
        var target = event.target;

        if (!target) return;

        var clickable = null;

        try {
          clickable = target.closest(
            "button,a,input,select,textarea,[role='button'],[onclick]"
          );
        } catch (e) {}

        clickable = clickable || target;

        var info = getElementInfo(clickable);

        var label = (
          info.text ||
          info.aria_label ||
          ""
        ).trim() || "(no label)";

        track("click", {
          element: info,
          label: label,
          x: event.clientX,
          y: event.clientY
        });

      } catch (e) {}
    },
    true
  );


  /*
  |--------------------------------------------------------------------------
  | PAGE VIEW
  |--------------------------------------------------------------------------
  */

  function trackPageView() {
    try {
      track("page_view", {
        url: window.location.href,
        title: document.title
      });
    } catch (e) {}
  }


  /*
  |--------------------------------------------------------------------------
  | SPA NAVIGATION
  |--------------------------------------------------------------------------
  */

  var CURRENT_PATH = window.location.pathname;

  function handleNavigation() {
    try {
      var previousPath = CURRENT_PATH;

      var newPath = window.location.pathname;

      if (newPath !== previousPath) {
        track("navigation", {
          from: previousPath,
          to: newPath
        });

        CURRENT_PATH = newPath;
      }

      trackPageView();

    } catch (e) {}
  }


  /*
  |--------------------------------------------------------------------------
  | HISTORY PUSH STATE
  |--------------------------------------------------------------------------
  */

  try {
    var originalPushState = history.pushState;

    history.pushState = function () {
      var result = originalPushState.apply(
        history,
        arguments
      );

      setTimeout(handleNavigation, 0);

      return result;
    };

  } catch (e) {}


  /*
  |--------------------------------------------------------------------------
  | HISTORY REPLACE STATE
  |--------------------------------------------------------------------------
  */

  try {
    var originalReplaceState = history.replaceState;

    history.replaceState = function () {
      var result = originalReplaceState.apply(
        history,
        arguments
      );

      setTimeout(handleNavigation, 0);

      return result;
    };

  } catch (e) {}


  /*
  |--------------------------------------------------------------------------
  | POPSTATE
  |--------------------------------------------------------------------------
  */

  window.addEventListener(
    "popstate",
    handleNavigation
  );


  /*
  |--------------------------------------------------------------------------
  | HASH CHANGE
  |--------------------------------------------------------------------------
  */

  window.addEventListener(
    "hashchange",
    trackPageView
  );


  /*
  |--------------------------------------------------------------------------
  | PUBLIC REPORTLI API
  |--------------------------------------------------------------------------
  */

  window.Reportli = {

    track: function (eventName, properties) {
      track(
        eventName,
        properties || {}
      );
    },

    identify: function (email, userId) {
      window.reportliUser = {
        email: email || null,
        userId: userId || null
      };

      track("identify", {
        email: email || null,
        user_id: userId || null
      });
    },

    getSessionId: function () {
      return SESSION_ID;
    },

    getUser: function () {
      return detectUser();
    }

  };


  /*
  |--------------------------------------------------------------------------
  | SESSION END
  |--------------------------------------------------------------------------
  */

  function endSession() {
    if (SESSION_ENDED) return;

    SESSION_ENDED = true;

    try {
      var duration =
        Date.now() - SESSION_STARTED_AT;

      send({
        type: "ACTIVITY",

        api_key: API_KEY,

        session_id: SESSION_ID,

        event: Object.assign(
          {},
          baseFields(),
          {
            event_name: "SESSION_END",
            duration_ms: duration
          }
        )

      }, true);

    } catch (e) {}
  }


  /*
  |--------------------------------------------------------------------------
  | PAGE HIDE
  |--------------------------------------------------------------------------
  */

  window.addEventListener(
    "pagehide",
    endSession
  );

})();
`;


/*
|--------------------------------------------------------------------------
| CORS HEADERS
|--------------------------------------------------------------------------
*/

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, x-api-key",

    "Access-Control-Max-Age":
      "86400"
  };
}


/*
|--------------------------------------------------------------------------
| NORMALIZE DOMAIN
|--------------------------------------------------------------------------
|
| ACCEPTS:
|   https://example.com
|   http://example.com
|   example.com
|   www.example.com
|   example.com/
|   example.com/dashboard
|
| www and non-www are treated as equivalent.
|--------------------------------------------------------------------------
*/

function normalizeDomain(domain) {
  if (typeof domain !== "string") {
    return "";
  }

  try {
    var value = domain.trim().toLowerCase();

    if (!value) return "";

    // Add protocol when missing.
    if (!/^https?:\/\//i.test(value)) {
      value = "https://" + value;
    }

    var hostname = new URL(value).hostname
      .toLowerCase()
      .replace(/\.$/, "");

    // www and non-www are equivalent.
    hostname = hostname.replace(/^www\./, "");

    return hostname;

  } catch (error) {
    return "";
  }
}


/*
|--------------------------------------------------------------------------
| SUPABASE REQUEST
|--------------------------------------------------------------------------
*/

async function supabaseRequest(env, path, options) {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is missing");
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing"
    );
  }

  var base = env.SUPABASE_URL.replace(/\/+$/, "");

  return fetch(base + path, {
    ...(options || {}),

    headers: {
      ...((options && options.headers) || {}),

      "apikey":
        env.SUPABASE_SERVICE_ROLE_KEY,

      "Authorization":
        "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
}


/*
|--------------------------------------------------------------------------
| SUPABASE INSERT
|--------------------------------------------------------------------------
*/

async function insertSupabase(env, table, data) {
  var response = await supabaseRequest(
    env,
    "/rest/v1/" + table,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },

      body: JSON.stringify(data)
    }
  );

  var responseText = await response.text();

  if (!response.ok) {
    console.error("SUPABASE INSERT FAILED", {
      table: table,
      status: response.status,
      response: responseText
    });

    throw new Error(
      "Supabase " +
      table +
      " insert failed: " +
      response.status +
      " " +
      responseText
    );
  }

  return true;
}


/*
|--------------------------------------------------------------------------
| GET APPLICATION
|--------------------------------------------------------------------------
|
| 1. Find application using exact API key.
| 2. Normalize incoming domain.
| 3. Normalize stored domain.
| 4. Compare both normalized domains.
|
|--------------------------------------------------------------------------
*/

async function getApplicationForEvent(env, event, request) {
  var apiKey =
    typeof event.api_key === "string"
      ? event.api_key.trim()
      : "";

  // Header fallback.
  if (!apiKey && request && request.headers) {
    apiKey = (
      request.headers.get("x-api-key") || ""
    ).trim();
  }

  if (!apiKey) {
    throw new Error("API key is required");
  }

  // Get incoming domain.
  var domain = normalizeDomain(
    event.domain ||
    (
      event.event &&
      event.event.domain
    ) ||
    ""
  );

  // Origin fallback.
  if (!domain && request && request.headers) {
    domain = normalizeDomain(
      request.headers.get("Origin") || ""
    );
  }

  if (!domain) {
    throw new Error("Domain is required");
  }

  // Search by API key only.
  var params = new URLSearchParams({
    select: "id,name,api_key,user_id,domain",
    api_key: "eq." + apiKey,
    limit: "10"
  });

  var response = await supabaseRequest(
    env,
    "/rest/v1/applications?" + params.toString(),
    {
      method: "GET"
    }
  );

  var responseText = await response.text();

  if (!response.ok) {
    console.error("APPLICATION LOOKUP FAILED", {
      status: response.status,
      response: responseText
    });

    throw new Error("Application lookup failed");
  }

  var rows;

  try {
    rows = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      "Invalid application lookup response"
    );
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Invalid API key or domain");
  }

  // Compare normalized domains.
  var application = rows.find(function (row) {
    return normalizeDomain(row.domain) === domain;
  });

  if (!application) {
    console.error("DOMAIN VALIDATION FAILED", {
      received_domain: domain,

      registered_domains: rows.map(function (row) {
        return normalizeDomain(row.domain);
      })
    });

    throw new Error("Invalid API key or domain");
  }

  if (!application.user_id) {
    throw new Error(
      "Application is not linked to a Reportli user"
    );
  }

  return application;
}


/*
|--------------------------------------------------------------------------
| CHECK USER SUBSCRIPTION
|--------------------------------------------------------------------------
|
| PRESERVED FROM YOUR ORIGINAL WORKER.
|
| ACTIVE:
|   Allow tracking.
|
| NULL:
|   Change status to Active and allow tracking.
|
| OTHER STATUS:
|   Reject tracking.
|
| NO SUBSCRIPTION:
|   Reject tracking.
|--------------------------------------------------------------------------
*/

async function checkUserSubscription(env, userId) {
  if (!userId) {
    return false;
  }

  var params = new URLSearchParams({
    select: "id,user_id,subscription_status",
    user_id: "eq." + userId,
    limit: "1"
  });

  var response = await supabaseRequest(
    env,
    "/rest/v1/user_subscriptions?" +
      params.toString(),
    {
      method: "GET"
    }
  );

  var responseText = await response.text();

  if (!response.ok) {
    console.error(
      "SUBSCRIPTION LOOKUP FAILED",
      responseText
    );

    throw new Error("Subscription lookup failed");
  }

  var rows;

  try {
    rows = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      "Invalid subscription response"
    );
  }

  // No subscription.
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(
      "No subscription found for user:",
      userId
    );

    return false;
  }

  var subscription = rows[0];

  // NULL -> ACTIVE.
  if (subscription.subscription_status === null) {
    var updateResponse = await supabaseRequest(
      env,
      "/rest/v1/user_subscriptions?id=eq." +
        encodeURIComponent(subscription.id),
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },

        body: JSON.stringify({
          subscription_status: "Active",
          updated_at: new Date().toISOString()
        })
      }
    );

    var updateText = await updateResponse.text();

    if (!updateResponse.ok) {
      console.error(
        "SUBSCRIPTION UPDATE FAILED",
        updateText
      );

      throw new Error(
        "Failed to activate subscription"
      );
    }

    console.log(
      "Subscription status changed from NULL to Active:",
      userId
    );

    return true;
  }

  // Only Active subscriptions.
  var status = String(
    subscription.subscription_status
  )
    .trim()
    .toLowerCase();

  if (status === "active") {
    return true;
  }

  console.log("Subscription inactive:", {
    user_id: userId,
    status: subscription.subscription_status
  });

  return false;
}


/*
|--------------------------------------------------------------------------
| BUILD ACTIVITY MESSAGE
|--------------------------------------------------------------------------
*/

function buildActivityString(eventWrapper) {
  var inner =
    eventWrapper &&
    eventWrapper.event
      ? eventWrapper.event
      : {};

  var localTime =
    inner.local_time_display || "";

  var eventName =
    inner.event_name || "";

  var activityText = "";

  if (eventName === "SESSION_STARTED") {
    activityText = "Session started";
  }

  else if (eventName === "SESSION_END") {
    activityText = "Session ended";
  }

  else if (eventName === "page_view") {
    var path = inner.page || inner.url || "";

    try {
      if (path && /^https?:\/\//i.test(path)) {
        path = new URL(path).pathname;
      }
    } catch (e) {}

    activityText =
      "Viewed " + (path || "unknown page");
  }

  else if (eventName === "click") {
    var label = inner.label || "(no label)";

    var element =
      inner.element &&
      inner.element.tag
        ? inner.element.tag
        : "element";

    if (label !== "(no label)") {
      activityText = 'Clicked "' + label + '"';
    } else {
      activityText = "Clicked " + element;
    }
  }

  else if (eventName === "navigation") {
    activityText =
      "Navigated " +
      (inner.from || "unknown") +
      " → " +
      (inner.to || "unknown");
  }

  else if (eventName === "identify") {
    activityText =
      "Identified as " +
      (
        inner.email ||
        inner.user_id ||
        "unknown user"
      );
  }

  else if (eventName === "error_occurred") {
    activityText = "Error occurred";
  }

  else {
    activityText = eventName || "Activity";
  }

  if (localTime) {
    return localTime + "   " + activityText;
  }

  return activityText;
}


/*
|--------------------------------------------------------------------------
| SAVE ACTIVITY
|--------------------------------------------------------------------------
|
| IMPORTANT:
| No status field is inserted.
|--------------------------------------------------------------------------
*/

async function saveActivity(env, event, application) {
  var activityString =
    buildActivityString(event);

  var inner = event.event || {};

  var activity = {
    id: "act_" + crypto.randomUUID(),

    user_id:
      application.user_id,

    api_key:
      event.api_key || null,

    session_id:
      event.session_id || null,

    time:
      inner.time ||
      event.timestamp ||
      new Date().toISOString(),

    event: {
      message: activityString,
      event_name: inner.event_name || "unknown"
    }
  };

  await insertSupabase(
    env,
    "user_activity",
    activity
  );

  return true;
}


/*
|--------------------------------------------------------------------------
| PROCESS EVENT
|--------------------------------------------------------------------------
*/

async function processEvent(env, event, request) {
  if (!event) {
    throw new Error("Empty event");
  }

  // API key fallback.
  if (!event.api_key && request && request.headers) {
    var headerKey =
      request.headers.get("x-api-key");

    if (headerKey) {
      event.api_key = headerKey.trim();
    }
  }

  // Application validation.
  var application =
    await getApplicationForEvent(
      env,
      event,
      request
    );

  // Subscription validation.
  var subscriptionActive =
    await checkUserSubscription(
      env,
      application.user_id
    );

  if (!subscriptionActive) {
    return {
      success: false,
      processed: false,
      reason: "Active subscription required"
    };
  }

  // Legacy error event.
  if (event.type === "ERROR") {
    var simpleErrorEvent = {
      api_key: event.api_key,

      session_id:
        event.session_id || null,

      timestamp:
        event.timestamp ||
        new Date().toISOString(),

      event: {
        event_name: "error_occurred",

        local_time_display:
          event.local_time_display || "",

        time:
          event.timestamp ||
          new Date().toISOString()
      }
    };

    await saveActivity(
      env,
      simpleErrorEvent,
      application
    );

    return {
      success: true,
      type: "ACTIVITY"
    };
  }

  // Normal activity.
  await saveActivity(
    env,
    event,
    application
  );

  return {
    success: true,
    type: "ACTIVITY"
  };
}


/*
|--------------------------------------------------------------------------
| JSON RESPONSE
|--------------------------------------------------------------------------
*/

function jsonResponse(body, status) {
  return new Response(
    JSON.stringify(body),
    {
      status: status,

      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    }
  );
}


/*
|--------------------------------------------------------------------------
| MAIN WORKER
|--------------------------------------------------------------------------
*/

export default {

  async fetch(request, env) {

    // OPTIONS.
    if (request.method === "OPTIONS") {
      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders()
        }
      );
    }

    // URL.
    var url = new URL(request.url);

    // Serve browser SDK.
    if (
      request.method === "GET" &&
      (
        url.pathname === "/reportli.js" ||
        url.pathname === "/a_reportli.js"
      )
    ) {
      return new Response(
        REPORTLI_JS,
        {
          status: 200,

          headers: {
            "Content-Type":
              "application/javascript; charset=UTF-8",

            "Cache-Control":
              "public, max-age=60",

            ...corsHeaders()
          }
        }
      );
    }

    // Health check.
    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return jsonResponse(
        {
          success: true,
          service: "Reportli AI",
          status: "online",
          sdk: "available",
          tracking: "activity_only",
          subscription_check: true
        },
        200
      );
    }

    // Environment validation.
    if (!env.SUPABASE_URL) {
      return jsonResponse(
        {
          success: false,
          error: "SUPABASE_URL is not configured"
        },
        500
      );
    }

    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is not configured"
        },
        500
      );
    }

    // POST event.
    if (request.method === "POST") {
      try {
        var body = await request.json();

        // Batch events.
        if (
          body &&
          body.type === "BATCH" &&
          Array.isArray(body.events)
        ) {
          var results = [];

          for (var i = 0; i < body.events.length; i++) {
            try {
              var batchResult =
                await processEvent(
                  env,
                  body.events[i],
                  request
                );

              results.push(batchResult);

            } catch (error) {
              console.error(
                "Batch event failed:",
                error.message
              );

              results.push({
                success: false,
                error:
                  error.message ||
                  "Event processing failed"
              });
            }
          }

          var failed = results.filter(
            function (result) {
              return !result.success;
            }
          ).length;

          return jsonResponse(
            {
              success: failed === 0,
              processed: results.length,
              failed: failed,
              results: results
            },
            failed === 0 ? 200 : 207
          );
        }

        // Single event.
        var result =
          await processEvent(
            env,
            body,
            request
          );

        return jsonResponse(result, 200);

      } catch (error) {
        console.error(
          "Reportli Worker error:",
          error.message
        );

        var authErrors = [
          "API key is required",
          "Domain is required",
          "Invalid API key or domain",
          "Application is not linked to a Reportli user"
        ];

        if (authErrors.indexOf(error.message) !== -1) {
          return jsonResponse(
            {
              success: false,
              error: error.message
            },
            401
          );
        }

        return jsonResponse(
          {
            success: false,
            error:
              error.message ||
              "Internal server error"
          },
          500
        );
      }
    }

    // Not found.
    return jsonResponse(
      {
        success: false,
        error: "Not found"
      },
      404
    );
  }
};
