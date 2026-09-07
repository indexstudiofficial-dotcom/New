const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

/*
|--------------------------------------------------------------------------
| CONFIG
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

  /*
  |--------------------------------------------------------------------------
  | FIND API KEY
  |--------------------------------------------------------------------------
  */

  function getApiKey() {
    try {
      var current = document.currentScript;

      if (current) {
        var key = current.getAttribute("data-key");

        if (key) {
          return key;
        }
      }

      var scripts = document.getElementsByTagName("script");

      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].src || "";

        if (
          src.indexOf("reportli.js") !== -1 ||
          src.indexOf("a_reportli.js") !== -1
        ) {
          var scriptKey = scripts[i].getAttribute("data-key");

          if (scriptKey) {
            return scriptKey;
          }
        }
      }

      return null;
    } catch (e) {
      return null;
    }
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

  /*
  |--------------------------------------------------------------------------
  | USER
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
  | BROWSER
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
  | BASE EVENT
  |--------------------------------------------------------------------------
  */

  function baseFields() {
    var user = detectUser();

    return {
      api_key: API_KEY,
      session_id: SESSION_ID,
      domain: window.location.hostname,
      page: window.location.href,
      browser: getBrowser(),
      email: user.email,
      user_id: user.user_id,
      time: new Date().toISOString()
    };
  }

  /*
  |--------------------------------------------------------------------------
  | SEND EVENT
  |--------------------------------------------------------------------------
  */

  function send(payload, useBeacon) {
    if (!API_KEY) {
      return;
    }

    try {
      var body = JSON.stringify(payload);

      /*
      |--------------------------------------------------------------------------
      | BEACON
      |--------------------------------------------------------------------------
      */

      if (
        useBeacon &&
        navigator.sendBeacon
      ) {
        try {
          var blob = new Blob(
            [body],
            {
              type: "application/json"
            }
          );

          var sent = navigator.sendBeacon(
            WORKER_URL,
            blob
          );

          if (sent) {
            return;
          }
        } catch (e) {}
      }

      /*
      |--------------------------------------------------------------------------
      | FETCH
      |--------------------------------------------------------------------------
      */

      fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY
        },
        body: body,
        keepalive: true
      }).catch(function () {
        /*
        Intentionally ignored.
        Never allow Reportli itself to create errors.
        */
      });

    } catch (e) {}
  }

  /*
  |--------------------------------------------------------------------------
  | ACTIVITY
  |--------------------------------------------------------------------------
  */

  function track(eventName, data) {
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
    });
  }

  /*
  |--------------------------------------------------------------------------
  | SESSION START
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
  | CLICK TRACKING
  |--------------------------------------------------------------------------
  */

  function getElementInfo(element) {
    try {
      if (!element) {
        return {};
      }

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

      var id = element.id || null;

      var className = null;

      try {
        className =
          typeof element.className === "string"
            ? element.className
            : null;
      } catch (e) {}

      var href = null;

      try {
        href = element.href || null;
      } catch (e) {}

      var name = null;

      try {
        name = element.getAttribute("name");
      } catch (e) {}

      var ariaLabel = null;

      try {
        ariaLabel = element.getAttribute("aria-label");
      } catch (e) {}

      var value = null;

      try {
        value = element.value || null;
      } catch (e) {}

      return {
        tag: tag,
        text: text,
        id: id,
        class_name: className,
        href: href,
        name: name,
        aria_label: ariaLabel,
        value: value
      };

    } catch (e) {
      return {};
    }
  }

  document.addEventListener(
    "click",
    function (event) {
      try {
        var element = event.target;

        if (!element) {
          return;
        }

        /*
        Find nearest useful clickable element.
        */

        var clickable = null;

        try {
          clickable = element.closest(
            "button,a,input,select,textarea,[role='button'],[onclick]"
          );
        } catch (e) {}

        clickable = clickable || element;

        track("click", {
          element: getElementInfo(clickable),
          x: event.clientX,
          y: event.clientY
        });

      } catch (e) {}
    },
    true
  );

  /*
  |--------------------------------------------------------------------------
  | SPA PAGE NAVIGATION
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

  var originalPushState = history.pushState;

  history.pushState = function () {
    var result = originalPushState.apply(
      history,
      arguments
    );

    setTimeout(trackPageView, 0);

    return result;
  };

  var originalReplaceState = history.replaceState;

  history.replaceState = function () {
    var result = originalReplaceState.apply(
      history,
      arguments
    );

    setTimeout(trackPageView, 0);

    return result;
  };

  window.addEventListener(
    "popstate",
    trackPageView
  );

  window.addEventListener(
    "hashchange",
    trackPageView
  );

  /*
  |--------------------------------------------------------------------------
  | ERROR DEDUPLICATION
  |--------------------------------------------------------------------------
  */

  var recentErrors = {};

  function getErrorSignature(
    message,
    stack,
    fileName,
    lineNumber
  ) {
    return [
      message || "",
      stack || "",
      fileName || "",
      lineNumber || ""
    ].join("|");
  }

  function shouldReportError(
    message,
    stack,
    fileName,
    lineNumber
  ) {
    try {
      var signature = getErrorSignature(
        message,
        stack,
        fileName,
        lineNumber
      );

      var now = Date.now();

      if (
        recentErrors[signature] &&
        now - recentErrors[signature] < 2000
      ) {
        return false;
      }

      recentErrors[signature] = now;

      /*
      Clean old signatures.
      */

      Object.keys(recentErrors).forEach(
        function (key) {
          if (
            now - recentErrors[key] > 10000
          ) {
            delete recentErrors[key];
          }
        }
      );

      return true;

    } catch (e) {
      return true;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ERROR CONVERSION
  |--------------------------------------------------------------------------
  */

  function getErrorMessage(error) {
    try {
      if (!error) {
        return "Unknown error";
      }

      if (typeof error === "string") {
        return error;
      }

      if (error.message) {
        return String(error.message);
      }

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
      if (!error) {
        return null;
      }

      if (error.stack) {
        return String(error.stack);
      }

      return null;

    } catch (e) {
      return null;
    }
  }

  function getErrorLocation(error) {
    try {
      if (!error) {
        return {};
      }

      return {
        file_name:
          error.fileName ||
          error.filename ||
          null,

        line_number:
          error.lineNumber ||
          error.lineno ||
          null,

        column_number:
          error.columnNumber ||
          error.colno ||
          null
      };

    } catch (e) {
      return {};
    }
  }

  /*
  |--------------------------------------------------------------------------
  | CORE ERROR TRACKER
  |--------------------------------------------------------------------------
  */

  function trackError(
    error,
    context,
    extra
  ) {
    try {
      var message = getErrorMessage(error);

      var stack = getErrorStack(error);

      var location = getErrorLocation(error);

      /*
      Extra location information supplied
      by window.onerror.
      */

      if (
        extra &&
        extra.file_name
      ) {
        location.file_name =
          extra.file_name;
      }

      if (
        extra &&
        extra.line_number
      ) {
        location.line_number =
          extra.line_number;
      }

      if (
        extra &&
        extra.column_number
      ) {
        location.column_number =
          extra.column_number;
      }

      /*
      Deduplicate.
      */

      if (
        !shouldReportError(
          message,
          stack,
          location.file_name,
          location.line_number
        )
      ) {
        return;
      }

      var payload = {
        type: "ERROR",

        api_key: API_KEY,

        session_id: SESSION_ID,

        error_message: message,

        timestamp: new Date().toISOString(),

        file_name:
          location.file_name || null,

        line_number:
          location.line_number || null,

        column_number:
          location.column_number || null,

        stack_trace: stack,

        context:
          context || "unknown",

        page: window.location.href,

        domain: window.location.hostname,

        browser: getBrowser()
      };

      /*
      Include extra information when available.
      */

      if (extra) {
        try {
          payload.extra = extra;
        } catch (e) {}
      }

      /*
      IMPORTANT:
      Send immediately.
      */

      send(payload);

    } catch (e) {
      /*
      Never let Reportli create an error.
      */
    }
  }

  /*
  |--------------------------------------------------------------------------
  | window.onerror
  |--------------------------------------------------------------------------
  |
  | This catches normal JavaScript runtime errors.
  |
  */

  window.onerror = function (
    message,
    source,
    lineno,
    colno,
    error
  ) {
    try {
      var actualError =
        error ||
        new Error(
          typeof message === "string"
            ? message
            : "JavaScript error"
        );

      trackError(
        actualError,
        "window.onerror",
        {
          file_name: source || null,
          line_number: lineno || null,
          column_number: colno || null
        }
      );

    } catch (e) {}

    /*
    Return false so the browser
    keeps normal error behavior.
    */

    return false;
  };

  /*
  |--------------------------------------------------------------------------
  | ERROR EVENT
  |--------------------------------------------------------------------------
  */

  window.addEventListener(
    "error",
    function (event) {
      try {
        /*
        Runtime JS error.
        */

        if (event.error) {
          trackError(
            event.error,
            "window.error",
            {
              file_name:
                event.filename || null,

              line_number:
                event.lineno || null,

              column_number:
                event.colno || null
            }
          );

          return;
        }

        /*
        Resource loading error.
        */

        var target = event.target;

        if (
          target &&
          target !== window &&
          target !== document
        ) {
          var resourceUrl = null;

          try {
            resourceUrl =
              target.src ||
              target.href ||
              null;
          } catch (e) {}

          var resourceName =
            target.tagName
              ? target.tagName.toLowerCase()
              : "resource";

          trackError(
            new Error(
              "Failed to load " +
              resourceName +
              (
                resourceUrl
                  ? ": " + resourceUrl
                  : ""
              )
            ),
            "resource.error",
            {
              resource_url: resourceUrl,
              resource_type: resourceName
            }
          );
        }

      } catch (e) {}
    },
    true
  );

  /*
  |--------------------------------------------------------------------------
  | UNHANDLED PROMISE REJECTION
  |--------------------------------------------------------------------------
  */

  window.addEventListener(
    "unhandledrejection",
    function (event) {
      try {
        var reason = event.reason;

        if (reason instanceof Error) {
          trackError(
            reason,
            "unhandledrejection"
          );

          return;
        }

        /*
        Promise rejected with a string,
        object, number, etc.
        */

        var message;

        try {
          if (
            typeof reason === "string"
          ) {
            message = reason;
          } else {
            message =
              JSON.stringify(reason);
          }
        } catch (e) {
          message = String(reason);
        }

        trackError(
          new Error(
            message ||
            "Unhandled promise rejection"
          ),
          "unhandledrejection"
        );

      } catch (e) {}
    },
    true
  );

  /*
  |--------------------------------------------------------------------------
  | FETCH INTERCEPTION
  |--------------------------------------------------------------------------
  */

  if (window.fetch) {
    var originalFetch = window.fetch;

    window.fetch = function () {
      var args = arguments;

      var requestUrl = null;

      try {
        requestUrl =
          typeof args[0] === "string"
            ? args[0]
            : args[0] &&
              args[0].url
              ? args[0].url
              : null;
      } catch (e) {}

      /*
      Don't monitor Reportli itself.
      */

      if (
        requestUrl &&
        requestUrl.indexOf(WORKER_URL) !== -1
      ) {
        return originalFetch.apply(
          this,
          args
        );
      }

      return originalFetch
        .apply(this, args)
        .then(function (response) {
          try {
            if (
              response &&
              response.status >= 400
            ) {
              trackError(
                new Error(
                  "HTTP " +
                  response.status +
                  " request failed: " +
                  requestUrl
                ),
                "fetch.http",
                {
                  url: requestUrl,
                  status:
                    response.status,
                  status_text:
                    response.statusText
                }
              );
            }
          } catch (e) {}

          return response;

        })
        .catch(function (error) {
          try {
            trackError(
              error,
              "fetch.network",
              {
                url: requestUrl
              }
            );
          } catch (e) {}

          throw error;
        });
    };
  }

  /*
  |--------------------------------------------------------------------------
  | XHR INTERCEPTION
  |--------------------------------------------------------------------------
  */

  if (window.XMLHttpRequest) {
    var OriginalXHR =
      window.XMLHttpRequest;

    function ReportliXHR() {
      var xhr =
        new OriginalXHR();

      var requestUrl = null;

      var originalOpen =
        xhr.open;

      xhr.open = function (
        method,
        url
      ) {
        requestUrl = url;

        return originalOpen.apply(
          xhr,
          arguments
        );
      };

      xhr.addEventListener(
        "loadend",
        function () {
          try {
            /*
            Don't monitor Reportli itself.
            */

            if (
              requestUrl &&
              String(requestUrl).indexOf(
                WORKER_URL
              ) !== -1
            ) {
              return;
            }

            if (
              xhr.status >= 400
            ) {
              trackError(
                new Error(
                  "XHR HTTP " +
                  xhr.status +
                  " request failed: " +
                  requestUrl
                ),
                "xhr.http",
                {
                  url: requestUrl,
                  status: xhr.status,
                  status_text:
                    xhr.statusText
                }
              );

              return;
            }

            /*
            status 0 usually means
            network failure / aborted request.
            */

            if (
              xhr.status === 0 &&
              requestUrl
            ) {
              trackError(
                new Error(
                  "XHR network request failed: " +
                  requestUrl
                ),
                "xhr.network",
                {
                  url: requestUrl,
                  status: 0
                }
              );
            }

          } catch (e) {}
        }
      );

      return xhr;
    }

    ReportliXHR.prototype =
      OriginalXHR.prototype;

    window.XMLHttpRequest =
      ReportliXHR;
  }

  /*
  |--------------------------------------------------------------------------
  | MANUAL ERROR API
  |--------------------------------------------------------------------------
  */

  function capture(
    error,
    context
  ) {
    trackError(
      error,
      context || "manual"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PUBLIC API
  |--------------------------------------------------------------------------
  */

  window.Reportli = {
    /*
    Activity
    */

    track: function (
      eventName,
      properties
    ) {
      track(
        eventName,
        properties || {}
      );
    },

    /*
    Error tracking
    */

    capture: capture,

    captureException:
      function (
        error,
        context
      ) {
        capture(
          error,
          context ||
          "captureException"
        );
      },

    /*
    Identify user
    */

    identify: function (
      email,
      userId
    ) {
      window.reportliUser = {
        email: email || null,
        userId: userId || null
      };

      track("identify", {
        email: email || null,
        user_id: userId || null
      });
    },

    /*
    Session
    */

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
    try {
      var duration =
        Date.now() -
        SESSION_STARTED_AT;

      send(
        {
          type: "ACTIVITY",

          api_key: API_KEY,

          session_id: SESSION_ID,

          event: Object.assign(
            {},
            baseFields(),
            {
              event_name:
                "SESSION_END",

              duration_ms:
                duration
            }
          )
        },
        true
      );

    } catch (e) {}
  }

  window.addEventListener(
    "pagehide",
    endSession
  );

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
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, x-api-key",
    "Access-Control-Max-Age": "86400"
  };
}

/*
|--------------------------------------------------------------------------
| SUPABASE URL BUILDER
|--------------------------------------------------------------------------
*/

function buildSupabaseUrl(table) {
  return (
    SUPABASE_URL.replace(/\/+$/, "") +
    "/rest/v1/" +
    table
  );
}

/*
|--------------------------------------------------------------------------
| SUPABASE INSERT
|--------------------------------------------------------------------------
*/

async function insertSupabase(
  table,
  data
) {
  const url =
    buildSupabaseUrl(table);

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "apikey":
        SUPABASE_SERVICE_ROLE_KEY,

      "Authorization":
        "Bearer " +
        SUPABASE_SERVICE_ROLE_KEY,

      "Content-Type":
        "application/json",

      "Prefer":
        "return=minimal"
    },

    body: JSON.stringify(data)
  });

  const responseText =
    await response.text();

  if (!response.ok) {
    console.error(
      "Supabase insert failed",
      {
        table,
        status: response.status,
        body: responseText
      }
    );

    throw new Error(
      "Supabase insert failed: " +
      response.status +
      " " +
      responseText
    );
  }

  return true;
}

