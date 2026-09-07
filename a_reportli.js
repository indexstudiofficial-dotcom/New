/**
 * Reportli AI - Single Cloudflare Worker
 *
 * GET  /reportli.js
 *      -> serves the Reportli tracking snippet
 *
 * GET  /
 *      -> health check
 *
 * POST /
 *      -> receives Reportli events
 *      -> saves activity to user_activity
 *      -> saves errors to errors.ai_analysis
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

  // ------------------------------------------------------------
  // CONFIGURATION
  // ------------------------------------------------------------

  var WORKER_URL =
    "https://reportliai-sbs.reportliaihq.workers.dev";

  // ------------------------------------------------------------
  // FIND REPORTLI SCRIPT
  // ------------------------------------------------------------

  function findOwnScriptTag() {
    if (
      document.currentScript &&
      document.currentScript.getAttribute("data-key")
    ) {
      return document.currentScript;
    }

    var scripts =
      document.getElementsByTagName("script");

    for (
      var i = scripts.length - 1;
      i >= 0;
      i--
    ) {
      var s = scripts[i];

      var src =
        s.getAttribute("src") || "";

      if (
        src.indexOf("reportli.js") !== -1 &&
        s.getAttribute("data-key")
      ) {
        return s;
      }
    }

    return null;
  }

  var scriptTag =
    findOwnScriptTag();

  var API_KEY =
    scriptTag
      ? scriptTag.getAttribute("data-key")
      : null;

  if (!API_KEY) {
    console.warn(
      "Reportli: missing data-key attribute on script tag"
    );

    return;
  }

  // ------------------------------------------------------------
  // SESSION
  // ------------------------------------------------------------

  var sessionId =
    "sess_" +
    Math.random()
      .toString(36)
      .slice(2) +
    Date.now().toString(36);

  var sessionStartedAt =
    new Date().toISOString();

  var pageViews = 0;
  var clickCount = 0;

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
        if (
          window.reportliUser.email
        ) {
          email =
            window.reportliUser.email;
        }

        if (
          window.reportliUser.userId
        ) {
          userId =
            window.reportliUser.userId;
        }
      }
    } catch (e) {}

    return {
      email: email,
      userId: userId
    };
  }

  var user =
    detectUser();

  function refreshUser() {
    var updated =
      detectUser();

    if (
      updated.email !== "anonymous"
    ) {
      user.email =
        updated.email;
    }

    if (
      updated.userId !== "anonymous"
    ) {
      user.userId =
        updated.userId;
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
  // SEND EVENT IMMEDIATELY
  //
  // There is NO queue.
  // There is NO 2-second delay.
  // There is NO BATCH for new activity events.
  // ------------------------------------------------------------

  function send(
    payload,
    useBeacon
  ) {
    try {
      var body =
        JSON.stringify(payload);

      if (
        useBeacon &&
        navigator.sendBeacon
      ) {
        var blob =
          new Blob(
            [body],
            {
              type:
                "application/json"
            }
          );

        navigator.sendBeacon(
          WORKER_URL,
          blob
        );

        return;
      }

      fetch(
        WORKER_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-api-key":
              API_KEY
          },

          body: body,

          keepalive: true
        }
      ).catch(
        function () {}
      );
    } catch (e) {}
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
        el.getAttribute(
          "title"
        ) ||
        ""
      )
        .trim()
        .slice(0, 120);

      send(
        Object.assign(
          baseFields(),
          {
            type:
              "ACTIVITY",

            event:
              "click",

            element:
              tag,

            label:
              label ||
              "(no label)"
          }
        )
      );
    } catch (e) {}
  }

  document.addEventListener(
    "click",
    function (event) {
      var el =
        event.target;

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

      send(
        Object.assign(
          baseFields(),
          {
            type:
              "ACTIVITY",

            event:
              "page_view"
          }
        )
      );
    } catch (e) {}
  }

  var currentPath =
    getPage();

  // ------------------------------------------------------------
  // SPA NAVIGATION
  // ------------------------------------------------------------

  function handleUrlChange() {
    var newPath =
      getPage();

    if (
      newPath !== currentPath
    ) {
      send(
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
  // EXTRACT ERROR LOCATION
  // ------------------------------------------------------------

  function extractErrorLocation(
    err
  ) {
    var fileName =
      null;

    var lineNumber =
      null;

    try {
      if (
        err &&
        err.filename
      ) {
        fileName =
          String(
            err.filename
          );
      }

      if (
        err &&
        err.lineno != null
      ) {
        lineNumber =
          Number(
            err.lineno
          );
      }

      if (
        fileName &&
        fileName.indexOf(
          "http"
        ) === 0
      ) {
        try {
          var parsed =
            new URL(
              fileName
            );

          var parts =
            parsed.pathname
              .split("/")
              .filter(
                function (part) {
                  return part;
                }
              );

          if (
            parts.length > 0
          ) {
            fileName =
              parts[
                parts.length - 1
              ];
          }
        } catch (e) {}
      }

      if (
        !fileName &&
        err &&
        err.stack
      ) {
        var stack =
          String(
            err.stack
          );

        var match =
          stack.match(
            /(?:at\s+.*?\s+\()?((?:https?:\\/\\/|webpack:\\/\\/|file:\\/\\/|\\/)[^\\s\\):]+):(\\d+)(?::\\d+)?\\)?/
          );

        if (match) {
          fileName =
            match[1];

          lineNumber =
            Number(
              match[2]
            );

          if (
            fileName.indexOf(
              "http"
            ) === 0
          ) {
            try {
              var parsedStack =
                new URL(
                  fileName
                );

              var stackParts =
                parsedStack.pathname
                  .split("/")
                  .filter(
                    function (part) {
                      return part;
                    }
                  );

              if (
                stackParts.length > 0
              ) {
                fileName =
                  stackParts[
                    stackParts.length - 1
                  ];
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}

    return {
      file_name:
        fileName,

      line_number:
        lineNumber
    };
  }

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
        err.message != null
          ? String(
              err.message
            )
          : String(err);

      var stack =
        err &&
        err.stack
          ? String(
              err.stack
            )
          : "";

      var location =
        extractErrorLocation(
          err
        );

      send(
        Object.assign(
          baseFields(),
          {
            type:
              "ERROR",

            message:
              message,

            stack:
              stack,

            file_name:
              location.file_name,

            line_number:
              location.line_number,

            context:
              context ||
              "auto"
          }
        )
      );
    } catch (e) {}
  }

  // ------------------------------------------------------------
  // WINDOW ERRORS
  // ------------------------------------------------------------

  window.addEventListener(
    "error",
    function (event) {
      try {
        if (
          event.error
        ) {
          var error =
            event.error;

          if (
            !error.filename &&
            event.filename
          ) {
            error.filename =
              event.filename;
          }

          if (
            error.lineno == null &&
            event.lineno != null
          ) {
            error.lineno =
              event.lineno;
          }

          trackError(
            error,
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
                event.filename
                  ? "at " +
                    event.filename +
                    ":" +
                    event.lineno +
                    ":" +
                    event.colno
                  : "",

              filename:
                event.filename ||
                null,

              lineno:
                event.lineno ||
                null
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

              stack:
                ""
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

    if (
      originalFetch
    ) {
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
              function (
                response
              ) {
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

                        file_name:
                          null,

                        line_number:
                          null,

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
                      err.stack,

                    filename:
                      null,

                    lineno:
                      null
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
        .prototype
        .open;

    var OrigSend =
      XMLHttpRequest
        .prototype
        .send;

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
        var xhr =
          this;

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
                xhr.status ===
                  0
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

                      file_name:
                        null,

                      line_number:
                        null,

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
        Math.max(
          0,
          Math.round(
            (endMs - startMs) /
              1000
          )
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
  // HANDSHAKE
  // ------------------------------------------------------------

  function sendHandshake() {
    send({
      type:
        "SUCCESS",

      api_key:
        API_KEY,

      domain:
        getDomain(),

      time:
        nowISO()
    });
  }

  // ------------------------------------------------------------
  // SESSION START
  // ------------------------------------------------------------

  function init() {
    if (
      initialized
    ) {
      return;
    }

    initialized =
      true;

    // Connection handshake.
    sendHandshake();

    // New session event.
    send(
      Object.assign(
        baseFields(),
        {
          type:
            "SESSION_STARTED",

          success:
            true
        }
      )
    );

    // Initial page view.
    trackPageView();
  }

  init();

  // ------------------------------------------------------------
  // MANUAL API
  // ------------------------------------------------------------

  window.Reportli = {

    identify:
      function (
        identity
      ) {
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

          // Send custom activity immediately.
          send(
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
      function (
        error
      ) {
        trackError(
          error,
          "manual"
        );
      }
  };
})();
`;

// ============================================================
// CLOUDFLARE WORKER
// ============================================================

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

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
          status:
            204,

          headers:
            corsHeaders()
        }
      );
    }

    // ----------------------------------------------------------
    // GET /reportli.js
    // ----------------------------------------------------------

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/reportli.js"
    ) {
      return new Response(
        REPORTLI_JS,
        {
          status:
            200,

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
      request.method ===
        "GET" &&
      url.pathname === "/"
    ) {
      return json({
        success:
          true,

        service:
          "Reportli AI",

        message:
          "Reportli Worker is running",

        snippet:
          "/reportli.js"
      });
    }

    // ----------------------------------------------------------
    // ONLY POST EVENTS
    // ----------------------------------------------------------

    if (
      request.method !==
      "POST"
    ) {
      return json(
        {
          success:
            false,

          error:
            "POST required"
        },
        405
      );
    }

    // ----------------------------------------------------------
    // READ BODY
    // ----------------------------------------------------------

    let rawBody;

    try {
      rawBody =
        await request.text();
    } catch (error) {
      return json(
        {
          success:
            false,

          error:
            "Could not read request body"
        },
        400
      );
    }

    if (!rawBody) {
      return json(
        {
          success:
            false,

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
        JSON.parse(
          rawBody
        );
    } catch (error) {
      return json(
        {
          success:
            false,

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
      body.apiKey;

    if (!apiKey) {
      return json(
        {
          success:
            false,

          error:
            "Missing API key"
        },
        401
      );
    }

    // ----------------------------------------------------------
    // HANDLE BATCH
    //
    // This is retained for compatibility with older versions
    // of the Reportli snippet.
    // New snippet versions do NOT send BATCH.
    // ----------------------------------------------------------

    if (
      body.type ===
        "BATCH" &&
      Array.isArray(
        body.events
      )
    ) {
      const results = [];

      for (
        const event of
          body.events
      ) {
        const result =
          await processEvent(
            event,
            apiKey,
            env
          );

        results.push(
          result
        );
      }

      return json({
        success:
          true,

        saved:
          true,

        processed:
          results.length
      });
    }

    // ----------------------------------------------------------
    // PROCESS SINGLE EVENT
    // ----------------------------------------------------------

    const result =
      await processEvent(
        body,
        apiKey,
        env
      );

    if (
      !result.success
    ) {
      return json(
        {
          success:
            false,

          error:
            result.error,

          details:
            result.details ||
            null
        },
        500
      );
    }

    return json({
      success:
        true,

      saved:
        true,

      type:
        body.type ||
        null
    });
  }
};

// ============================================================
// EVENT PROCESSOR
// ============================================================

async function processEvent(
  event,
  requestApiKey,
  env
) {
  if (
    !event ||
    typeof event !==
      "object"
  ) {
    return {
      success:
        false,

      error:
        "Invalid event"
    };
  }

  const apiKey =
    event.api_key ||
    event.apiKey ||
    requestApiKey;

  const sessionId =
    event.session_id ||
    null;

  // ----------------------------------------------------------
  // ERROR EVENT
  // ----------------------------------------------------------

  if (
    event.type ===
    "ERROR"
  ) {
    return await saveError(
      event,
      apiKey,
      sessionId,
      env
    );
  }

  // ----------------------------------------------------------
  // USER ACTIVITY / SESSION EVENTS
  // ----------------------------------------------------------

  return await saveActivity(
    event,
    apiKey,
    sessionId,
    env
  );
}

// ============================================================
// SAVE ACTIVITY
// ============================================================

async function saveActivity(
  event,
  apiKey,
  sessionId,
  env
) {
  const response =
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_activity`,
      {
        method:
          "POST",

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
          JSON.stringify({
            api_key:
              apiKey,

            session_id:
              sessionId,

            event:
              event
          })
      }
    );

  if (
    !response.ok
  ) {
    const errorText =
      await response.text();

    return {
      success:
        false,

      error:
        "Activity database insert failed",

      details:
        errorText
    };
  }

  return {
    success:
      true
  };
}

// ============================================================
// SAVE ERROR
// ============================================================

async function saveError(
  event,
  apiKey,
  sessionId,
  env
) {
  const errorMessage =
    event.message != null
      ? String(
          event.message
        )
      : "";

  const stackTrace =
    event.stack != null
      ? String(
          event.stack
        )
      : "";

  const fileName =
    event.file_name ||
    null;

  const lineNumber =
    event.line_number !=
    null
      ? Number(
          event.line_number
        )
      : null;

  const errorTime =
    event.time ||
    new Date().toISOString();

  // ----------------------------------------------------------
  // EXACT ERROR DATA
  //
  // Stored inside errors.ai_analysis
  // ----------------------------------------------------------

  const aiAnalysis = {
    error_message:
      errorMessage,

    session_id:
      sessionId,

    api_key:
      apiKey,

    time:
      errorTime,

    file_name:
      fileName,

    line_number:
      lineNumber,

    stack_trace:
      stackTrace
  };

  const response =
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/errors`,
      {
        method:
          "POST",

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
          JSON.stringify({
            ai_analysis:
              aiAnalysis
          })
      }
    );

  if (
    !response.ok
  ) {
    const errorText =
      await response.text();

    return {
      success:
        false,

      error:
        "Error database insert failed",

      details:
        errorText
    };
  }

  return {
    success:
      true
  };
}

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
    JSON.stringify(
      data
    ),
    {
      status:

        status,

      headers: {
        "Content-Type":
          "application/json",

        ...corsHeaders()
      }
    }
  );
  }
