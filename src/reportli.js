
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
    console.warn(
      "Reportli: missing data-key attribute"
    );
    return;
  }

  // ------------------------------------------------------------
  // SESSION STATE
  // ------------------------------------------------------------

  var sessionId =
    "sess_" +
    Math.random().toString(36).slice(2) +
    Date.now().toString(36);

  var sessionStartedAt =
    new Date().toISOString();

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
          email = String(
            window.reportliUser.email
          );
        }

        if (window.reportliUser.userId) {
          userId = String(
            window.reportliUser.userId
          );
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

    if (
      updated.email !== "anonymous"
    ) {
      user.email = updated.email;
    }

    if (
      updated.userId !== "anonymous"
    ) {
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
  // SEND
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
          "Content-Type":
            "application/json",

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

    var batch =
      queue.splice(0, 20);

    fetch(WORKER_URL, {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",

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

      var tag =
        el.tagName
          ? el.tagName.toLowerCase()
          : "unknown";

      var label = (
        el.innerText ||
        el.textContent ||
        el.value ||
        el.getAttribute(
          "aria-label"
        ) ||
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
            label:
              label || "(no label)"
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

  var currentPath =
    getPage();

  trackPageView();

  // ------------------------------------------------------------
  // SPA NAVIGATION
  // ------------------------------------------------------------

  function handleUrlChange() {
    var newPath =
      getPage();

    if (
      newPath !==
      currentPath
    ) {
      enqueue(
        Object.assign(
          baseFields(),
          {
            type:
              "ACTIVITY",

            event:
              "navigation",

            from:
              currentPath,

            to:
              newPath
          }
        )
      );

      currentPath =
        newPath;

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
        err &&
        err.message
          ? String(err.message)
          : String(err);

      var stack =
        err &&
        err.stack
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

            message:
              message,

            stack:
              stack,

            context:
              context ||
              "auto"
          }
        )
      );
    } catch (e) {}
  }

  window.addEventListener(
    "error",
    function (event) {
      try {
        var target =
          event.target;

        // Resource errors
        if (
          target &&
          target.nodeType === 1 &&
          target !== window &&
          [
            "IMG",
            "SCRIPT",
            "LINK",
            "VIDEO",
            "AUDIO",
            "SOURCE"
          ].indexOf(
            target.tagName
          ) !== -1
        ) {
          var src =
            target.src ||
            target.href ||
            "unknown";

          trackError(
            {
              message:
                target.tagName +
                " failed to load: " +
                src,

              stack: ""
            },
            "resource"
          );

          return;
        }

        // JavaScript error
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
  // UNHANDLED PROMISE REJECTIONS
  // ------------------------------------------------------------

  window.addEventListener(
    "unhandledrejection",
    function (event) {
      try {
        if (
          event.reason instanceof
          Error
        ) {
          trackError(
            event.reason,
            "unhandledrejection"
          );
        } else {
          trackError(
            {
              message:
                String(
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
          var args =
            arguments;

          var input =
            args[0];

          var init =
            args[1] || {};

          var url =
            typeof input ===
            "string"
              ? input
              : input &&
                input.url
              ? input.url
              : "";

          // Do not intercept Reportli
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
                if (
                  !response.ok
                ) {
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
                      (
                        err &&
                        err.message
                      ),

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
      XMLHttpRequest
        .prototype.open;

    var OrigSend =
      XMLHttpRequest
        .prototype.send;

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
                xhr.status >=
                  400 ||
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
  // INITIALIZATION
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

          success:
            true
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
              String(
                identity.email
              );
          }

          if (
            identity &&
            identity.userId
          ) {
            user.userId =
              String(
                identity.userId
              );
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
                  properties ||
                  {}
              }
            )
          );
        } catch (e) {}
      },

    capture:
      function (error) {
        try {
          trackError(
            error,
            "manual"
          );
        } catch (e) {}
      }
  };

})();
`;

// ============================================================
// CLOUDFLARE WORKER
// ============================================================

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    // ----------------------------------------------------------
    // CORS
    // ----------------------------------------------------------

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers:
            corsHeaders()
        }
      );
    }

    // ----------------------------------------------------------
    // GET /reportli.js
    // ----------------------------------------------------------

    if (
      request.method === "GET" &&
      url.pathname ===
        "/reportli.js"
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
      return json(
        {
          success: true,

          service:
            "Reportli AI",

          status:
            "running",

          endpoint:
            "/",

          snippet:
            "/reportli.js"
        }
      );
    }

    // ----------------------------------------------------------
    // ONLY POST FOR EVENTS
    // ----------------------------------------------------------

    if (
      request.method !==
      "POST"
    ) {
      return json(
        {
          success: false,
          error:
            "POST required"
        },
        405
      );
    }

    // ----------------------------------------------------------
    // CHECK SECRETS
    // ----------------------------------------------------------

    if (
      !env.SUPABASE_URL
    ) {
      console.error(
        "SUPABASE_URL is missing"
      );

      return json(
        {
          success: false,
          error:
            "SUPABASE_URL is missing"
        },
        500
      );
    }

    if (
      !env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      console.error(
        "SUPABASE_SERVICE_ROLE_KEY is missing"
      );

      return json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is missing"
        },
        500
      );
    }

    // ----------------------------------------------------------
    // READ RAW BODY
    // ----------------------------------------------------------

    let rawBody;

    try {
      rawBody =
        await request.text();
    } catch (error) {
      console.error(
        "BODY READ ERROR:",
        error
      );

      return json(
        {
          success: false,
          error:
            "Could not read request body"
        },
        400
      );
    }

    if (!rawBody) {
      return json(
        {
          success: false,
          error:
            "Empty request body"
        },
        400
      );
    }

    // ----------------------------------------------------------
    // PARSE JSON
    // ----------------------------------------------------------

    let body;

    try {
      body =
        JSON.parse(rawBody);
    } catch (error) {
      console.error(
        "INVALID JSON:",
        error.message
      );

      return json(
        {
          success: false,
          error:
            "Invalid JSON"
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
      body.apiKey ||
      null;

    if (!apiKey) {
      return json(
        {
          success: false,
          error:
            "Missing API key"
        },
        401
      );
    }

    // ----------------------------------------------------------
    // SUPABASE URL
    // ----------------------------------------------------------

    const supabaseUrl =
      env.SUPABASE_URL.replace(
        /\/+$/,
        ""
      );

    const supabaseEndpoint =
      `${supabaseUrl}/rest/v1/user_activity`;

    // ----------------------------------------------------------
    // INSERT DATA
    //
    // event = EXACT JSON OBJECT RECEIVED
    // ----------------------------------------------------------

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

      event:
        body
    };

    // ----------------------------------------------------------
    // INSERT INTO SUPABASE
    // ----------------------------------------------------------

    let supabaseResponse;

    try {
      supabaseResponse =
        await fetch(
          supabaseEndpoint,
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

            body:
              JSON.stringify(
                insertData
              )
          }
        );
    } catch (error) {
      console.error(
        "SUPABASE CONNECTION ERROR:",
        error
      );

      return json(
        {
          success: false,
          error:
            "Could not connect to Supabase",
          details:
            error.message
        },
        500
      );
    }

    // ----------------------------------------------------------
    // SUPABASE RESPONSE
    // ----------------------------------------------------------

    if (
      !supabaseResponse.ok
    ) {
      const errorText =
        await supabaseResponse.text();

      console.error(
        "SUPABASE INSERT FAILED:",
        supabaseResponse.status,
        errorText
      );

      return json(
        {
          success: false,

          error:
            "Database insert failed",

          status:
            supabaseResponse.status,

          details:
            errorText
        },
        500
      );
    }

    // ----------------------------------------------------------
    // SUCCESS
    // ----------------------------------------------------------

    return json(
      {
        success: true,
        saved: true
      },
      200
    );
  }
};

// ============================================================
// CORS
// ============================================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type, x-api-key"
  };
}

// ============================================================
// JSON RESPONSE
// ============================================================

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
