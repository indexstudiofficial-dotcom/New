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

const WORKER_URL =
  "https://reportliai-sbs.reportliaihq.workers.dev";

/*
|--------------------------------------------------------------------------
| REPORTLI BROWSER SDK
|--------------------------------------------------------------------------
*/

const REPORTLI_JS = String.raw`
(function () {
  "use strict";

  /*
  |--------------------------------------------------------------------------
  | PREVENT DOUBLE INITIALIZATION
  |--------------------------------------------------------------------------
  */

  if (window.__REPORTLI_LOADED__) {
    return;
  }

  window.__REPORTLI_LOADED__ = true;

  /*
  |--------------------------------------------------------------------------
  | CONFIG
  |--------------------------------------------------------------------------
  */

  var WORKER_URL =
    "${WORKER_URL}";

  /*
  |--------------------------------------------------------------------------
  | FIND API KEY
  |--------------------------------------------------------------------------
  */

  function getApiKey() {
    try {
      var currentScript =
        document.currentScript;

      if (currentScript) {
        var currentKey =
          currentScript.getAttribute(
            "data-key"
          );

        if (currentKey) {
          return currentKey;
        }
      }

      var scripts =
        document.getElementsByTagName(
          "script"
        );

      for (
        var i = 0;
        i < scripts.length;
        i++
      ) {
        var script =
          scripts[i];

        var src =
          script.src || "";

        if (
          src.indexOf(
            "reportli.js"
          ) !== -1 ||
          src.indexOf(
            "a_reportli.js"
          ) !== -1
        ) {
          var key =
            script.getAttribute(
              "data-key"
            );

          if (key) {
            return key;
          }
        }
      }

      return null;

    } catch (e) {
      return null;
    }
  }

  var API_KEY =
    getApiKey();

  /*
  |--------------------------------------------------------------------------
  | SESSION
  |--------------------------------------------------------------------------
  */

  var SESSION_ID =
    "sess_" +
    Math.random()
      .toString(36)
      .substring(2) +
    "_" +
    Date.now();

  var SESSION_STARTED_AT =
    Date.now();

  /*
  |--------------------------------------------------------------------------
  | USER
  |--------------------------------------------------------------------------
  */

  function detectUser() {
    try {
      if (
        window.reportliUser
      ) {
        return {
          email:
            window.reportliUser
              .email || null,

          user_id:
            window.reportliUser
              .userId || null
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
      return (
        navigator.userAgent ||
        "unknown"
      );
    } catch (e) {
      return "unknown";
    }
  }

  /*
  |--------------------------------------------------------------------------
  | LOCAL TIME DISPLAY
  |--------------------------------------------------------------------------
  |
  | Computed here, in the visitor's
  | own browser, using their real
  | timezone. The Worker never
  | guesses or hardcodes a timezone -
  | it only uses this string as-is.
  |
  */

  function getLocalTimeDisplay() {
    try {
      return new Date().toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        }
      );
    } catch (e) {
      return "";
    }
  }

  /*
  |--------------------------------------------------------------------------
  | BASE EVENT
  |--------------------------------------------------------------------------
  */

  function baseFields() {
    var user =
      detectUser();

    return {
      api_key:
        API_KEY,

      domain:
        window.location.hostname,

      session_id:
        SESSION_ID,

      email:
        user.email,

      user_id:
        user.user_id,

      page:
        window.location.href,

      browser:
        getBrowser(),

      time:
        new Date().toISOString(),

      local_time_display:
        getLocalTimeDisplay()
    };
  }

  /*
  |--------------------------------------------------------------------------
  | SEND
  |--------------------------------------------------------------------------
  */

  function send(
    payload,
    useBeacon
  ) {
    if (!API_KEY) {
      return;
    }

    try {
      var body =
        JSON.stringify(
          payload
        );

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
          var blob =
            new Blob(
              [body],
              {
                type:
                  "application/json"
              }
            );

          var beaconSent =
            navigator.sendBeacon(
              WORKER_URL,
              blob
            );

          if (beaconSent) {
            return;
          }

        } catch (e) {}
      }

      /*
      |--------------------------------------------------------------------------
      | FETCH
      |--------------------------------------------------------------------------
      */

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
        function () {
          /*
          Reportli must NEVER
          create another error.
          */
        }
      );

    } catch (e) {}
  }

  /*
  |--------------------------------------------------------------------------
  | ACTIVITY TRACKING
  |--------------------------------------------------------------------------
  */

  function track(
    eventName,
    data
  ) {
    try {
      var eventPayload =
        Object.assign(
          {},
          baseFields(),
          {
            event_name:
              eventName
          },
          data || {}
        );

      send({
        type:
          "ACTIVITY",

        api_key:
          API_KEY,

        session_id:
          SESSION_ID,

        event:
          eventPayload
      });

    } catch (e) {}
  }

  /*
  |--------------------------------------------------------------------------
  | SESSION STARTED
  |--------------------------------------------------------------------------
  */

  track(
    "SESSION_STARTED",
    {
      started_at:
        new Date().toISOString()
    }
  );

  /*
  |--------------------------------------------------------------------------
  | INITIAL PAGE VIEW
  |--------------------------------------------------------------------------
  */

  track(
    "page_view",
    {
      url:
        window.location.href,

      title:
        document.title
    }
  );

  /*
  |--------------------------------------------------------------------------
  | ELEMENT INFORMATION
  |--------------------------------------------------------------------------
  */

  function getElementInfo(
    element
  ) {
    try {
      if (!element) {
        return {};
      }

      var tag =
        element.tagName
          ? element.tagName.toLowerCase()
          : null;

      var text = "";

      try {
        text =
          (
            element.innerText ||
            element.textContent ||
            ""
          )
            .trim()
            .replace(
              /\s+/g,
              " "
            )
            .substring(
              0,
              200
            );
      } catch (e) {}

      var id =
        element.id || null;

      var className =
        null;

      try {
        if (
          typeof element.className ===
          "string"
        ) {
          className =
            element.className;
        }
      } catch (e) {}

      var href =
        null;

      try {
        href =
          element.href ||
          null;
      } catch (e) {}

      var name =
        null;

      try {
        name =
          element.getAttribute(
            "name"
          );
      } catch (e) {}

      var ariaLabel =
        null;

      try {
        ariaLabel =
          element.getAttribute(
            "aria-label"
          );
      } catch (e) {}

      var value =
        null;

      try {
        value =
          element.value ||
          null;
      } catch (e) {}

      return {
        tag:
          tag,

        text:
          text,

        id:
          id,

        class_name:
          className,

        href:
          href,

        name:
          name,

        aria_label:
          ariaLabel,

        value:
          value
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
        var target =
          event.target;

        if (!target) {
          return;
        }

        var clickable =
          null;

        try {
          clickable =
            target.closest(
              "button,a,input,select,textarea,[role='button'],[onclick]"
            );
        } catch (e) {}

        clickable =
          clickable ||
          target;

        var info =
          getElementInfo(
            clickable
          );

        track(
          "click",
          {
            element:
              info,

            label:
              (
                info.text ||
                info.aria_label ||
                ""
              ).trim() ||
              "(no label)",

            x:
              event.clientX,

            y:
              event.clientY
          }
        );

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
      track(
        "page_view",
        {
          url:
            window.location.href,

          title:
            document.title
        }
      );
    } catch (e) {}
  }

  /*
  |--------------------------------------------------------------------------
  | SPA NAVIGATION
  |--------------------------------------------------------------------------
  */

  var CURRENT_PATH =
    window.location.pathname;

  try {
    var originalPushState =
      history.pushState;

    history.pushState =
      function () {
        var previousPath =
          CURRENT_PATH;

        var result =
          originalPushState.apply(
            history,
            arguments
          );

        setTimeout(
          function () {
            var newPath =
              window.location.pathname;

            if (
              newPath !==
              previousPath
            ) {
              track(
                "navigation",
                {
                  from:
                    previousPath,

                  to:
                    newPath
                }
              );

              CURRENT_PATH =
                newPath;
            }

            trackPageView();
          },
          0
        );

        return result;
      };
  } catch (e) {}

  try {
    var originalReplaceState =
      history.replaceState;

    history.replaceState =
      function () {
        var previousPath =
          CURRENT_PATH;

        var result =
          originalReplaceState.apply(
            history,
            arguments
          );

        setTimeout(
          function () {
            var newPath =
              window.location.pathname;

            if (
              newPath !==
              previousPath
            ) {
              track(
                "navigation",
                {
                  from:
                    previousPath,

                  to:
                    newPath
                }
              );

              CURRENT_PATH =
                newPath;
            }

            trackPageView();
          },
          0
        );

        return result;
      };
  } catch (e) {}

  window.addEventListener(
    "popstate",
    function () {
      var previousPath =
        CURRENT_PATH;

      var newPath =
        window.location.pathname;

      if (
        newPath !==
        previousPath
      ) {
        track(
          "navigation",
          {
            from:
              previousPath,

            to:
              newPath
          }
        );

        CURRENT_PATH =
          newPath;
      }

      trackPageView();
    }
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
      var signature =
        getErrorSignature(
          message,
          stack,
          fileName,
          lineNumber
        );

      var now =
        Date.now();

      if (
        recentErrors[
          signature
        ] &&
        now -
          recentErrors[
            signature
          ] <
          2000
      ) {
        return false;
      }

      recentErrors[
        signature
      ] = now;

      /*
      Clean old errors.
      */

      Object.keys(
        recentErrors
      ).forEach(
        function (key) {
          if (
            now -
              recentErrors[
                key
              ] >
              10000
          ) {
            delete recentErrors[
              key
            ];
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
  | ERROR MESSAGE
  |--------------------------------------------------------------------------
  */

  function getErrorMessage(
    error
  ) {
    try {
      if (!error) {
        return "Unknown error";
      }

      if (
        typeof error ===
        "string"
      ) {
        return error;
      }

      if (
        error.message
      ) {
        return String(
          error.message
        );
      }

      try {
        return JSON.stringify(
          error
        );
      } catch (e) {
        return String(
          error
        );
      }

    } catch (e) {
      return "Unknown error";
    }
  }

  /*
  |--------------------------------------------------------------------------
  | ERROR STACK
  |--------------------------------------------------------------------------
  */

  function getErrorStack(
    error
  ) {
    try {
      if (
        error &&
        error.stack
      ) {
        return String(
          error.stack
        );
      }

      return null;

    } catch (e) {
      return null;
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
      var message =
        getErrorMessage(
          error
        );

      var stack =
        getErrorStack(
          error
        );

      var fileName =
        null;

      var lineNumber =
        null;

      var columnNumber =
        null;

      /*
      Extract location
      from Error object.
      */

      try {
        if (
          error &&
          error.fileName
        ) {
          fileName =
            error.fileName;
        }

        if (
          error &&
          error.filename
        ) {
          fileName =
            error.filename;
        }

        if (
          error &&
          error.lineNumber
        ) {
          lineNumber =
            error.lineNumber;
        }

        if (
          error &&
          error.lineno
        ) {
          lineNumber =
            error.lineno;
        }

        if (
          error &&
          error.columnNumber
        ) {
          columnNumber =
            error.columnNumber;
        }

        if (
          error &&
          error.colno
        ) {
          columnNumber =
            error.colno;
        }

      } catch (e) {}

      /*
      Override with
      supplied values.
      */

      if (
        extra &&
        extra.file_name
      ) {
        fileName =
          extra.file_name;
      }

      if (
        extra &&
        extra.line_number
      ) {
        lineNumber =
          extra.line_number;
      }

      if (
        extra &&
        extra.column_number
      ) {
        columnNumber =
          extra.column_number;
      }

      /*
      Deduplicate.
      */

      if (
        !shouldReportError(
          message,
          stack,
          fileName,
          lineNumber
        )
      ) {
        return;
      }

      /*
      |--------------------------------------------------------------------------
      | ERROR PAYLOAD
      |--------------------------------------------------------------------------
      */

      var payload = {
        type:
          "ERROR",

        api_key:
          API_KEY,

        session_id:
          SESSION_ID,

        error_message:
          message,

        timestamp:
          new Date().toISOString(),

        local_time_display:
          getLocalTimeDisplay(),

        file_name:
          fileName,

        line_number:
          lineNumber,

        column_number:
          columnNumber,

        stack_trace:
          stack,

        context:
          context ||
          "unknown",

        page:
          window.location.href,

        domain:
          window.location.hostname,

        browser:
          getBrowser()
      };

      /*
      Additional information.
      */

      if (extra) {
        try {
          payload.extra =
            extra;
        } catch (e) {}
      }

      /*
      Send immediately.
      */

      send(
        payload,
        false
      );

    } catch (e) {
      /*
      Never allow Reportli
      to crash the customer's app.
      */
    }
  }

  /*
  |--------------------------------------------------------------------------
  | window.onerror
  |--------------------------------------------------------------------------
  |
  | Primary JavaScript runtime
  | error handler.
  |
  */

  window.onerror =
    function (
      message,
      source,
      lineno,
      colno,
      error
    ) {
      try {
        var actualError =
          error;

        if (
          !actualError
        ) {
          actualError =
            new Error(
              typeof message ===
              "string"
                ? message
                : "JavaScript error"
            );
        }

        trackError(
          actualError,
          "window.onerror",
          {
            file_name:
              source ||
              null,

            line_number:
              lineno ||
              null,

            column_number:
              colno ||
              null
          }
        );

      } catch (e) {}

      /*
      Returning false preserves
      normal browser behavior.
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
        Runtime JavaScript error.
        */

        if (
          event &&
          event.error
        ) {
          trackError(
            event.error,
            "window.error",
            {
              file_name:
                event.filename ||
                null,

              line_number:
                event.lineno ||
                null,

              column_number:
                event.colno ||
                null
            }
          );

          return;
        }

        /*
        Resource error.
        */

        var target =
          event &&
          event.target;

        if (
          target &&
          target !== window &&
          target !== document
        ) {
          var resourceUrl =
            null;

          try {
            resourceUrl =
              target.src ||
              target.href ||
              null;
          } catch (e) {}

          var resourceType =
            target.tagName
              ? target.tagName.toLowerCase()
              : "resource";

          trackError(
            new Error(
              "Failed to load " +
              resourceType +
              (
                resourceUrl
                  ? ": " +
                    resourceUrl
                  : ""
              )
            ),
            "resource.error",
            {
              resource_url:
                resourceUrl,

              resource_type:
                resourceType
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
        var reason =
          event &&
          event.reason;

        /*
        Normal Error.
        */

        if (
          reason instanceof
          Error
        ) {
          trackError(
            reason,
            "unhandledrejection"
          );

          return;
        }

        /*
        String rejection.
        */

        if (
          typeof reason ===
          "string"
        ) {
          trackError(
            new Error(
              reason
            ),
            "unhandledrejection"
          );

          return;
        }

        /*
        Object rejection.
        */

        var message =
          "";

        try {
          message =
            JSON.stringify(
              reason
            );
        } catch (e) {
          message =
            String(reason);
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

  if (
    window.fetch
  ) {
    try {
      var originalFetch =
        window.fetch;

      window.fetch =
        function () {
          var args =
            arguments;

          var requestUrl =
            null;

          var requestMethod =
            "GET";

          try {
            if (
              typeof args[0] ===
              "string"
            ) {
              requestUrl =
                args[0];
            } else if (
              args[0] &&
              args[0].url
            ) {
              requestUrl =
                args[0].url;
            }

            if (
              args[1] &&
              args[1].method
            ) {
              requestMethod =
                args[1].method;
            }
          } catch (e) {}

          /*
          Don't monitor Reportli.
          */

          if (
            requestUrl &&
            String(
              requestUrl
            ).indexOf(
              WORKER_URL
            ) !== -1
          ) {
            return originalFetch.apply(
              this,
              args
            );
          }

          return originalFetch
            .apply(
              this,
              args
            )
            .then(
              function (
                response
              ) {
                try {
                  if (
                    response &&
                    response.status >=
                      400
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
                        url:
                          requestUrl,

                        method:
                          requestMethod,

                        status:
                          response.status,

                        status_text:
                          response.statusText
                      }
                    );
                  }
                } catch (e) {}

                return response;
              }
            )
            .catch(
              function (
                error
              ) {
                try {
                  trackError(
                    error,
                    "fetch.network",
                    {
                      url:
                        requestUrl,

                      method:
                        requestMethod
                    }
                  );
                } catch (e) {}

                /*
                Preserve original
                application behavior.
                */

                throw error;
              }
            );
        };

    } catch (e) {}
  }

  /*
  |--------------------------------------------------------------------------
  | XHR INTERCEPTION
  |--------------------------------------------------------------------------
  */

  if (
    window.XMLHttpRequest
  ) {
    try {
      var OriginalXHR =
        window.XMLHttpRequest;

      function ReportliXHR() {
        var xhr =
          new OriginalXHR();

        var requestUrl =
          null;

        var requestMethod =
          "GET";

        /*
        Capture open().
        */

        var originalOpen =
          xhr.open;

        xhr.open =
          function (
            method,
            url
          ) {
            requestMethod =
              method ||
              "GET";

            requestUrl =
              url;

            return originalOpen.apply(
              xhr,
              arguments
            );
          };

        /*
        Monitor request result.
        */

        xhr.addEventListener(
          "loadend",
          function () {
            try {
              /*
              Don't monitor Reportli.
              */

              if (
                requestUrl &&
                String(
                  requestUrl
                ).indexOf(
                  WORKER_URL
                ) !== -1
              ) {
                return;
              }

              /*
              HTTP error.
              */

              if (
                xhr.status >=
                400
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
                    url:
                      requestUrl,

                    method:
                      requestMethod,

                    status:
                      xhr.status,

                    status_text:
                      xhr.statusText
                  }
                );

                return;
              }

              /*
              Network error.
              */

              if (
                xhr.status ===
                  0 &&
                requestUrl
              ) {
                trackError(
                  new Error(
                    "XHR network request failed: " +
                      requestUrl
                  ),
                  "xhr.network",
                  {
                    url:
                      requestUrl,

                    method:
                      requestMethod,

                    status:
                      0
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

    } catch (e) {}
  }

  /*
  |--------------------------------------------------------------------------
  | MANUAL ERROR CAPTURE
  |--------------------------------------------------------------------------
  */

  function capture(
    error,
    context
  ) {
    trackError(
      error,
      context ||
        "manual"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | PUBLIC API
  |--------------------------------------------------------------------------
  */

  window.Reportli = {

    /*
    Activity tracking.
    */

    track:
      function (
        eventName,
        properties
      ) {
        track(
          eventName,
          properties ||
            {}
        );
      },

    /*
    Error tracking.
    */

    capture:
      capture,

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
    Identify user.
    */

    identify:
      function (
        email,
        userId
      ) {
        window.reportliUser =
          {
            email:
              email ||
              null,

            userId:
              userId ||
              null
          };

        track(
          "identify",
          {
            email:
              email ||
              null,

            user_id:
              userId ||
              null
          }
        );
      },

    /*
    Session.
    */

    getSessionId:
      function () {
        return SESSION_ID;
      },

    /*
    User.
    */

    getUser:
      function () {
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
          type:
            "ACTIVITY",

          api_key:
            API_KEY,

          session_id:
            SESSION_ID,

          event:
            Object.assign(
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

/*
|--------------------------------------------------------------------------
| SUPABASE INSERT
|--------------------------------------------------------------------------
|
| IMPORTANT:
| env is passed into this function.
| There is NO env reference at
| the top level of this Worker.
|--------------------------------------------------------------------------
*/

async function insertSupabase(
  env,
  table,
  data
) {
  if (
    !env.SUPABASE_URL
  ) {
    throw new Error(
      "SUPABASE_URL is missing"
    );
  }

  if (
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing"
    );
  }

  const supabaseUrl =
    env.SUPABASE_URL.replace(
      /\/+$/,
      ""
    );

  const url =
    supabaseUrl +
    "/rest/v1/" +
    table;

  const response =
    await fetch(
      url,
      {
        method:
          "POST",

        headers:
          {
            "apikey":
              env.SUPABASE_SERVICE_ROLE_KEY,

            "Authorization":
              "Bearer " +
              env.SUPABASE_SERVICE_ROLE_KEY,

            "Content-Type":
              "application/json",

            "Prefer":
              "return=minimal"
          },

        body:
          JSON.stringify(
            data
          )
      }
    );

  const responseText =
    await response.text();

  if (
    !response.ok
  ) {
    console.error(
      "SUPABASE INSERT FAILED",
      {
        table:
          table,

        status:
          response.status,

        response:
          responseText
      }
    );

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
| BUILD HUMAN READABLE ACTIVITY STRING
|--------------------------------------------------------------------------
|
| Pure template logic. No AI. No
| Gemini. No Sarvam AI. Deterministic
| string building only, exactly as
| specified.
|
| Uses the browser-computed
| local_time_display as-is - this
| Worker never computes or guesses
| a timezone itself.
|
|--------------------------------------------------------------------------
*/

function buildActivityString(
  eventWrapper
) {
  const inner =
    eventWrapper &&
    eventWrapper.event
      ? eventWrapper.event
      : {};

  const localTime =
    inner.local_time_display ||
    "";

  const eventName =
    inner.event_name ||
    "";

  let activityText =
    "";

  if (
    eventName ===
    "SESSION_STARTED"
  ) {
    activityText =
      "Session started";

  } else if (
    eventName ===
    "SESSION_END"
  ) {
    activityText =
      "Session ended";

  } else if (
    eventName ===
    "page_view"
  ) {
    let path =
      inner.page ||
      inner.url ||
      "";

    try {
      if (
        path &&
        path.indexOf(
          "http"
        ) === 0
      ) {
        path =
          new URL(
            path
          ).pathname;
      }
    } catch (e) {}

    activityText =
      "Viewed " +
      (
        path ||
        "unknown page"
      );

  } else if (
    eventName ===
    "click"
  ) {
    const label =
      inner.label ||
      "(no label)";

    const element =
      inner.element &&
      inner.element.tag
        ? inner.element.tag
        : "element";

    if (
      label &&
      label !==
        "(no label)"
    ) {
      activityText =
        'Clicked "' +
        label +
        '"';
    } else {
      activityText =
        "Clicked " +
        element;
    }

  } else if (
    eventName ===
    "navigation"
  ) {
    const from =
      inner.from ||
      "unknown";

    const to =
      inner.to ||
      "unknown";

    activityText =
      "Navigated " +
      from +
      " \u2192 " +
      to;

  } else if (
    eventName ===
    "identify"
  ) {
    activityText =
      "Identified as " +
      (
        inner.email ||
        inner.user_id ||
        "unknown user"
      );

  } else if (
    eventName ===
    "error_occurred"
  ) {
    activityText =
      "error occurred";

  } else {
    /*
    Unknown event name -
    fall back to a safe
    generic string, never
    raw JSON.
    */

    activityText =
      eventName ||
      "Activity";
  }

  if (
    localTime
  ) {
    return (
      localTime +
      "   " +
      activityText
    );
  }

  return activityText;
}

/*
|--------------------------------------------------------------------------
| SAVE ACTIVITY
|--------------------------------------------------------------------------
*/

async function saveActivity(
  env,
  event
) {
  const activityString =
    buildActivityString(
      event
    );

  const activity = {
    api_key:
      event.api_key ||
      null,

    session_id:
      event.session_id ||
      null,

    event:
      activityString
  };

  await insertSupabase(
    env,
    "user_activity",
    activity
  );
}

/*
|--------------------------------------------------------------------------
| SAVE ERROR-TRIGGERED ACTIVITY ROW
|--------------------------------------------------------------------------
|
| Every saved error also creates a
| companion row in user_activity so
| it shows in the timeline as:
|
| 09:17 AM   error occurred
|
|--------------------------------------------------------------------------
*/

async function saveErrorActivity(
  env,
  event
) {
  const wrapper = {
    api_key:
      event.api_key ||
      null,

    session_id:
      event.session_id ||
      null,

    event: {
      event_name:
        "error_occurred",

      local_time_display:
        event.local_time_display ||
        ""
    }
  };

  await saveActivity(
    env,
    wrapper
  );
}

/*
|--------------------------------------------------------------------------
| SARVAM AI - ERROR ANALYSIS
|--------------------------------------------------------------------------
|
| Generates the plain-paragraph
| analysis format:
|
| [explanation]
|
| Cause:
| [cause]
|
| Recommended:
| [recommendation]
|
| Location:
| file:line:col
|
| Stack trace:
| [stack]
|
|--------------------------------------------------------------------------
*/

async function generateAiAnalysis(
  env,
  event
) {
  const location =
    (
      event.file_name ||
      "unknown"
    ) +
    ":" +
    (
      event.line_number !=
      null
        ? event.line_number
        : "?"
    ) +
    ":" +
    (
      event.column_number !=
      null
        ? event.column_number
        : "?"
    );

  const stack =
    event.stack_trace ||
    "No stack trace available";

  if (
    !env.SARVAM_API_KEY
  ) {
    /*
    Fail safe - never crash
    the save if Sarvam is
    not configured.
    */

    return (
      (
        event.error_message ||
        "An error occurred."
      ) +
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
      "Error message: " +
      (
        event.error_message ||
        "Unknown error"
      ) +
      "\nContext: " +
      (
        event.context ||
        "unknown"
      ) +
      "\nPage: " +
      (
        event.page ||
        "unknown"
      ) +
      "\n\nRespond with ONLY the formatted analysis text, nothing else. Do not repeat the Location or Stack trace sections differently than shown above - use the exact location and stack trace given.";

    const sarvamResponse =
      await fetch(
        "https://api.sarvam.ai/v1/chat/completions",
        {
          method:
            "POST",

          headers:
            {
              "Content-Type":
                "application/json",

              "api-subscription-key":
                env.SARVAM_API_KEY
            },

          body:
            JSON.stringify(
              {
                model:
                  "sarvam-105b",

                messages:
                  [
                    {
                      role:
                        "user",

                      content:
                        prompt
                    }
                  ],

                max_tokens:
                  700,

                temperature:
                  0.3
              }
            )
        }
      );

    const sarvamData =
      await sarvamResponse.json();

    const content =
      sarvamData &&
      sarvamData.choices &&
      sarvamData.choices[0] &&
      sarvamData.choices[0]
        .message
        ? sarvamData
            .choices[0]
            .message
            .content
        : null;

    if (
      content &&
      content.trim()
    ) {
      return content.trim();
    }

    throw new Error(
      "Empty Sarvam AI response"
    );

  } catch (e) {
    console.error(
      "Sarvam AI error:",
      e.message
    );

    /*
    Fail safe fallback -
    still gives a usable
    analysis even if Sarvam
    AI fails.
    */

    return (
      (
        event.error_message ||
        "An error occurred."
      ) +
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
|
| ACTUAL DATABASE SCHEMA:
|
| errors
| ├── id
| ├── api_key
| ├── error_message
| ├── timestamp
| └── ai_analysis
|
|--------------------------------------------------------------------------
*/

async function saveError(
  env,
  event
) {
  /*
  |--------------------------------------------------------------------------
  | Generate error ID
  |--------------------------------------------------------------------------
  */

  const errorId =
    "err_" +
    crypto.randomUUID();

  /*
  |--------------------------------------------------------------------------
  | Timestamp
  |--------------------------------------------------------------------------
  */

  const timestamp =
    event.timestamp ||
    new Date().toISOString();

  /*
  |--------------------------------------------------------------------------
  | AI ANALYSIS (Sarvam AI)
  |--------------------------------------------------------------------------
  */

  const aiAnalysis =
    await generateAiAnalysis(
      env,
      event
    );

  /*
  |--------------------------------------------------------------------------
  | DATABASE INSERT
  |--------------------------------------------------------------------------
  */

  const errorRow = {
    id:
      errorId,

    api_key:
      event.api_key ||
      null,

    error_message:
      event.error_message ||
      "Unknown error",

    timestamp:
      timestamp,

    ai_analysis:
      aiAnalysis
  };

  console.log(
    "Saving Reportli error:",
    {
      id:
        errorId,

      api_key:
        event.api_key,

      error_message:
        event.error_message,

      timestamp:
        timestamp
    }
  );

  await insertSupabase(
    env,
    "errors",
    errorRow
  );

  console.log(
    "Reportli error saved successfully:",
    errorId
  );

  /*
  |--------------------------------------------------------------------------
  | COMPANION ACTIVITY ROW
  |--------------------------------------------------------------------------
  |
  | Shows "error occurred" in the
  | timeline alongside the full
  | error record.
  |
  */

  try {
    await saveErrorActivity(
      env,
      event
    );
  } catch (e) {
    console.error(
      "Failed to save error activity row:",
      e.message
    );
  }

  return true;
}

/*
|--------------------------------------------------------------------------
| PROCESS EVENT
|--------------------------------------------------------------------------
*/

async function processEvent(
  env,
  event
) {
  if (!event) {
    throw new Error(
      "Empty event"
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ERROR EVENT
  |--------------------------------------------------------------------------
  */

  if (
    event.type ===
    "ERROR"
  ) {
    await saveError(
      env,
      event
    );

    return {
      success:
        true,

      type:
        "ERROR"
    };
  }

  /*
  |--------------------------------------------------------------------------
  | ACTIVITY EVENT
  |--------------------------------------------------------------------------
  */

  await saveActivity(
    env,
    event
  );

  return {
    success:
      true,

    type:
      "ACTIVITY"
  };
}

/*
|--------------------------------------------------------------------------
| MAIN WORKER
|--------------------------------------------------------------------------
*/

export default {
  async fetch(
    request,
    env
  ) {
    /*
    |--------------------------------------------------------------------------
    | Validate environment
    |--------------------------------------------------------------------------
    */

    if (
      !env.SUPABASE_URL
    ) {
      return new Response(
        JSON.stringify(
          {
            success:
              false,

            error:
              "SUPABASE_URL is not configured"
          }
        ),
        {
          status:
            500,

          headers:
            {
              "Content-Type":
                "application/json",

              ...corsHeaders()
            }
        }
      );
    }

    if (
      !env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return new Response(
        JSON.stringify(
          {
            success:
              false,

            error:
              "SUPABASE_SERVICE_ROLE_KEY is not configured"
          }
        ),
        {
          status:
            500,

          headers:
            {
              "Content-Type":
                "application/json",

              ...corsHeaders()
            }
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | URL
    |--------------------------------------------------------------------------
    */

    const url =
      new URL(
        request.url
      );

    /*
    |--------------------------------------------------------------------------
    | OPTIONS
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | SERVE REPORTLI SDK
    |--------------------------------------------------------------------------
    */

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

          headers:
            {
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
      request.method ===
        "GET" &&
      url.pathname ===
        "/"
    ) {
      return new Response(
        JSON.stringify(
          {
            success:
              true,

            service:
              "Reportli AI",

            status:
              "online"
          }
        ),
        {
          status:
            200,

          headers:
            {
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
      request.method ===
      "POST"
    ) {
      try {
        const body =
          await request.json();

        /*
        |--------------------------------------------------------------------------
        | BATCH
        |--------------------------------------------------------------------------
        */

        if (
          body &&
          body.type ===
            "BATCH" &&
          Array.isArray(
            body.events
          )
        ) {
          const results =
            [];

          for (
            const event of
              body.events
          ) {
            try {
              const result =
                await processEvent(
                  env,
                  event
                );

              results.push(
                result
              );

            } catch (
              error
            ) {
              console.error(
                "Batch event failed:",
                error
              );

              results.push(
                {
                  success:
                    false,

                  error:
                    error.message ||
                    "Event processing failed"
                }
              );
            }
          }

          return new Response(
            JSON.stringify(
              {
                success:
                  true,

                processed:
                  results.length,

                results:
                  results
              }
            ),
            {
              status:
                200,

              headers:
                {
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
          await processEvent(
            env,
            body
          );

        return new Response(
          JSON.stringify(
            result
          ),
          {
            status:
              200,

            headers:
              {
                "Content-Type":
                  "application/json",

                ...corsHeaders()
              }
          }
        );

      } catch (
        error
      ) {
        console.error(
          "Reportli Worker error:",
          error
        );

        return new Response(
          JSON.stringify(
            {
              success:
                false,

              error:
                error.message ||
                "Internal server error"
            }
          ),
          {
            status:
              500,

            headers:
              {
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
      JSON.stringify(
        {
          success:
            false,

          error:
            "Not found"
        }
      ),
      {
        status:
          404,

        headers:
          {
            "Content-Type":
              "application/json",

            ...corsHeaders()
          }
      }
    );
  }
};
