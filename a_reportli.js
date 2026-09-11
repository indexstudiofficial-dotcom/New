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
          currentScript.getAttribute("data-key");

        if (currentKey) {
          return currentKey;
        }
      }

      var scripts =
        document.getElementsByTagName("script");

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
          src.indexOf("reportli.js") !== -1 ||
          src.indexOf("a_reportli.js") !== -1
        ) {
          var key =
            script.getAttribute("data-key");

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
      if (window.reportliUser) {
        return {
          email:
            window.reportliUser.email || null,

          user_id:
            window.reportliUser.userId || null
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
  | LOCAL TIME
  |--------------------------------------------------------------------------
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
  | SEND EVENT
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
        JSON.stringify(payload);


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
          method:
            "POST",

          headers:
            {
              "Content-Type":
                "application/json",

              "x-api-key":
                API_KEY
            },

          body:
            body,

          keepalive:
            true
        }
      ).catch(
        function () {
          /*
          Never allow Reportli
          to create another error.
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

      send(
        {
          type:
            "ACTIVITY",

          api_key:
            API_KEY,

          session_id:
            SESSION_ID,

          event:
            eventPayload
        },
        false
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
            .replace(/\s+/g, " ")
            .substring(0, 200);
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
          element.getAttribute("name");
      } catch (e) {}

      var ariaLabel =
        null;

      try {
        ariaLabel =
          element.getAttribute("aria-label");
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
        recentErrors[signature] &&
        now -
          recentErrors[signature] <
          2000
      ) {
        return false;
      }

      recentErrors[signature] =
        now;


      Object.keys(
        recentErrors
      ).forEach(
        function (key) {
          if (
            now -
              recentErrors[key] >
              10000
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

      if (error.message) {
        return String(
          error.message
        );
      }

      try {
        return JSON.stringify(
          error
        );
      } catch (e) {
        return String(error);
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
        getErrorMessage(error);

      var stack =
        getErrorStack(error);

      var fileName =
        null;

      var lineNumber =
        null;

      var columnNumber =
        null;


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
      Override supplied values.
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
        extra.line_number !=
          null
      ) {
        lineNumber =
          extra.line_number;
      }

      if (
        extra &&
        extra.column_number !=
          null
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
      ERROR PAYLOAD
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


      if (extra) {
        try {
          payload.extra =
            extra;
        } catch (e) {}
      }


      send(
        payload,
        false
      );

    } catch (e) {}
  }


  /*
  |--------------------------------------------------------------------------
  | WINDOW ERROR
  |--------------------------------------------------------------------------
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

        if (!actualError) {
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

        if (
          reason instanceof Error
        ) {
          trackError(
            reason,
            "unhandledrejection"
          );

          return;
        }

        if (
          typeof reason ===
          "string"
        ) {
          trackError(
            new Error(reason),
            "unhandledrejection"
          );

          return;
        }

        var message =
          "";

        try {
          message =
            JSON.stringify(reason);
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

  if (window.fetch) {
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
            String(requestUrl).indexOf(
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
              function (response) {
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
              function (error) {
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

  if (window.XMLHttpRequest) {
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


        var originalOpen =
          xhr.open;

        xhr.open =
          function (
            method,
            url
          ) {
            requestMethod =
              method || "GET";

            requestUrl =
              url;

            return originalOpen.apply(
              xhr,
              arguments
            );
          };


        xhr.addEventListener(
          "loadend",
          function () {
            try {

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

    track:
      function (
        eventName,
        properties
      ) {
        track(
          eventName,
          properties || {}
        );
      },


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


    identify:
      function (
        email,
        userId
      ) {
        window.reportliUser = {
          email:
            email || null,

          userId:
            userId || null
        };

        track(
          "identify",
          {
            email:
              email || null,

            user_id:
              userId || null
          }
        );
      },


    getSessionId:
      function () {
        return SESSION_ID;
    },


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
| NORMALIZE DOMAIN
|--------------------------------------------------------------------------
|
| Example:
|
| https://Example.com/
| example.com
| EXAMPLE.COM
|
| all become:
|
| example.com
|
|--------------------------------------------------------------------------
*/

function normalizeDomain(
  value
) {
  if (!value) {
    return "";
  }

  try {
    var domain =
      String(value)
        .trim()
        .toLowerCase();

    /*
    If a full URL somehow
    arrives, extract hostname.
    */

    if (
      domain.indexOf("://") !== -1
    ) {
      domain =
        new URL(domain).hostname;
    }

    /*
    Remove trailing dot.
    */

    domain =
      domain.replace(/\.+$/, "");

    /*
    Remove www only if desired.
    IMPORTANT:
    Keep this disabled if
    www.example.com and
    example.com are different
    applications in your system.
    */

    return domain;

  } catch (e) {
    return "";
  }
}


/*
|--------------------------------------------------------------------------
| SUPABASE REQUEST
|--------------------------------------------------------------------------
*/

async function supabaseRequest(
  env,
  path,
  options
) {
  if (!env.SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL is missing"
    );
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing"
    );
  }

  var supabaseUrl =
    env.SUPABASE_URL.replace(
      /\/+$/,
      ""
    );

  var response =
    await fetch(
      supabaseUrl +
        path,
      {
        ...options,

        headers: {
          "apikey":
            env.SUPABASE_SERVICE_ROLE_KEY,

          "Authorization":
            "Bearer " +
            env.SUPABASE_SERVICE_ROLE_KEY,

          "Content-Type":
            "application/json",

          ...(options &&
            options.headers
              ? options.headers
              : {})
        }
      }
    );

  var responseText =
    await response.text();

  if (!response.ok) {
    throw new Error(
      "Supabase request failed: " +
        response.status +
        " " +
        responseText
    );
  }

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(
      responseText
    );
  } catch (e) {
    return responseText;
  }
}


