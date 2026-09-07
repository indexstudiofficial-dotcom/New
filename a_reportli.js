/**
 * ============================================================
 * REPORTLI AI
 * SINGLE CLOUDFLARE WORKER
 * ============================================================
 *
 * GET  /              -> health check
 * GET  /reportli.js   -> Reportli SDK
 * POST /              -> receives SDK events
 * OPTIONS             -> CORS
 *
 * Required Cloudflare Worker secrets:
 *
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 *
 * IMPORTANT:
 * Never put the Supabase service-role key inside REPORTLI_JS.
 * The service-role key exists only on the Cloudflare Worker.
 */

const REPORTLI_JS = String.raw`
/**
 * ============================================================
 * REPORTLI AI - BROWSER SDK
 * ============================================================
 */

(function () {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================

  var WORKER_URL =
    "https://reportliai-sbs.reportliaihq.workers.dev";

  // ============================================================
  // FIND SCRIPT
  // ============================================================

  function findOwnScriptTag() {
    try {
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
        var script =
          scripts[i];

        var src =
          script.getAttribute("src") || "";

        if (
          (
            src.indexOf("reportli.js") !== -1 ||
            src.indexOf("a_reportli.js") !== -1
          ) &&
          script.getAttribute("data-key")
        ) {
          return script;
        }
      }
    } catch (e) {}

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
      "Reportli: data-key is missing."
    );

    return;
  }

  // ============================================================
  // SESSION
  // ============================================================

  var sessionId =
    "sess_" +
    Math.random()
      .toString(36)
      .slice(2) +
    "_" +
    Date.now().toString(36);

  var sessionStartedAt =
    new Date().toISOString();

  var initialized =
    false;

  var sessionEnded =
    false;

  var pageViews =
    0;

  var clickCount =
    0;

  // ============================================================
  // USER
  // ============================================================

  var user = {
    email: "anonymous",
    userId: "anonymous"
  };

  function detectUser() {
    var detected = {
      email: "anonymous",
      userId: "anonymous"
    };

    try {
      if (
        window.reportliUser &&
        typeof window.reportliUser === "object"
      ) {
        if (
          window.reportliUser.email
        ) {
          detected.email =
            String(
              window.reportliUser.email
            );
        }

        if (
          window.reportliUser.userId
        ) {
          detected.userId =
            String(
              window.reportliUser.userId
            );
        }
      }
    } catch (e) {}

    return detected;
  }

  function refreshUser() {
    try {
      var detected =
        detectUser();

      if (
        detected.email &&
        detected.email !== "anonymous"
      ) {
        user.email =
          detected.email;
      }

      if (
        detected.userId &&
        detected.userId !== "anonymous"
      ) {
        user.userId =
          detected.userId;
      }
    } catch (e) {}
  }

  // ============================================================
  // HELPERS
  // ============================================================

  function nowISO() {
    return new Date().toISOString();
  }

  function getPage() {
    try {
      return (
        window.location.pathname +
        window.location.search +
        window.location.hash
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

  function getBaseFields() {
    refreshUser();

    return {
      api_key:
        API_KEY,

      domain:
        getDomain(),

      session_id:
        sessionId,

      email:
        user.email,

      user_id:
        user.userId,

      page:
        getPage(),

      browser:
        getBrowser(),

      time:
        nowISO()
    };
  }

  // ============================================================
  // SEND
  //
  // Every event is sent immediately.
  // No queue.
  // No 2-second delay.
  // No batching for new SDK events.
  // ============================================================

  function send(
    payload,
    useBeacon
  ) {
    try {
      var body =
        JSON.stringify(payload);

      // --------------------------------------------------------
      // PAGE UNLOAD
      // --------------------------------------------------------

      if (
        useBeacon &&
        navigator.sendBeacon
      ) {
        try {
          var blob =
            new Blob(
              [body],
              {
                type:
                  "application/json"
              }
            );

          var sent =
            navigator.sendBeacon(
              WORKER_URL,
              blob
            );

          if (sent) {
            return;
          }
        } catch (e) {}
      }

      // --------------------------------------------------------
      // NORMAL REQUEST
      // --------------------------------------------------------

      fetch(
        WORKER_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-api-key":
              API_KEY
          },

          body:
            body,

          keepalive:
            true,

          credentials:
            "omit"
        }
      ).catch(
        function () {}
      );

    } catch (e) {}
  }

  // ============================================================
  // CLICK LABEL
  // ============================================================

  function getClickableElement(
    element
  ) {
    try {
      if (
        !element ||
        element.nodeType !== 1
      ) {
        return null;
      }

      var clickable =
        element.closest(
          "button, a, [role='button'], input[type='button'], input[type='submit'], [onclick]"
        );

      return (
        clickable ||
        element
      );
    } catch (e) {
      return element;
    }
  }

  function getElementLabel(
    element
  ) {
    try {
      if (!element) {
        return "(no label)";
      }

      var label = "";

      // Text
      label =
        element.innerText ||
        element.textContent ||
        "";

      label =
        String(label)
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      // aria-label
      if (!label) {
        label =
          element.getAttribute(
            "aria-label"
          ) || "";
      }

      // title
      if (!label) {
        label =
          element.getAttribute(
            "title"
          ) || "";
      }

      // value
      if (!label) {
        label =
          element.getAttribute(
            "value"
          ) || "";
      }

      // placeholder
      if (!label) {
        label =
          element.getAttribute(
            "placeholder"
          ) || "";
      }

      // name
      if (!label) {
        label =
          element.getAttribute(
            "name"
          ) || "";
      }

      // id
      if (!label) {
        label =
          element.getAttribute(
            "id"
          ) || "";
      }

      label =
        String(label)
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      return (
        label
          ? label.slice(0, 200)
          : "(no label)"
      );

    } catch (e) {
      return "(no label)";
    }
  }

  // ============================================================
  // CLICK TRACKING
  // ============================================================

  function trackClick(
    originalElement
  ) {
    try {
      var element =
        getClickableElement(
          originalElement
        );

      clickCount++;

      var tag =
        element &&
        element.tagName
          ? element.tagName.toLowerCase()
          : "unknown";

      var label =
        getElementLabel(
          element
        );

      send(
        Object.assign(
          getBaseFields(),
          {
            type:
              "ACTIVITY",

            event:
              "click",

            element:
              tag,

            label:
              label
          }
        )
      );

    } catch (e) {}
  }

  document.addEventListener(
    "click",
    function (event) {
      try {
        trackClick(
          event.target
        );
      } catch (e) {}
    },
    true
  );

  // ============================================================
  // PAGE VIEW
  // ============================================================

  function trackPageView() {
    try {
      pageViews++;

      send(
        Object.assign(
          getBaseFields(),
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

  // ============================================================
  // SPA NAVIGATION
  // ============================================================

  var currentPath =
    getPage();

  function handleUrlChange() {
    try {
      var newPath =
        getPage();

      if (
        newPath === currentPath
      ) {
        return;
      }

      var previousPath =
        currentPath;

      currentPath =
        newPath;

      send(
        Object.assign(
          getBaseFields(),
          {
            type:
              "ACTIVITY",

            event:
              "navigation",

            from:
              previousPath,

            to:
              newPath
          }
        )
      );

      trackPageView();

    } catch (e) {}
  }

  try {
    var originalPushState =
      history.pushState;

    history.pushState =
      function () {
        var result =
          originalPushState.apply(
            history,
            arguments
          );

        handleUrlChange();

        return result;
      };

    var originalReplaceState =
      history.replaceState;

    history.replaceState =
      function () {
        var result =
          originalReplaceState.apply(
            history,
            arguments
          );

        handleUrlChange();

        return result;
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

  // ============================================================
  // ERROR LOCATION
  // ============================================================

  function cleanFileName(
    value
  ) {
    try {
      if (!value) {
        return null;
      }

      var fileName =
        String(value);

      // URL
      if (
        fileName.indexOf(
          "http://"
        ) === 0 ||
        fileName.indexOf(
          "https://"
        ) === 0
      ) {
        try {
          var parsed =
            new URL(
              fileName
            );

          var pathname =
            parsed.pathname;

          var parts =
            pathname
              .split("/")
              .filter(
                function (part) {
                  return part;
                }
              );

          if (
            parts.length
          ) {
            return parts[
              parts.length - 1
            ];
          }
        } catch (e) {}
      }

      return fileName;

    } catch (e) {
      return null;
    }
  }

  function extractErrorLocation(
    error
  ) {
    var fileName =
      null;

    var lineNumber =
      null;

    var columnNumber =
      null;

    try {
      if (
        error &&
        error.filename
      ) {
        fileName =
          error.filename;
      }

      if (
        error &&
        error.lineno != null
      ) {
        lineNumber =
          Number(
            error.lineno
          );
      }

      if (
        error &&
        error.colno != null
      ) {
        columnNumber =
          Number(
            error.colno
          );
      }

      // --------------------------------------------------------
      // STACK PARSING
      // --------------------------------------------------------

      if (
        error &&
        error.stack
      ) {
        var stack =
          String(
            error.stack
          );

        var match =
          stack.match(
            /(?:at\s+.*?\s+\()?((?:https?:\/\/|webpack:\/\/|file:\/\/\/|\/)[^\s\):]+):(\d+)(?::(\d+))?\)?/
          );

        if (match) {
          if (!fileName) {
            fileName =
              match[1];
          }

          if (
            lineNumber == null
          ) {
            lineNumber =
              Number(
                match[2]
              );
          }

          if (
            columnNumber == null &&
            match[3]
          ) {
            columnNumber =
              Number(
                match[3]
              );
          }
        }
      }

    } catch (e) {}

    return {
      file_name:
        cleanFileName(
          fileName
        ),

      line_number:
        lineNumber,

      column_number:
        columnNumber
    };
  }

  // ============================================================
  // ERROR TRACKING
  // ============================================================

  function trackError(
    error,
    context
  ) {
    try {
      var message =
        "Unknown error";

      if (
        error &&
        error.message != null
      ) {
        message =
          String(
            error.message
          );
      } else if (
        error != null
      ) {
        message =
          String(error);
      }

      var stack =
        "";

      if (
        error &&
        error.stack
      ) {
        stack =
          String(
            error.stack
          );
      }

      var location =
        extractErrorLocation(
          error
        );

      send(
        Object.assign(
          getBaseFields(),
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

            column_number:
              location.column_number,

            context:
              context ||
              "auto"
          }
        )
      );

    } catch (e) {}
  }

  // ============================================================
  // WINDOW ERROR
  // ============================================================

  window.addEventListener(
    "error",
    function (event) {
      try {
        if (
          event.error
        ) {
          if (
            !event.error.filename &&
            event.filename
          ) {
            try {
              event.error.filename =
                event.filename;
            } catch (e) {}
          }

          if (
            event.error.lineno == null &&
            event.lineno != null
          ) {
            try {
              event.error.lineno =
                event.lineno;
            } catch (e) {}
          }

          if (
            event.error.colno == null &&
            event.colno != null
          ) {
            try {
              event.error.colno =
                event.colno;
            } catch (e) {}
          }

          trackError(
            event.error,
            "window"
          );

        } else {
          trackError(
            {
              message:
                event.message ||
                "Unknown window error",

              stack:
                event.filename
                  ? (
                      "at " +
                      event.filename +
                      ":" +
                      event.lineno +
                      ":" +
                      event.colno
                    )
                  : "",

              filename:
                event.filename ||
                null,

              lineno:
                event.lineno ||
                null,

              colno:
                event.colno ||
                null
            },
            "window"
          );
        }

      } catch (e) {}
    },
    true
  );

  // ============================================================
  // UNHANDLED PROMISE REJECTION
  // ============================================================

  window.addEventListener(
    "unhandledrejection",
    function (event) {
      try {
        var reason =
          event.reason;

        if (
          reason instanceof Error
        ) {
          trackError(
            reason,
            "unhandledrejection"
          );
        } else {
          trackError(
            {
              message:
                reason != null
                  ? String(reason)
                  : "Unhandled Promise Rejection",

              stack:
                ""
            },
            "unhandledrejection"
          );
        }

      } catch (e) {}
    }
  );

  // ============================================================
  // FETCH MONITORING
  // ============================================================

  try {
    var originalFetch =
      window.fetch;

    if (
      typeof originalFetch ===
      "function"
    ) {
      window.fetch =
        function () {
          var args =
            arguments;

          var input =
            args[0];

          var init =
            args[1] ||
            {};

          var url =
            "";

          var method =
            String(
              init.method ||
              "GET"
            ).toUpperCase();

          try {
            if (
              typeof input ===
              "string"
            ) {
              url =
                input;
            } else if (
              input &&
              input.url
            ) {
              url =
                input.url;
            }
          } catch (e) {}

          // Never monitor Reportli requests.
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
                      getBaseFields(),
                      {
                        type:
                          "ERROR",

                        message:
                          "Fetch " +
                          response.status +
                          ": " +
                          method +
                          " " +
                          url,

                        stack:
                          method +
                          " " +
                          url +
                          " -> " +
                          response.status,

                        file_name:
                          null,

                        line_number:
                          null,

                        column_number:
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
              function (error) {

                trackError(
                  {
                    message:
                      "Fetch failed: " +
                      method +
                      " " +
                      url +
                      " - " +
                      (
                        error &&
                        error.message
                          ? error.message
                          : "Network error"
                      ),

                    stack:
                      error &&
                      error.stack
                        ? error.stack
                        : ""
                  },
                  "fetch"
                );

                throw error;
              }
            );
        };
    }

  } catch (e) {}

  // ============================================================
  // XHR MONITORING
  // ============================================================

  try {
    var OriginalXHR =
      XMLHttpRequest;

    var originalOpen =
      OriginalXHR.prototype.open;

    var originalSend =
      OriginalXHR.prototype.send;

    OriginalXHR.prototype.open =
      function (
        method,
        url
      ) {
        try {
          this._reportliMethod =
            String(
              method ||
              "GET"
            ).toUpperCase();

          this._reportliUrl =
            String(
              url ||
              ""
            );
        } catch (e) {}

        return originalOpen.apply(
          this,
          arguments
        );
      };

    OriginalXHR.prototype.send =
      function () {
        var xhr =
          this;

        var url =
          xhr._reportliUrl ||
          "";

        var method =
          xhr._reportliMethod ||
          "GET";

        var shouldTrack =
          url.indexOf(
            WORKER_URL
          ) !== 0;

        if (
          shouldTrack
        ) {
          try {
            xhr.addEventListener(
              "loadend",
              function () {
                try {
                  if (
                    xhr.status >=
                      400 ||
                    xhr.status === 0
                  ) {
                    send(
                      Object.assign(
                        getBaseFields(),
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

                          column_number:
                            null,

                          context:
                            "xhr"
                        }
                      )
                    );
                  }
                } catch (e) {}
              }
            );
          } catch (e) {}
        }

        return originalSend.apply(
          this,
          arguments
        );
      };

  } catch (e) {}

  // ============================================================
  // SESSION END
  // ============================================================

  function sendSessionEnd() {
    try {
      if (
        sessionEnded
      ) {
        return;
      }

      sessionEnded =
        true;

      var endedAt =
        nowISO();

      var startTime =
        new Date(
          sessionStartedAt
        ).getTime();

      var endTime =
        new Date(
          endedAt
        ).getTime();

      var duration =
        Math.max(
          0,
          Math.round(
            (
              endTime -
              startTime
            ) / 1000
          )
        );

      send(
        Object.assign(
          getBaseFields(),
          {
            type:
              "SESSION_END",

            started_at:
              sessionStartedAt,

            ended_at:
              endedAt,

            duration_seconds:
              duration,

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

  // ============================================================
  // INITIAL SESSION
  // ============================================================

  function init() {
    if (
      initialized
    ) {
      return;
    }

    initialized =
      true;

    // ----------------------------------------------------------
    // SESSION STARTED
    // ----------------------------------------------------------

    send(
      Object.assign(
        getBaseFields(),
        {
          type:
            "SESSION_STARTED",

          success:
            true
        }
      )
    );

    // ----------------------------------------------------------
    // INITIAL PAGE VIEW
    // ----------------------------------------------------------

    trackPageView();
  }

  // ============================================================
  // INITIALIZE
  // ============================================================

  init();

  // ============================================================
  // PUBLIC API
  // ============================================================

  window.Reportli = {

    // ----------------------------------------------------------
    // IDENTIFY
    // ----------------------------------------------------------

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
              getBaseFields(),
              {
                type:
                  "IDENTIFY"
              }
            )
          );

        } catch (e) {}
      },

    // ----------------------------------------------------------
    // TRACK CUSTOM EVENT
    // ----------------------------------------------------------

    track:
      function (
        eventName,
        properties
      ) {
        try {
          if (!eventName) {
            return;
          }

          send(
            Object.assign(
              getBaseFields(),
              {
                type:
                  "ACTIVITY",

                event:
                  String(
                    eventName
                  ),

                properties:
                  properties &&
                  typeof properties ===
                    "object"
                    ? properties
                    : {}
              }
            )
          );

        } catch (e) {}
      },

    // ----------------------------------------------------------
    // CAPTURE ERROR
    // ----------------------------------------------------------

    capture:
      function (error) {
        trackError(
          error,
          "manual"
        );
      },

    // ----------------------------------------------------------
    // GET SESSION ID
    // ----------------------------------------------------------

    getSessionId:
      function () {
        return sessionId;
      },

    // ----------------------------------------------------------
    // GET USER
    // ----------------------------------------------------------

    getUser:
      function () {
        refreshUser();

        return {
          email:
            user.email,

          userId:
            user.userId
        };
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

    // ========================================================
    // CORS
    // ========================================================

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

    // ========================================================
    // GET /
    // ========================================================

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/"
    ) {
      return json(
        {
          success:
            true,

          service:
            "Reportli AI",

          status:
            "online",

          sdk:
            "/reportli.js",

          database:
            "Supabase"
        }
      );
    }

    // ========================================================
    // GET /reportli.js
    // ========================================================

    if (
      request.method ===
        "GET" &&
      (
        url.pathname ===
          "/reportli.js" ||
        url.pathname ===
          "/a_reportli.js"
      )
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
              "no-cache, no-store, must-revalidate",

            ...corsHeaders()
          }
        }
      );
    }

    // ========================================================
    // POST EVENTS
    // ========================================================

    if (
      request.method ===
      "POST"
    ) {
      return await receiveEvent(
        request,
        env
      );
    }

    // ========================================================
    // OTHER METHODS
    // ========================================================

    return json(
      {
        success:
          false,

        error:
          "Method not allowed"
      },
      405
    );
  }
};


// ============================================================
// RECEIVE EVENT
// ============================================================

async function receiveEvent(
  request,
  env
) {
  // ==========================================================
  // CHECK ENVIRONMENT VARIABLES
  // ==========================================================

  if (
    !env.SUPABASE_URL
  ) {
    console.error(
      "REPORTLI ERROR: SUPABASE_URL is missing"
    );

    return json(
      {
        success:
          false,

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
      "REPORTLI ERROR: SUPABASE_SERVICE_ROLE_KEY is missing"
    );

    return json(
      {
        success:
          false,

        error:
          "SUPABASE_SERVICE_ROLE_KEY is missing"
      },
      500
    );
  }

  // ==========================================================
  // READ BODY
  // ==========================================================

  let rawBody;

  try {
    rawBody =
      await request.text();
  } catch (error) {
    console.error(
      "Could not read body:",
      error
    );

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

  if (
    !rawBody
  ) {
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

  // ==========================================================
  // PARSE JSON
  // ==========================================================

  let body;

  try {
    body =
      JSON.parse(
        rawBody
      );
  } catch (error) {
    console.error(
      "Invalid JSON:",
      rawBody
    );

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

  console.log(
    "REPORTLI EVENT:",
    JSON.stringify(
      body
    )
  );

  // ==========================================================
  // API KEY
  // ==========================================================

  const headerApiKey =
    request.headers.get(
      "x-api-key"
    );

  const bodyApiKey =
    body.api_key ||
    body.apiKey ||
    null;

  const apiKey =
    headerApiKey ||
    bodyApiKey;

  if (
    !apiKey
  ) {
    console.error(
      "Missing API key"
    );

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

  // ==========================================================
  // BATCH COMPATIBILITY
  // ==========================================================

  if (
    body.type ===
      "BATCH" &&
    Array.isArray(
      body.events
    )
  ) {
    console.log(
      "Legacy batch received:",
      body.events.length
    );

    const results =
      [];

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

    const failed =
      results.filter(
        function (result) {
          return !result.success;
        }
      );

    return json(
      {
        success:
          failed.length ===
          0,

        processed:
          results.length,

        failed:
          failed.length,

        results:
          results
      },
      failed.length
        ? 500
        : 200
    );
  }

  // ==========================================================
  // SINGLE EVENT
  // ==========================================================

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

  return json(
    {
      success:
        true,

      saved:
        true,

      type:
        body.type ||
        "UNKNOWN"
    }
  );
}


// ============================================================
// PROCESS EVENT
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
        "Invalid event object"
    };
  }

  const apiKey =
    event.api_key ||
    event.apiKey ||
    requestApiKey;

  const sessionId =
    event.session_id ||
    event.sessionId ||
    null;

  const type =
    String(
      event.type ||
      ""
    ).toUpperCase();

  console.log(
    "Processing:",
    type,
    "session:",
    sessionId
  );

  // ==========================================================
  // ERROR
  // ==========================================================

  if (
    type ===
    "ERROR"
  ) {
    return await saveError(
      event,
      apiKey,
      sessionId,
      env
    );
  }

  // ==========================================================
  // EVERYTHING ELSE = ACTIVITY
  // ==========================================================

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
  const row = {
    api_key:
      apiKey,

    session_id:
      sessionId,

    event:
      event
  };

  console.log(
    "SUPABASE user_activity INSERT:",
    JSON.stringify(
      row
    )
  );

  let response;

  try {
    response =
      await fetch(
        buildSupabaseUrl(
          env.SUPABASE_URL,
          "user_activity"
        ),
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "apikey":
              env.SUPABASE_SERVICE_ROLE_KEY,

            "Authorization":
              "Bearer " +
              env.SUPABASE_SERVICE_ROLE_KEY,

            "Prefer":
              "return=minimal"
          },

          body:
            JSON.stringify(
              row
            )
        }
      );
  } catch (error) {
    console.error(
      "SUPABASE NETWORK ERROR:",
      error
    );

    return {
      success:
        false,

      error:
        "Supabase request failed",

      details:
        error &&
        error.message
          ? error.message
          : String(error)
    };
  }

  const responseText =
    await response.text();

  if (
    !response.ok
  ) {
    console.error(
      "SUPABASE user_activity FAILED",
      response.status,
      responseText
    );

    return {
      success:
        false,

      error:
        "user_activity insert failed",

      details:
        responseText
    };
  }

  console.log(
    "SUPABASE user_activity SUCCESS"
  );

  return {
    success:
      true,

    table:
      "user_activity"
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
      : "Unknown error";

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

  const columnNumber =
    event.column_number !=
    null
      ? Number(
          event.column_number
        )
      : null;

  const errorTime =
    event.time ||
    new Date().toISOString();

  // ==========================================================
  // AI ANALYSIS JSON
  // ==========================================================

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

    column_number:
      columnNumber,

    stack_trace:
      stackTrace,

    context:
      event.context ||
      "auto"
  };

  const row = {
    ai_analysis:
      aiAnalysis
  };

  console.log(
    "SUPABASE errors INSERT:",
    JSON.stringify(
      row
    )
  );

  let response;

  try {
    response =
      await fetch(
        buildSupabaseUrl(
          env.SUPABASE_URL,
          "errors"
        ),
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "apikey":
              env.SUPABASE_SERVICE_ROLE_KEY,

            "Authorization":
              "Bearer " +
              env.SUPABASE_SERVICE_ROLE_KEY,

            "Prefer":
              "return=minimal"
          },

          body:
            JSON.stringify(
              row
            )
        }
      );
  } catch (error) {
    console.error(
      "SUPABASE ERROR NETWORK FAILURE:",
      error
    );

    return {
      success:
        false,

      error:
        "Supabase error request failed",

      details:
        error &&
        error.message
          ? error.message
          : String(error)
    };
  }

  const responseText =
    await response.text();

  if (
    !response.ok
  ) {
    console.error(
      "SUPABASE errors FAILED:",
      response.status,
      responseText
    );

    return {
      success:
        false,

      error:
        "errors insert failed",

      details:
        responseText
    };
  }

  console.log(
    "SUPABASE errors SUCCESS"
  );

  return {
    success:
      true,

    table:
      "errors"
  };
}


// ============================================================
// BUILD SUPABASE URL
// ============================================================

function buildSupabaseUrl(
  baseUrl,
  table
) {
  return (
    String(
      baseUrl
    ).replace(
      /\/+$/,
      ""
    ) +
    "/rest/v1/" +
    table
  );
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
      "Content-Type, x-api-key",

    "Access-Control-Max-Age":
      "86400"
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
          "application/json; charset=UTF-8",

        ...corsHeaders()
      }
    }
  );
}
