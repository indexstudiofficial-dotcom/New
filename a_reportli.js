/*
|--------------------------------------------------------------------------
| REPORTLI AI - CLOUDFLARE WORKER
|--------------------------------------------------------------------------
|
| Routes:
|
| GET  /                 -> Health check
| GET  /reportli.js      -> Browser SDK
| GET  /a_reportli.js    -> Browser SDK
| POST /                 -> Event ingestion
| OPTIONS               -> CORS
|
|--------------------------------------------------------------------------
*/

const WORKER_URL = "https://reportliai-sbs.reportliaihq.workers.dev";

/*
|--------------------------------------------------------------------------
| REPORTLI BROWSER SDK
|--------------------------------------------------------------------------
*/

const REPORTLI_JS = String.raw`
(function () {
  "use strict";

  if (window.__REPORTLI_LOADED__) {
    return;
  }

  window.__REPORTLI_LOADED__ = true;

  var WORKER_URL = "${WORKER_URL}";

  function getApiKey() {
    try {
      var currentScript = document.currentScript;
      if (currentScript) {
        var currentKey = currentScript.getAttribute("data-key");
        if (currentKey) return currentKey;
      }

      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        var script = scripts[i];
        var src = script.src || "";
        if (src.indexOf("reportli.js") !== -1 || src.indexOf("a_reportli.js") !== -1) {
          var key = script.getAttribute("data-key");
          if (key) return key;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  var API_KEY = getApiKey();

  var SESSION_ID =
    "sess_" +
    Math.random().toString(36).substring(2) +
    "_" +
    Date.now();

  var SESSION_STARTED_AT = Date.now();
  var CURRENT_SESSION_LABEL = null;

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

  function getBrowser() {
    try {
      return navigator.userAgent || "unknown";
    } catch (e) {
      return "unknown";
    }
  }

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

  function baseFields() {
    var user = detectUser();
    return {
      api_key: API_KEY,
      domain: window.location.hostname,
      session_id: SESSION_ID,
      session_label: CURRENT_SESSION_LABEL,
      email: user.email,
      user_id: user.user_id,
      page: window.location.href,
      browser: getBrowser(),
      time: new Date().toISOString(),
      local_time_display: getLocalTimeDisplay()
    };
  }

  function send(payload, useBeacon, callback) {
    if (!API_KEY) return;

    try {
      var body = JSON.stringify(payload);

      if (useBeacon && navigator.sendBeacon) {
        try {
          var blob = new Blob([body], { type: "application/json" });
          var beaconSent = navigator.sendBeacon(WORKER_URL, blob);
          if (beaconSent) return;
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
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          if (callback) callback(data);
        })
        .catch(function () {});
    } catch (e) {}
  }

  function track(eventName, data, callback) {
    try {
      var eventPayload = Object.assign(
        {},
        baseFields(),
        { event_name: eventName },
        data || {}
      );

      send(
        {
          type: "ACTIVITY",
          api_key: API_KEY,
          session_id: SESSION_ID,
          event: eventPayload
        },
        false,
        callback
      );
    } catch (e) {}
  }

  /*
  |--------------------------------------------------------------------------
  | SESSION STARTED
  |--------------------------------------------------------------------------
  */

  track(
    "SESSION_STARTED",
    { started_at: new Date().toISOString() },
    function (res) {
      if (res && res.session_label) {
        CURRENT_SESSION_LABEL = res.session_label;
      }
    }
  );

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
  | ELEMENT INFORMATION & CLICK TRACKING
  |--------------------------------------------------------------------------
  */

  function getElementInfo(element) {
    try {
      if (!element) return {};
      var tag = element.tagName ? element.tagName.toLowerCase() : null;
      var text = "";

      try {
        text = (element.innerText || element.textContent || "")
          .trim()
          .replace(/\s+/g, " ")
          .substring(0, 200);
      } catch (e) {}

      return {
        tag: tag,
        text: text,
        id: element.id || null,
        class_name: typeof element.className === "string" ? element.className : null,
        href: element.href || null,
        name: element.getAttribute ? element.getAttribute("name") : null,
        aria_label: element.getAttribute ? element.getAttribute("aria-label") : null,
        value: element.value || null
      };
    } catch (e) {
      return {};
    }
  }

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

        track("click", {
          element: info,
          label: (info.text || info.aria_label || "").trim() || "(no label)",
          x: event.clientX,
          y: event.clientY
        });
      } catch (e) {}
    },
    true
  );

  /*
  |--------------------------------------------------------------------------
  | PAGE VIEW & SPA NAVIGATION
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

  var CURRENT_PATH = window.location.pathname;

  try {
    var originalPushState = history.pushState;
    history.pushState = function () {
      var previousPath = CURRENT_PATH;
      var result = originalPushState.apply(history, arguments);
      setTimeout(function () {
        var newPath = window.location.pathname;
        if (newPath !== previousPath) {
          track("navigation", { from: previousPath, to: newPath });
          CURRENT_PATH = newPath;
        }
        trackPageView();
      }, 0);
      return result;
    };
  } catch (e) {}

  try {
    var originalReplaceState = history.replaceState;
    history.replaceState = function () {
      var previousPath = CURRENT_PATH;
      var result = originalReplaceState.apply(history, arguments);
      setTimeout(function () {
        var newPath = window.location.pathname;
        if (newPath !== previousPath) {
          track("navigation", { from: previousPath, to: newPath });
          CURRENT_PATH = newPath;
        }
        trackPageView();
      }, 0);
      return result;
    };
  } catch (e) {}

  window.addEventListener("popstate", function () {
    var previousPath = CURRENT_PATH;
    var newPath = window.location.pathname;
    if (newPath !== previousPath) {
      track("navigation", { from: previousPath, to: newPath });
      CURRENT_PATH = newPath;
    }
    trackPageView();
  });

  window.addEventListener("hashchange", trackPageView);

  /*
  |--------------------------------------------------------------------------
  | ERROR DEDUPLICATION & TRACKING
  |--------------------------------------------------------------------------
  */

  var recentErrors = {};

  function getErrorSignature(message, stack, fileName, lineNumber) {
    return [message || "", stack || "", fileName || "", lineNumber || ""].join("|");
  }

  function shouldReportError(message, stack, fileName, lineNumber) {
    try {
      var signature = getErrorSignature(message, stack, fileName, lineNumber);
      var now = Date.now();
      if (recentErrors[signature] && now - recentErrors[signature] < 2000) {
        return false;
      }
      recentErrors[signature] = now;

      Object.keys(recentErrors).forEach(function (key) {
        if (now - recentErrors[key] > 10000) {
          delete recentErrors[key];
        }
      });
      return true;
    } catch (e) {
      return true;
    }
  }

  function getErrorMessage(error) {
    try {
      if (!error) return "Unknown error";
      if (typeof error === "string") return error;
      if (error.message) return String(error.message);
      try {
        return JSON.stringify(error);
      } catch (e) {
        return String(error);
      }
    } catch (e) {
      return "Unknown error";
    }
  }

  function getErrorStack(error) {
    try {
      if (error && error.stack) return String(error.stack);
      return null;
    } catch (e) {
      return null;
    }
  }

  function trackError(error, context, extra) {
    try {
      var message = getErrorMessage(error);
      var stack = getErrorStack(error);
      var fileName = null;
      var lineNumber = null;
      var columnNumber = null;

      try {
        if (error && error.fileName) fileName = error.fileName;
        if (error && error.filename) fileName = error.filename;
        if (error && error.lineNumber) lineNumber = error.lineNumber;
        if (error && error.lineno) lineNumber = error.lineno;
        if (error && error.columnNumber) columnNumber = error.columnNumber;
        if (error && error.colno) columnNumber = error.colno;
      } catch (e) {}

      if (extra && extra.file_name) fileName = extra.file_name;
      if (extra && extra.line_number) lineNumber = extra.line_number;
      if (extra && extra.column_number) columnNumber = extra.column_number;

      if (!shouldReportError(message, stack, fileName, lineNumber)) {
        return;
      }

      var payload = {
        type: "ERROR",
        api_key: API_KEY,
        session_id: SESSION_ID,
        session_label: CURRENT_SESSION_LABEL,
        error_message: message,
        timestamp: new Date().toISOString(),
        local_time_display: getLocalTimeDisplay(),
        file_name: fileName,
        line_number: lineNumber,
        column_number: columnNumber,
        stack_trace: stack,
        context: context || "unknown",
        page: window.location.href,
        domain: window.location.hostname,
        browser: getBrowser()
      };

      if (extra) {
        try { payload.extra = extra; } catch (e) {}
      }

      send(payload, false);
    } catch (e) {}
  }

  window.onerror = function (message, source, lineno, colno, error) {
    try {
      var actualError = error || new Error(typeof message === "string" ? message : "JavaScript error");
      trackError(actualError, "window.onerror", {
        file_name: source || null,
        line_number: lineno || null,
        column_number: colno || null
      });
    } catch (e) {}
    return false;
  };

  window.addEventListener(
    "error",
    function (event) {
      try {
        if (event && event.error) {
          trackError(event.error, "window.error", {
            file_name: event.filename || null,
            line_number: event.lineno || null,
            column_number: event.colno || null
          });
          return;
        }

        var target = event && event.target;
        if (target && target !== window && target !== document) {
          var resourceUrl = target.src || target.href || null;
          var resourceType = target.tagName ? target.tagName.toLowerCase() : "resource";
          trackError(
            new Error("Failed to load " + resourceType + (resourceUrl ? ": " + resourceUrl : "")),
            "resource.error",
            { resource_url: resourceUrl, resource_type: resourceType }
          );
        }
      } catch (e) {}
    },
    true
  );

  window.addEventListener(
    "unhandledrejection",
    function (event) {
      try {
        var reason = event && event.reason;
        if (reason instanceof Error) {
          trackError(reason, "unhandledrejection");
          return;
        }
        if (typeof reason === "string") {
          trackError(new Error(reason), "unhandledrejection");
          return;
        }
        var message = "";
        try { message = JSON.stringify(reason); } catch (e) { message = String(reason); }
        trackError(new Error(message || "Unhandled promise rejection"), "unhandledrejection");
      } catch (e) {}
    },
    true
  );

  if (window.fetch) {
    try {
      var originalFetch = window.fetch;
      window.fetch = function () {
        var args = arguments;
        var requestUrl = null;
        var requestMethod = "GET";

        try {
          if (typeof args[0] === "string") {
            requestUrl = args[0];
          } else if (args[0] && args[0].url) {
            requestUrl = args[0].url;
          }
          if (args[1] && args[1].method) {
            requestMethod = args[1].method;
          }
        } catch (e) {}

        if (requestUrl && String(requestUrl).indexOf(WORKER_URL) !== -1) {
          return originalFetch.apply(this, args);
        }

        return originalFetch
          .apply(this, args)
          .then(function (response) {
            try {
              if (response && response.status >= 400) {
                trackError(
                  new Error("HTTP " + response.status + " request failed: " + requestUrl),
                  "fetch.http",
                  {
                    url: requestUrl,
                    method: requestMethod,
                    status: response.status,
                    status_text: response.statusText
                  }
                );
              }
            } catch (e) {}
            return response;
          })
          .catch(function (error) {
            try {
              trackError(error, "fetch.network", {
                url: requestUrl,
                method: requestMethod
              });
            } catch (e) {}
            throw error;
          });
      };
    } catch (e) {}
  }

  if (window.XMLHttpRequest) {
    try {
      var OriginalXHR = window.XMLHttpRequest;
      function ReportliXHR() {
        var xhr = new OriginalXHR();
        var requestUrl = null;
        var requestMethod = "GET";

        var originalOpen = xhr.open;
        xhr.open = function (method, url) {
          requestMethod = method || "GET";
          requestUrl = url;
          return originalOpen.apply(xhr, arguments);
        };

        xhr.addEventListener("loadend", function () {
          try {
            if (requestUrl && String(requestUrl).indexOf(WORKER_URL) !== -1) return;

            if (xhr.status >= 400) {
              trackError(
                new Error("XHR HTTP " + xhr.status + " request failed: " + requestUrl),
                "xhr.http",
                {
                  url: requestUrl,
                  method: requestMethod,
                  status: xhr.status,
                  status_text: xhr.statusText
                }
              );
              return;
            }

            if (xhr.status === 0 && requestUrl) {
              trackError(
                new Error("XHR network request failed: " + requestUrl),
                "xhr.network",
                { url: requestUrl, method: requestMethod, status: 0 }
              );
            }
          } catch (e) {}
        });

        return xhr;
      }
      ReportliXHR.prototype = OriginalXHR.prototype;
      window.XMLHttpRequest = ReportliXHR;
    } catch (e) {}
  }

  function capture(error, context) {
    trackError(error, context || "manual");
  }

  window.Reportli = {
    track: function (eventName, properties) {
      track(eventName, properties || {});
    },
    capture: capture,
    captureException: function (error, context) {
      capture(error, context || "captureException");
    },
    identify: function (email, userId) {
      window.reportliUser = { email: email || null, userId: userId || null };
      track("identify", { email: email || null, user_id: userId || null });
    },
    getSessionId: function () {
      return SESSION_ID;
    },
    getUser: function () {
      return detectUser();
    }
  };

  function endSession() {
    try {
      var duration = Date.now() - SESSION_STARTED_AT;
      send(
        {
          type: "ACTIVITY",
          api_key: API_KEY,
          session_id: SESSION_ID,
          event: Object.assign({}, baseFields(), {
            event_name: "SESSION_END",
            duration_ms: duration
          })
        },
        true
      );
    } catch (e) {}
  }

  window.addEventListener("pagehide", endSession);
})();
`;

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Access-Control-Max-Age": "86400"
  };
}