/*
|--------------------------------------------------------------------------
| SUPABASE INSERT
|--------------------------------------------------------------------------
*/

async function insertSupabase(
  env,
  table,
  data
) {
  await supabaseRequest(
    env,
    "/rest/v1/" + table,
    {
      method:
        "POST",

      headers: {
        "Prefer":
          "return=minimal"
      },

      body:
        JSON.stringify(data)
    }
  );

  return true;
}


/*
|--------------------------------------------------------------------------
| VALIDATE APPLICATION
|--------------------------------------------------------------------------
|
| THIS IS THE FIRST IMPORTANT
| STEP FOR EVERY EVENT.
|
| Required:
|
| 1. api_key exists
| 2. domain exists
| 3. application exists
| 4. api_key matches
| 5. domain matches
|
| Then we obtain:
|
| application.user_id
|
|--------------------------------------------------------------------------
*/

async function validateApplication(
  env,
  event
) {
  var apiKey =
    event &&
    typeof event.api_key ===
      "string"
      ? event.api_key.trim()
      : "";

  var incomingDomain =
    normalizeDomain(
      event &&
      event.domain
    );


  /*
  |--------------------------------------------------------------------------
  | API KEY REQUIRED
  |--------------------------------------------------------------------------
  */

  if (!apiKey) {
    throw new Error(
      "Missing api_key"
    );
  }


  /*
  |--------------------------------------------------------------------------
  | DOMAIN REQUIRED
  |--------------------------------------------------------------------------
  */

  if (!incomingDomain) {
    throw new Error(
      "Missing domain"
    );
  }


  /*
  |--------------------------------------------------------------------------
  | QUERY APPLICATION
  |--------------------------------------------------------------------------
  |
  | We query by API key first.
  | Domain is then checked again
  | server-side.
  |
  |--------------------------------------------------------------------------
  */

  var encodedApiKey =
    encodeURIComponent(
      apiKey
    );

  var query =
    "/rest/v1/applications" +
    "?select=id,name,api_key,status,user_id,domain" +
    "&api_key=eq." +
    encodedApiKey +
    "&limit=1";

  var applications =
    await supabaseRequest(
      env,
      query,
      {
        method:
          "GET"
      }
    );


  if (
    !Array.isArray(
      applications
    ) ||
    applications.length === 0
  ) {
    throw new Error(
      "Invalid api_key"
    );
  }


  var application =
    applications[0];


  /*
  |--------------------------------------------------------------------------
  | CHECK API KEY AGAIN
  |--------------------------------------------------------------------------
  */

  if (
    application.api_key !==
    apiKey
  ) {
    throw new Error(
      "Invalid api_key"
    );
  }


  /*
  |--------------------------------------------------------------------------
  | CHECK DOMAIN
  |--------------------------------------------------------------------------
  */

  var applicationDomain =
    normalizeDomain(
      application.domain
    );

  if (
    !applicationDomain
  ) {
    throw new Error(
      "Application domain is not configured"
    );
  }

  if (
    applicationDomain !==
    incomingDomain
  ) {
    throw new Error(
      "Domain does not match this api_key"
    );
  }


  /*
  |--------------------------------------------------------------------------
  | USER ID REQUIRED
  |--------------------------------------------------------------------------
  |
  | The Reportli account owner is
  | NEVER trusted from the browser.
  |
  | It comes from:
  |
  | api_key
  |   ↓
  | applications
  |   ↓
  | applications.user_id
  |
  |--------------------------------------------------------------------------
  */

  if (
    !application.user_id
  ) {
    throw new Error(
      "Application is not connected to a Reportli user"
    );
  }


  return {
    application:
      application,

    user_id:
      application.user_id,

    api_key:
      apiKey,

    domain:
      incomingDomain
  };
}