/*
|--------------------------------------------------------------------------
| ERROR INSERT
|--------------------------------------------------------------------------
|
| Your actual errors table:
|
| id             text PRIMARY KEY
| api_key        text
| error_message  text
| timestamp      timestamptz
| ai_analysis    text
|
*/

async function saveError(event) {
  const errorId =
    "err_" +
    crypto.randomUUID();

  const timestamp =
    event.timestamp ||
    new Date().toISOString();

  /*
  |--------------------------------------------------------------------------
  | AI ANALYSIS
  |--------------------------------------------------------------------------
  |
  | Your column is TEXT, so store a readable
  | JSON string here for now.
  |
  | Later your AI processor can replace/update
  | this value with the actual AI diagnosis.
  |
  */

  const aiAnalysis = JSON.stringify(
    {
      session_id:
        event.session_id || null,

      api_key:
        event.api_key || null,

      file_name:
        event.file_name || null,

      line_number:
        event.line_number || null,

      column_number:
        event.column_number || null,

      stack_trace:
        event.stack_trace || null,

      context:
        event.context || null,

      page:
        event.page || null,

      domain:
        event.domain || null,

      browser:
        event.browser || null
    }
  );

  /*
  |--------------------------------------------------------------------------
  | INSERT INTO errors
  |--------------------------------------------------------------------------
  */

  await insertSupabase(
    "errors",
    {
      id: errorId,

      api_key:
        event.api_key || null,

      error_message:
        event.error_message ||
        "Unknown error",

      timestamp: timestamp,

      ai_analysis:
        aiAnalysis
    }
  );

  console.log(
    "Reportli error saved:",
    errorId
  );
}