/*
|--------------------------------------------------------------------------
| SUPABASE REST CLIENT HELPERS
|--------------------------------------------------------------------------
*/

async function querySupabase(env, path) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials missing");
  }

  const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase query failed: ${response.status} ${errText}`);
  }

  return await response.json();
}

async function insertSupabase(env, table, data) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase credentials missing");
  }

  const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const responseText = await response.text();
    console.error("SUPABASE INSERT FAILED", {
      table: table,
      status: response.status,
      response: responseText
    });
    throw new Error(`Supabase ${table} insert failed: ${response.status} ${responseText}`);
  }

  return true;
}

/*
|--------------------------------------------------------------------------
| APPLICATION LOOKUP & SESSION NUMBER GENERATION
|--------------------------------------------------------------------------
*/

async function getApplicationByApiKey(env, apiKey) {
  if (!apiKey) return null;
  const encodedKey = encodeURIComponent(apiKey);
  const rows = await querySupabase(env, `applications?api_key=eq.${encodedKey}&select=id,user_id,domain,status`);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function computeSessionLabel(env, userId, currentSessionId) {
  if (!userId || !currentSessionId) return "S1";

  const encodedUserId = encodeURIComponent(userId);
  const rows = await querySupabase(
    env,
    `user_activity?user_id=eq.${encodedUserId}&select=session_id`
  );

  const distinctSessions = new Set();
  if (Array.isArray(rows)) {
    rows.forEach((r) => {
      if (r.session_id) distinctSessions.add(r.session_id);
    });
  }

  distinctSessions.add(currentSessionId);
  const sessionIndex = distinctSessions.size;
  return `S${sessionIndex}`;
}

/*
|--------------------------------------------------------------------------
| BUILD HUMAN READABLE ACTIVITY STRING
|--------------------------------------------------------------------------
*/

function buildActivityString(eventWrapper) {
  const inner = eventWrapper && eventWrapper.event ? eventWrapper.event : {};
  const localTime = inner.local_time_display || "";
  const eventName = inner.event_name || "";

  let activityText = "";

  if (eventName === "SESSION_STARTED") {
    activityText = "Session started";
  } else if (eventName === "SESSION_END") {
    activityText = "Session ended";
  } else if (eventName === "page_view") {
    let path = inner.page || inner.url || "";
    try {
      if (path && path.indexOf("http") === 0) {
        path = new URL(path).pathname;
      }
    } catch (e) {}
    activityText = "Viewed " + (path || "unknown page");
  } else if (eventName === "click") {
    const label = inner.label || "(no label)";
    const element = inner.element && inner.element.tag ? inner.element.tag : "element";
    if (label && label !== "(no label)") {
      activityText = 'Clicked "' + label + '"';
    } else {
      activityText = "Clicked " + element;
    }
  } else if (eventName === "navigation") {
    const from = inner.from || "unknown";
    const to = inner.to || "unknown";
    activityText = "Navigated " + from + " \u2192 " + to;
  } else if (eventName === "identify") {
    activityText = "Identified as " + (inner.email || inner.user_id || "unknown user");
  } else if (eventName === "error_occurred") {
    activityText = "error occurred";
  } else {
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
*/

async function saveActivity(env, event, app) {
  const innerEvent = event.event || {};
  const eventName = innerEvent.event_name || "";
  const sessionId = event.session_id || innerEvent.session_id || null;

  let sessionLabel = innerEvent.session_label || null;

  if (eventName === "SESSION_STARTED" && app.user_id && sessionId) {
    sessionLabel = await computeSessionLabel(env, app.user_id, sessionId);
  }

  const activityString = buildActivityString(event);

  const activityRow = {
    api_key: event.api_key || app.api_key || null,
    user_id: app.user_id,
    session_id: sessionId,
    event: {
      text: activityString,
      session_label: sessionLabel
    }
  };

  await insertSupabase(env, "user_activity", activityRow);

  return { session_label: sessionLabel };
}

/*
|--------------------------------------------------------------------------
| SAVE ERROR-TRIGGERED ACTIVITY ROW
|--------------------------------------------------------------------------
*/

async function saveErrorActivity(env, event, app) {
  const wrapper = {
    api_key: event.api_key || null,
    session_id: event.session_id || null,
    event: {
      event_name: "error_occurred",
      local_time_display: event.local_time_display || "",
      session_label: event.session_label || null
    }
  };

  await saveActivity(env, wrapper, app);
}

/*
|--------------------------------------------------------------------------
| SARVAM AI - ERROR ANALYSIS
|--------------------------------------------------------------------------
*/

async function generateAiAnalysis(env, event) {
  const location =
    (event.file_name || "unknown") +
    ":" +
    (event.line_number != null ? event.line_number : "?") +
    ":" +
    (event.column_number != null ? event.column_number : "?");

  const stack = event.stack_trace || "No stack trace available";

  if (!env.SARVAM_API_KEY) {
    return (
      (event.error_message || "An error occurred.") +
      "\n\nCause:\nUnknown - Sarvam AI is not configured.\n\nRecommended:\nCheck the Worker environment variables.\n\nLocation:\n" +
      location +
      "\n\nStack trace:\n" +
      stack
    );
  }

  try {
    const prompt =
      "You are an expert software engineer. Analyze this production error and respond in EXACTLY this plain text format with no markdown, no headers with #, no emoji:\n\n" +
      "[One or two sentence plain English explanation of what happened and why, written as flowing prose]\n\n" +
      "Cause:\n" +
      "[One or two sentence explanation of the root cause]\n\n" +
      "Recommended:\n" +
      "[One or two sentence actionable recommendation]\n\n" +
      "Location:\n" +
      location +
      "\n\n" +
      "Stack trace:\n" +
      stack +
      "\n\n" +
      "Error message: " + (event.error_message || "Unknown error") +
      "\nContext: " + (event.context || "unknown") +
      "\nPage: " + (event.page || "unknown") +
      "\n\nRespond with ONLY the formatted analysis text, nothing else. Do not repeat the Location or Stack trace sections differently than shown above - use the exact location and stack trace given.";

    const sarvamResponse = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": env.SARVAM_API_KEY
      },
      body: JSON.stringify({
        model: "sarvam-105b",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 700,
        temperature: 0.3
      })
    });

    const sarvamData = await sarvamResponse.json();
    const content =
      sarvamData &&
      sarvamData.choices &&
      sarvamData.choices[0] &&
      sarvamData.choices[0].message
        ? sarvamData.choices[0].message.content
        : null;

    if (content && content.trim()) {
      return content.trim();
    }

    throw new Error("Empty Sarvam AI response");
  } catch (e) {
    console.error("Sarvam AI error:", e.message);

    return (
      (event.error_message || "An error occurred.") +
      "\n\nCause:\nUnable to determine automatically - AI analysis failed.\n\nRecommended:\nReview the stack trace below manually.\n\nLocation:\n" +
      location +
      "\n\nStack trace:\n" +
      stack
    );
  }
}

/*
|--------------------------------------------------------------------------
| SAVE ERROR
|--------------------------------------------------------------------------
*/

async function saveError(env, event, app) {
  const errorId = "err_" + crypto.randomUUID();
  const timestamp = event.timestamp || new Date().toISOString();

  const aiAnalysis = await generateAiAnalysis(env, event);

  const errorRow = {
    id: errorId,
    api_key: event.api_key || app.api_key || null,
    user_id: app.user_id,
    error_message: event.error_message || "Unknown error",
    timestamp: timestamp,
    ai_analysis: aiAnalysis
  };

  await insertSupabase(env, "errors", errorRow);

  try {
    await saveErrorActivity(env, event, app);
  } catch (e) {
    console.error("Failed to save error activity row:", e.message);
  }

  return true;
}

/*
|--------------------------------------------------------------------------
| PROCESS EVENT
|--------------------------------------------------------------------------
*/

async function processEvent(env, event) {
  if (!event) {
    throw new Error("Empty event");
  }

  const apiKey = event.api_key || (event.event && event.event.api_key);
  if (!apiKey) {
    throw new Error("Missing api_key");
  }

  const app = await getApplicationByApiKey(env, apiKey);
  if (!app) {
    throw new Error("Invalid api_key: application not found");
  }

  if (event.type === "ERROR") {
    await saveError(env, event, app);
    return { success: true, type: "ERROR" };
  }

  const saveRes = await saveActivity(env, event, app);

  return {
    success: true,
    type: "ACTIVITY",
    session_label: saveRes ? saveRes.session_label : null
  };
}

/*
|--------------------------------------------------------------------------
| MAIN WORKER
|--------------------------------------------------------------------------
*/

export default {
  async fetch(request, env) {
    if (!env.SUPABASE_URL) {
      return new Response(
        JSON.stringify({ success: false, error: "SUPABASE_URL is not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/reportli.js" || url.pathname === "/a_reportli.js")
    ) {
      return new Response(REPORTLI_JS, {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=UTF-8",
          "Cache-Control": "public, max-age=300",
          ...corsHeaders()
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        JSON.stringify({ success: true, service: "Reportli AI", status: "online" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();

        if (body && body.type === "BATCH" && Array.isArray(body.events)) {
          const results = [];
          for (const event of body.events) {
            try {
              const result = await processEvent(env, event);
              results.push(result);
            } catch (error) {
              console.error("Batch event failed:", error);
              results.push({
                success: false,
                error: error.message || "Event processing failed"
              });
            }
          }

          return new Response(
            JSON.stringify({ success: true, processed: results.length, results: results }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
          );
        }

        const result = await processEvent(env, body);

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders() }
        });
      } catch (error) {
        console.error("Reportli Worker error:", error);

        const status = error.message && error.message.includes("Invalid api_key") ? 401 : 500;

        return new Response(
          JSON.stringify({
            success: false,
            error: error.message || "Internal server error"
          }),
          { status: status, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: "Not found" }),
      { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }
};