/*
|--------------------------------------------------------------------------
| BUILD HUMAN-READABLE ACTIVITY
|--------------------------------------------------------------------------
*/

function buildActivityMessage(
  event
) {
  var eventName =
    event &&
    event.event_name
      ? event.event_name
      : "";

  if (
    eventName ===
    "SESSION_STARTED"
  ) {
    return "Session started";
  }


  if (
    eventName ===
    "SESSION_END"
  ) {
    return "Session ended";
  }


  if (
    eventName ===
    "page_view"
  ) {
    var path =
      event.page ||
      event.url ||
      "";

    try {
      if (
        path &&
        path.indexOf("http") === 0
      ) {
        path =
          new URL(
            path
          ).pathname;
      }
    } catch (e) {}

    return (
      "Viewed " +
      (
        path ||
        "unknown page"
      )
    );
  }


  if (
    eventName ===
    "click"
  ) {
    var label =
      event.label ||
      "";

    var element =
      event.element &&
      event.element.tag
        ? event.element.tag
        : "element";

    if (
      label &&
      label !==
        "(no label)"
    ) {
      return (
        'Clicked "' +
        label +
        '"'
      );
    }

    return (
      "Clicked " +
      element
    );
  }


  if (
    eventName ===
    "navigation"
  ) {
    return (
      "Navigated " +
      (
        event.from ||
        "unknown"
      ) +
      " → " +
      (
        event.to ||
        "unknown"
      )
    );
  }


  if (
    eventName ===
    "identify"
  ) {
    return (
      "Identified as " +
      (
        event.email ||
        event.user_id ||
        "unknown user"
      )
    );
  }


  if (
    eventName ===
    "error_occurred"
  ) {
    return "Error occurred";
  }


  return (
    eventName ||
    "Activity"
  );
}


/*
|--------------------------------------------------------------------------
| SAVE ACTIVITY
|--------------------------------------------------------------------------
|
| TABLE:
|
| user_activity
|
| id          -> automatic
| user_id     -> applications.user_id
| session_id
| time        -> event timestamp
| event       -> JSONB
| api_key
|
|--------------------------------------------------------------------------
*/