/*
|--------------------------------------------------------------------------
| ACTIVITY INSERT
|--------------------------------------------------------------------------
*/

async function saveActivity(event) {
  /*
  |--------------------------------------------------------------------------
  | user_activity
  |--------------------------------------------------------------------------
  |
  | Keeps the current structure:
  |
  | api_key
  | session_id
  | event
  |
  */

  await insertSupabase(
    "user_activity",
    {
      api_key:
        event.api_key || null,

      session_id:
        event.session_id || null,

      event:
        event.event || {}
    }
  );
}

/*
|--------------------------------------------------------------------------
| PROCESS EVENT
|--------------------------------------------------------------------------
*/

async function processEvent(event) {
  if (!event) {
    throw new Error(
      "Empty event"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ERROR
  |--------------------------------------------------------------------------
  */

  if (
    event.type === "ERROR"
  ) {
    await saveError(event);

    return {
      success: true,
      type: "ERROR"
    };
  }

  /*
  |--------------------------------------------------------------------------
  | ACTIVITY
  |--------------------------------------------------------------------------
  */

  await saveActivity(event);

  return {
    success: true,
    type: "ACTIVITY"
  };
}

/*
|--------------------------------------------------------------------------
| REQUEST HANDLER
|--------------------------------------------------------------------------
*/

export default {
  async fetch(request, env) {
    /*
    |--------------------------------------------------------------------------
    | Environment validation
    |--------------------------------------------------------------------------
    */

    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
        }),
        {
          status: 500,

          headers: {
            "Content-Type":
              "application/json",

            ...corsHeaders()
          }
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Update globals
    |--------------------------------------------------------------------------
    */

    SUPABASE_URL = env.SUPABASE_URL;
    SUPABASE_SERVICE_ROLE_KEY =
      env.SUPABASE_SERVICE_ROLE_KEY;

    /*
    |--------------------------------------------------------------------------
    | OPTIONS
    |--------------------------------------------------------------------------
    */

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const url =
      new URL(request.url);

    /*
    |--------------------------------------------------------------------------
    | SERVE SDK
    |--------------------------------------------------------------------------
    */

    if (
      request.method === "GET" &&
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

    /*
    |--------------------------------------------------------------------------
    | HEALTH CHECK
    |--------------------------------------------------------------------------
    */

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          service: "Reportli AI",
          status: "online"
        }),
        {
          status: 200,

          headers: {
            "Content-Type":
              "application/json",

            ...corsHeaders()
          }
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | POST EVENT
    |--------------------------------------------------------------------------
    */

    if (
      request.method === "POST"
    ) {
      try {
        const body =
          await request.json();

        /*
        |--------------------------------------------------------------------------
        | BATCH SUPPORT
        |--------------------------------------------------------------------------
        */

        if (
          body &&
          body.type === "BATCH" &&
          Array.isArray(body.events)
        ) {
          const results = [];

          for (
            const event of body.events
          ) {
            try {
              const result =
                await processEvent(
                  event
                );

              results.push(result);

            } catch (error) {
              console.error(
                "Failed to process batch event",
                error
              );

              results.push({
                success: false,
                error:
                  error.message
              });
            }
          }

          return new Response(
            JSON.stringify({
              success: true,
              processed:
                results.length,
              results
            }),
            {
              status: 200,

              headers: {
                "Content-Type":
                  "application/json",

                ...corsHeaders()
              }
            }
          );
        }

        /*
        |--------------------------------------------------------------------------
        | SINGLE EVENT
        |--------------------------------------------------------------------------
        */

        const result =
          await processEvent(body);

        return new Response(
          JSON.stringify(result),
          {
            status: 200,

            headers: {
              "Content-Type":
                "application/json",

              ...corsHeaders()
            }
          }
        );

      } catch (error) {
        console.error(
          "Reportli Worker error:",
          error
        );

        return new Response(
          JSON.stringify({
            success: false,
            error:
              error.message ||
              "Internal server error"
          }),
          {
            status: 500,

            headers: {
              "Content-Type":
                "application/json",

              ...corsHeaders()
            }
          }
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | NOT FOUND
    |--------------------------------------------------------------------------
    */

    return new Response(
      JSON.stringify({
        success: false,
        error: "Not found"
      }),
      {
        status: 404,

        headers: {
          "Content-Type":
            "application/json",

          ...corsHeaders()
        }
      }
    );
  }
};
