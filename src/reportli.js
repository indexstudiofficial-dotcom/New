/**
 * Reportli AI - Single Cloudflare Worker
 *
 * GET  /reportli.js
 *      -> serves the Reportli tracking snippet
 *
 * POST /
 *      -> receives Reportli events
 *      -> saves the EXACT received JSON message
 *         into user_activity.event
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const REPORTLI_JS = String.raw`
/**
 * Reportli AI - Tracking Snippet
 */

(function () {
  "use strict";

  var WORKER_URL = window.location.origin;

  var scriptTag =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var API_KEY = scriptTag
    ? scriptTag.getAttribute("data-key")
    : null;

  if (!API_KEY) {
    console.warn("Reportli: missing data-key attribute");
    return;
  }

  var sessionId =
    "sess_" +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36);

  var sessionStartedAt = new Date().toISOString();

  var pageViews = 0;
  var clickCount = 0;

  var queue = [];
  var flushTimer = null;
  var isFlushing = false;
  var initialized = false;

  // ------------------------------------------------------------
  // USER IDENTITY
  // ------------------------------------------------------------

  function detectUser() {
    var email = "anonymous";
    var userId = "anonymous";

    try {
      if (
        window.reportliUser &&
        typeof window.reportliUser === "object"
      ) {
        if (window.reportliUser.email) {
          email = window.reportliUser.email;
        }

        if (window.reportliUser.userId) {
          userId = window.reportliUser.userId;
        }

        if (
          email !== "anonymous" ||
          userId !== "anonymous"
        ) {
          return {
            email: email,
            userId: userId
          };
        }
      }
    } catch (e) {}

    return {
      email: email,
      userId: userId
    };
  }

  var user = detectUser();

  function refreshUser() {
    var updated = detectUser();

    if (updated.email !== "anonymous") {
      user.email = updated.email;
    }

    if (updated.userId !== "anonymous") {
      user.userId = updated.userId;
    }
  }

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------

  function nowISO() {
    return new Date().toISOString();
  }

  function getPage() {
    try {
      return (
        window.location.pathname +
        window.location.search
      );
    } catch (e) {
      return "unknown";
    }
  }

  function getDomain() {
    try {
      return window.location.hostname;
    } catch (e) {
      return "unknown";
    }
  }

  function getBrowser() {
    try {
      return navigator.userAgent;
    } catch (e) {
      return "unknown";
    }
  }

  function baseFields() {
    refreshUser();

    return {
      api_key: API_KEY,
      domain: getDomain(),
      session_id: sessionId,
      email: user.email,
      user_id: user.userId,
      page: getPage(),
      browser: getBrowser(),
      time: nowISO()
    };
  }

  // ------------------------------------------------------------
  // SEND DIRECTLY TO THE SAME WORKER
  // ------------------------------------------------------------

  function send(payload, useBeacon) {
    try {
      var body = JSON.stringify(payload);

      if (
        useBeacon &&
        navigator.sendBeacon
      ) {
        var blob = new Blob(
          [body],
          {
            type: "application/json"
          }
        );

        navigator.sendBeacon(
          WORKER_URL,
          blob
        );

        return;
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

  // ------------------------------------------------------------
  // QUEUE
  // ------------------------------------------------------------

  function enqueue(payload) {
    if (queue.length >= 200) {
      return;
    }

    queue.push(payload);

    scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(
      function () {
        flushTimer = null;
        flush();
      },
      2000
    );
  }

  function flush() {
    if (
      isFlushing ||
      queue.length === 0
    ) {
      return;
    }

    isFlushing = true;

    var batch = queue.splice(0, 20);

    fetch(WORKER_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
      },

      body: JSON.stringify({
        type: "BATCH",
        events: batch
      }),

      keepalive: true
    })
      .catch(function () {})
      .finally(function () {
        isFlushing = false;

        if (queue.length > 0) {
          flush();
        }
      });
  }

  // ------------------------------------------------------------
  // CLICK TRACKING
  // ------------------------------------------------------------

  function trackClick(el) {
    try {
      clickCount++;

      var tag = el.tagName
        ? el.tagName.toLowerCase()
        : "unknown";

      var label = (
        el.innerText ||
        el.textContent ||
        el.value ||
        el.getAttribute("aria-label") ||
        ""
      )
        .trim()
        .slice(0, 120);

      enqueue(
        Object.assign(
          baseFields(),
          {
            type: "ACTIVITY",
            event: "click",
            element: tag,
            label: label || "(no label)"
          }
        )
      );
    } catch (e) {}
  }

  document.addEventListener(
    "click",
    function (event) {
      var el = event.target;

      if (
        el &&
        el.nodeType === 1
      ) {
        trackClick(el);
      }
    },
    true
  );

  // ------------------------------------------------------------
  // PAGE VIEWS
  // ------------------------------------------------------------

  function trackPageView() {
    try {
      pageViews++;

      enqueue(
        Object.assign(
          baseFields(),
          {
            type: "ACTIVITY",
            event: "page_view"
          }
        )
      );
    } catch (e) {}
  }

  var currentPath = getPage();

  trackPageView();

  // ------------------------------------------------------------
  // SPA NAVIGATION
  // ------------------------------------------------------------

  function handleUrlChange() {
    var newPath = getPage();

    if (newPath !== currentPath) {
      enqueue(
        Object.assign(
          baseFields(),
          {
            type: "ACTIVITY",
            event: "navigation",
            from: currentPath,
            to: newPath
          }
        )
      );

      currentPath = newPath;

      trackPageView();
    }
  }

  try {
    var originalPushState =
      history.pushState;

    history.pushState =
      function () {
        originalPushState.apply(
          history,
          arguments
        );

        handleUrlChange();
      };

    var originalReplaceState =
      history.replaceState;

    history.replaceState =
      function () {
        originalReplaceState.apply(
          history,
          arguments
        );

        handleUrlChange();
      };

    window.addEventListener(
      "popstate",
      handleUrlChange
    );

    window.addEventListener(
      "hashchange",
      handleUrlChange
    );
  } catch (e) {}

  // ------------------------------------------------------------
  // JAVASCRIPT ERRORS
  // ------------------------------------------------------------

  function trackError(
    err,
    context
  ) {
    try {
      var message =
        err && err.message
          ? err.message
          : String(err);

      var stack =
        err && err.stack
          ? String(err.stack).slice(
              0,
              3000
            )
          : "";

      send(
        Object.assign(
          baseFields(),
          {
            type: "ERROR",
            message: message,
            stack: stack,
            context:
              context || "auto"
          }
        )
      );
    } catch (e) {}
  }

  window.addEventListener(
    "error",
    function (event) {
      try {
        if (event.error) {
          trackError(
            event.error,
            "window"
          );
        } else if (
          event.message
        ) {
          trackError(
            {
              message:
                event.message,

              stack:
                "at " +
                event.filename +
                ":" +
                event.lineno +
                ":" +
                event.colno
            },
            "window"
          );
        }
      } catch (e) {}
    },
    true
  );

  // ------------------------------------------------------------
  // PROMISE ERRORS
  // ------------------------------------------------------------

  window.addEventListener(
    "unhandledrejection",
    function (event) {
      try {
        if (
          event.reason instanceof Error
        ) {
          trackError(
            event.reason,
            "unhandledrejection"
          );
        } else {
          trackError(
            {
              message: String(
                event.reason ||
                  "Unhandled Promise Rejection"
              ),
              stack: ""
            },
            "unhandledrejection"
          );
        }
      } catch (e) {}
    }
  );

  // ------------------------------------------------------------
  // FETCH FAILURES
  // ------------------------------------------------------------

  try {
    var originalFetch =
      window.fetch;

    if (originalFetch) {
      window.fetch =
        function () {
          var args = arguments;

          var input = args[0];

          var init =
            args[1] || {};

          var url =
            typeof input === "string"
              ? input
              : input && input.url
              ? input.url
              : "";

          // Don't intercept Reportli itself.
          if (
            url.indexOf(
              WORKER_URL
            ) === 0
          ) {
            return originalFetch.apply(
              window,
              args
            );
          }

          return originalFetch
            .apply(
              window,
              args
            )
            .then(
              function (response) {
                if (!response.ok) {
                  send(
                    Object.assign(
                      baseFields(),
                      {
                        type:
                          "ERROR",

                        message:
                          "Fetch " +
                          response.status +
                          ": " +
                          (init.method ||
                            "GET") +
                          " " +
                          url,

                        stack:
                          (init.method ||
                            "GET") +
                          " " +
                          url +
                          " -> " +
                          response.status,

                        context:
                          "fetch"
                      }
                    )
                  );
                }

                return response;
              }
            )
            .catch(
              function (err) {
                trackError(
                  {
                    message:
                      "Fetch failed: " +
                      (init.method ||
                        "GET") +
                      " " +
                      url +
                      " - " +
                      (err &&
                        err.message),

                    stack:
                      err &&
                      err.stack
                  },
                  "fetch"
                );

                throw err;
              }
            );
        };
    }
  } catch (e) {}

  // ------------------------------------------------------------
  // XHR FAILURES
  // ------------------------------------------------------------

  try {
    var OrigOpen =
      XMLHttpRequest.prototype.open;

    var OrigSend =
      XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open =
      function (
        method,
        url
      ) {
        this._reportliMethod =
          method;

        this._reportliUrl =
          url;

        return OrigOpen.apply(
          this,
          arguments
        );
      };

    XMLHttpRequest.prototype.send =
      function () {
        var xhr = this;

        var url =
          xhr._reportliUrl ||
          "";

        var method =
          xhr._reportliMethod ||
          "GET";

        if (
          url.indexOf(
            WORKER_URL
          ) !== 0
        ) {
          xhr.addEventListener(
            "loadend",
            function () {
              if (
                xhr.status >= 400 ||
                xhr.status === 0
              ) {
                send(
                  Object.assign(
                    baseFields(),
                    {
                      type:
                        "ERROR",

                      message:
                        "XHR " +
                        xhr.status +
                        ": " +
                        method +
                        " " +
                        url,

                      stack:
                        method +
                        " " +
                        url +
                        " -> " +
                        xhr.status,

                      context:
                        "xhr"
                    }
                  )
                );
              }
            }
          );
        }

        return OrigSend.apply(
          this,
          arguments
        );
      };
  } catch (e) {}

  // ------------------------------------------------------------
  // SESSION END
  // ------------------------------------------------------------

  function sendSessionEnd() {
    try {
      var endedAt =
        nowISO();

      var startMs =
        new Date(
          sessionStartedAt
        ).getTime();

      var endMs =
        new Date(
          endedAt
        ).getTime();

      var durationSeconds =
        Math.round(
          (endMs - startMs) /
            1000
        );

      send(
        Object.assign(
          baseFields(),
          {
            type:
              "SESSION_END",

            started_at:
              sessionStartedAt,

            ended_at:
              endedAt,

            duration_seconds:
              durationSeconds,

            page_views:
              pageViews,

            clicks:
              clickCount
          }
        ),
        true
      );
    } catch (e) {}
  }

  window.addEventListener(
    "pagehide",
    sendSessionEnd
  );

  // ------------------------------------------------------------
  // INITIALIZED
  // ------------------------------------------------------------

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    send(
      Object.assign(
        baseFields(),
        {
          type:
            "SDK_INITIALIZED",

          success: true
        }
      )
    );
  }

  init();

  // ------------------------------------------------------------
  // MANUAL API
  // ------------------------------------------------------------

  window.Reportli = {
    identify:
      function (identity) {
        try {
          if (
            identity &&
            identity.email
          ) {
            user.email =
              identity.email;
          }

          if (
            identity &&
            identity.userId
          ) {
            user.userId =
              identity.userId;
          }

          send(
            Object.assign(
              baseFields(),
              {
                type:
                  "IDENTIFY"
              }
            )
          );
        } catch (e) {}
      },

    track:
      function (
        event,
        properties
      ) {
        try {
          if (!event) {
            return;
          }

          enqueue(
            Object.assign(
              baseFields(),
              {
                type:
                  "ACTIVITY",

                event:
                  event,

                properties:
                  properties || {}
              }
            )
          );
        } catch (e) {}
      },

    capture:
      function (error) {
        trackError(
          error,
          "manual"
        );
      }
  };
})();
`;

// ------------------------------------------------------------
// CLOUDFLARE WORKER
// ------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ----------------------------------------------------------
    // CORS
    // ----------------------------------------------------------

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // ----------------------------------------------------------
    // GET /reportli.js
    // ----------------------------------------------------------

    if (
      request.method === "GET" &&
      url.pathname === "/reportli.js"
    ) {
      return new Response(
        REPORTLI_JS,
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/javascript; charset=UTF-8",

            "Cache-Control":
              "public, max-age=300",

            ...corsHeaders()
          }
        }
      );
    }

    // ----------------------------------------------------------
    // GET /
    // ----------------------------------------------------------

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return json({
        success: true,
        service: "Reportli AI",
        message:
          "Reportli Worker is running",
        snippet:
          "/reportli.js"
      });
    }

    // ----------------------------------------------------------
    // ONLY POST FOR EVENTS
    // ----------------------------------------------------------

    if (request.method !== "POST") {
      return json(
        {
          success: false,
          error: "POST required"
        },
        405
      );
    }

    // ----------------------------------------------------------
    // READ EXACT BODY
    // ----------------------------------------------------------

    let rawBody;

    try {
      rawBody = await request.text();
    } catch (error) {
      return json(
        {
          success: false,
          error: "Could not read request body"
        },
        400
      );
    }

    if (!rawBody) {
      return json(
        {
          success: false,
          error: "Empty request body"
        },
        400
      );
    }

    // ----------------------------------------------------------
    // PARSE ONLY TO GET API KEY
    // ----------------------------------------------------------

    let body;

    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      return json(
        {
          success: false,
          error: "Invalid JSON"
        },
        400
      );
    }

    // ----------------------------------------------------------
    // API KEY
    // ----------------------------------------------------------

    const apiKey =
      request.headers.get(
        "x-api-key"
      ) ||
      body.api_key ||
      body.apiKey;

    if (!apiKey) {
      return json(
        {
          success: false,
          error: "Missing API key"
        },
        401
      );
    }

    // ----------------------------------------------------------
    // SAVE EXACT MESSAGE
    //
    // The entire JSON received from reportli.js is saved
    // into user_activity.event.
    // ----------------------------------------------------------

    let eventValue;

    try {
      eventValue = JSON.parse(rawBody);
    } catch (error) {
      eventValue = rawBody;
    }

    const response =
      await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_activity`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "apikey":
              env.SUPABASE_SERVICE_ROLE_KEY,

            "Authorization":
              `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,

            "Prefer":
              "return=minimal"
          },

          body: JSON.stringify({
            event: eventValue
          })
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      return json(
        {
          success: false,
          error:
            "Database insert failed",
          details: errorText
        },
        500
      );
    }

    return json({
      success: true,
      saved: true
    });
  }
};

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, x-api-key"
  };
}

function json(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        ...corsHeaders()
      }
    }
  );
        }