async function saveActivity(
  env,
  event,
  applicationInfo
) {
  var eventTime =
    event.time ||
    event.timestamp ||
    new Date().toISOString();


  var activityMessage =
    buildActivityMessage(
      event
    );


  /*
  |--------------------------------------------------------------------------
  | IMPORTANT
  |--------------------------------------------------------------------------
  |
  | event column is JSONB.
  |
  | Therefore we save a JSON
  | object, NOT a string.
  |
  |--------------------------------------------------------------------------
  */

  var eventJson = {
    event_name:
      event.event_name ||
      "activity",

    message:
      activityMessage,

    local_time_display:
      event.local_time_display ||
      null,

    domain:
      applicationInfo.domain,

    page:
      event.page ||
      event.url ||
      null,

    email:
      event.email ||
      null,

    customer_user_id:
      event.user_id ||
      null
  };


  /*
  |--------------------------------------------------------------------------
  | Preserve useful event-specific
  | information.
  |--------------------------------------------------------------------------
  */

  if (
    event.label
  ) {
    eventJson.label =
      event.label;
  }

  if (
    event.element
  ) {
    eventJson.element =
      event.element;
  }

  if (
    event.from
  ) {
    eventJson.from =
      event.from;
  }

  if (
    event.to
  ) {
    eventJson.to =
      event.to;
  }

  if (
    event.duration_ms !=
      null
  ) {
    eventJson.duration_ms =
      event.duration_ms;
  }

  if (
    event.started_at
  ) {
    eventJson.started_at =
      event.started_at;
  }


  var activityRow = {
    user_id:
      applicationInfo.user_id,

    session_id:
      event.session_id ||
      null,

    time:
      eventTime,

    event:
      eventJson,

    api_key:
      applicationInfo.api_key
  };


  await insertSupabase(
    env,
    "user_activity",
    activityRow
  );

  return true;
}


/*
|--------------------------------------------------------------------------
| SAVE ERROR ACTIVITY
|--------------------------------------------------------------------------
*/

async function saveErrorActivity(
  env,
  event,
  applicationInfo
) {
  var errorActivity = {
    event_name:
      "error_occurred",

    local_time_display:
      event.local_time_display ||
      null,

    page:
      event.page ||
      null,

    error_message:
      event.error_message ||
      "Unknown error",

    context:
      event.context ||
      "unknown"
  };


  var activityRow = {
    user_id:
      applicationInfo.user_id,

    session_id:
      event.session_id ||
      null,

    time:
      event.timestamp ||
      new Date().toISOString(),

    event:
      errorActivity,

    api_key:
      applicationInfo.api_key
  };


  await insertSupabase(
    env,
    "user_activity",
    activityRow
  );

  return true;
}


/*
|--------------------------------------------------------------------------
| SARVAM AI - ERROR ANALYSIS
|--------------------------------------------------------------------------
|
| Current Sarvam endpoint:
|
| POST /v1/chat/completions
|
| Model:
|
| sarvam-105b
|
| We explicitly disable reasoning
| for this short production-error
| explanation so the answer does not
| consume the whole max_tokens budget.
|
|--------------------------------------------------------------------------
*/

async function generateAiAnalysis(
  env,
  event
) {
  var location =
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


  var stack =
    event.stack_trace ||
    "No stack trace available";


  var errorMessage =
    event.error_message ||
    "Unknown error";


  /*
  |--------------------------------------------------------------------------
  | SARVAM KEY MISSING
  |--------------------------------------------------------------------------
  */

  if (
    !env.SARVAM_API_KEY
  ) {
    console.error(
      "SARVAM_API_KEY is missing"
    );

    return (
      errorMessage +
      "\n\nCause:\n" +
      "AI analysis is unavailable because SARVAM_API_KEY is not configured." +
      "\n\nRecommended:\n" +
      "Configure SARVAM_API_KEY in the Cloudflare Worker secrets." +
      "\n\nLocation:\n" +
      location +
      "\n\nStack trace:\n" +
      stack
    );
  }


  /*
  |--------------------------------------------------------------------------
  | PROMPT
  |--------------------------------------------------------------------------
  */

  var prompt =
    "You are an expert production software engineer analyzing a real application error.\n\n" +

    "Analyze the error using the error message, stack trace, context, page, and exact code location.\n\n" +

    "Your answer MUST use exactly this structure:\n\n" +

    "[One or two concise sentences explaining what happened and why.]\n\n" +

    "Cause:\n" +
    "[One or two concise sentences explaining the likely root cause.]\n\n" +

    "Recommended:\n" +
    "[One or two concise actionable sentences explaining what the developer should check or change.]\n\n" +

    "Location:\n" +
    location +
    "\n\n" +

    "Stack trace:\n" +
    stack +
    "\n\n" +

    "Rules:\n" +
    "- Plain text only.\n" +
    "- No Markdown.\n" +
    "- No # headings.\n" +
    "- No emojis.\n" +
    "- Do not invent facts that are not supported by the error.\n" +
    "- If the exact root cause cannot be known, say it is likely or unknown.\n" +
    "- Do not modify the Location section.\n" +
    "- Do not modify the Stack trace section.\n" +
    "- Return ONLY the final analysis.\n\n" +

    "Error message:\n" +
    errorMessage +
    "\n\n" +

    "Context:\n" +
    (
      event.context ||
      "unknown"
    ) +
    "\n\n" +

    "Page:\n" +
    (
      event.page ||
      "unknown"
    );


  try {
    var sarvamResponse =
      await fetch(
        "https://api.sarvam.ai/v1/chat/completions",
        {
          method:
            "POST",

          headers: {
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

                /*
                Important:
                Disable reasoning for
                this short explanation.
                */

                reasoning_effort:
                  null,

                max_tokens:
                  1000,

                temperature:
                  0.2
              }
            )
        }
      );


    /*
    |--------------------------------------------------------------------------
    | CHECK HTTP STATUS
    |--------------------------------------------------------------------------
    */

    var responseText =
      await sarvamResponse.text();


    if (
      !sarvamResponse.ok
    ) {
      console.error(
        "SARVAM HTTP ERROR",
        {
          status:
            sarvamResponse.status,

          response:
            responseText
        }
      );

      throw new Error(
        "Sarvam HTTP " +
          sarvamResponse.status +
          ": " +
          responseText
      );
    }


    /*
    |--------------------------------------------------------------------------
    | PARSE RESPONSE
    |--------------------------------------------------------------------------
    */

    var sarvamData;

    try {
      sarvamData =
        JSON.parse(
          responseText
        );

    } catch (e) {
      throw new Error(
        "Sarvam returned invalid JSON"
      );
    }


    var content =
      sarvamData &&
      sarvamData.choices &&
      sarvamData.choices[0] &&
      sarvamData.choices[0].message
        ? sarvamData
            .choices[0]
            .message
            .content
        : null;


    if (
      !content ||
      !String(content).trim()
    ) {
      throw new Error(
        "Sarvam returned an empty response"
      );
    }


    /*
    |--------------------------------------------------------------------------
    | CLEAN RESPONSE
    |--------------------------------------------------------------------------
    */

    return String(
      content
    ).trim();


  } catch (error) {
    console.error(
      "Sarvam AI analysis failed:",
      error &&
        error.message
        ? error.message
        : error
    );


    /*
    |--------------------------------------------------------------------------
    | SAFE FALLBACK
    |--------------------------------------------------------------------------
    */

    return (
      errorMessage +
      "\n\nCause:\n" +
      "Unable to determine the root cause automatically because AI analysis failed." +
      "\n\nRecommended:\n" +
      "Review the error message, exact location, and stack trace manually." +
      "\n\nLocation:\n" +
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
| TABLE:
|
| errors
|
| id
| api_key
| error_message
| timestamp
| ai_analysis
| user_id
|
|--------------------------------------------------------------------------
*/

async function saveError(
  env,
  event,
  applicationInfo
) {
  /*
  |--------------------------------------------------------------------------
  | ERROR ID
  |--------------------------------------------------------------------------
  */

  var errorId =
    "err_" +
    crypto.randomUUID();


  /*
  |--------------------------------------------------------------------------
  | TIMESTAMP
  |--------------------------------------------------------------------------
  */

  var timestamp =
    event.timestamp ||
    new Date().toISOString();


  /*
  |--------------------------------------------------------------------------
  | AI ANALYSIS
  |--------------------------------------------------------------------------
  */

  var aiAnalysis =
    await generateAiAnalysis(
      env,
      event
    );


  /*
  |--------------------------------------------------------------------------
  | ERROR ROW
  |--------------------------------------------------------------------------
  */

  var errorRow = {
    id:
      errorId,

    api_key:
      applicationInfo.api_key,

    error_message:
      event.error_message ||
      "Unknown error",

    timestamp:
      timestamp,

    ai_analysis:
      aiAnalysis,

    user_id:
      applicationInfo.user_id
  };


  console.log(
    "Saving Reportli error:",
    {
      id:
        errorId,

      api_key:
        applicationInfo.api_key,

      user_id:
        applicationInfo.user_id,

      error_message:
        event.error_message,

      timestamp:
        timestamp
    }
  );


  /*
  |--------------------------------------------------------------------------
  | INSERT ERROR
  |--------------------------------------------------------------------------
  */

  await insertSupabase(
    env,
    "errors",
    errorRow
  );


  /*
  |--------------------------------------------------------------------------
  | COMPANION ACTIVITY
  |--------------------------------------------------------------------------
  */

  try {
    await saveErrorActivity(
      env,
      event,
      applicationInfo
    );

  } catch (error) {
    /*
    The actual error record
    has already been saved.
    */

    console.error(
      "Error activity insert failed:",
      error &&
        error.message
        ? error.message
        : error
    );
  }


  console.log(
    "Reportli error saved successfully:",
    errorId
  );


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
  | VALIDATE API KEY + DOMAIN FIRST
  |--------------------------------------------------------------------------
  */

  var applicationInfo =
    await validateApplication(
      env,
      event
    );


  /*
  |--------------------------------------------------------------------------
  | ERROR
  |--------------------------------------------------------------------------
  */

  if (
    event.type ===
    "ERROR"
  ) {
    await saveError(
      env,
      event,
      applicationInfo
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
  | ACTIVITY
  |--------------------------------------------------------------------------
  */

  await saveActivity(
    env,
    event,
    applicationInfo
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
    | ENVIRONMENT CHECK
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

          headers: {
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
    | URL
    |--------------------------------------------------------------------------
    */

    var url =
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
    | SERVE SDK
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
      request.method ===
      "POST"
    ) {
      try {

        /*
        Parse JSON.
        */

        var body =
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

          var results =
            [];

          for (
            var i = 0;
            i <
              body.events.length;
            i++
          ) {

            var event =
              body.events[i];

            try {

              /*
              Each event is independently
              validated before processing.
              */

              var result =
                await processEvent(
                  env,
                  event
                );

              results.push(
                result
              );

            } catch (error) {

              console.error(
                "Batch event failed:",
                error &&
                  error.message
                  ? error.message
                  : error
              );

              results.push(
                {
                  success:
                    false,

                  error:
                    error &&
                      error.message
                      ? error.message
                      : "Event processing failed"
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

        var result =
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
          error &&
            error.message
            ? error.message
            : error
        );


        return new Response(
          JSON.stringify(
            {
              success:
                false,

              error:
                error &&
                  error.message
                  ? error.message
                  : "Internal server error"
            }
          ),
          {
            status:
              500,

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

        headers: {
          "Content-Type":
            "application/json",

          ...corsHeaders()
        }
      }
    );
  }
};
