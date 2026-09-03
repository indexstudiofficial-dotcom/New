/**
 * Reportli AI
 * Single Cloudflare Worker
 *
 * GET  /reportli.js  -> serves the tracking snippet
 * POST /             -> receives tracking events and saves them to Supabase
 */

const REPORTLI_JS = `

(function () {
  "use strict";

  var WORKER_URL = window.location.origin;

  var scriptTag = document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      return scripts[scripts.length - 1];
    })();

  var API_KEY = scriptTag ? scriptTag.getAttribute("data-key") : null;

  if (!API_KEY) {
    console.warn("Reportli: missing data-key attribute on script tag");
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

    try {
      var meta = document.querySelector(
        'meta[name="reportli-user-email"]'
      );

      if (meta && meta.getAttribute("content")) {
        email = meta.getAttribute("content");
      }

      var metaId = document.querySelector(
        'meta[name="reportli-user-id"]'
      );

      if (metaId && metaId.getAttribute("content")) {
        userId = metaId.getAttribute("content");
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

          "x-api-key":
            API_KEY
        },

        body: body,

        keepalive: true

      })
      .then(function (response) {

        return response.text()
          .then(function (text) {

            console.log(
              "Reportli Worker:",
              response.status,
              text
            );

          });

      })
      .catch(function (error) {

        console.error(
          "Reportli Worker Error:",
          error
        );

      });

    } catch (e) {

      console.error(
        "Reportli send error:",
        e
      );

    }
  }

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

        "x-api-key":
          API_KEY
      },

      body: JSON.stringify({
        type: "BATCH",
        events: batch
      }),

      keepalive: true

    })
      .then(function (response) {

        return response.text()
          .then(function (text) {

            console.log(
              "Reportli Batch:",
              response.status,
              text
            );

          });

      })

      .catch(function (error) {

        console.error(
          "Reportli Batch Error:",
          error
        );

      })

      .finally(function () {

        isFlushing = false;

        if (queue.length > 0) {
          flush();
        }

      });
  }

  function trackClick(el) {

    try {

      clickCount++;

      var tag =
        el.tagName
          ? el.tagName.toLowerCase()
          : "unknown";

      var label =
        (
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
            label:
              label || "(no label)"
          }
        )
      );

    } catch (e) {}
  }

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

  function trackNavigation(
    fromPath,
    toPath
  ) {

    try {

      enqueue(
        Object.assign(
          baseFields(),
          {
            type: "ACTIVITY",
            event: "navigation",
            from: fromPath,
            to: toPath
          }
        )
      );

    } catch (e) {}
  }

  function trackError(
    err,
    context
  ) {

    try {

      var message =
        (
          err &&
          err.message
        )
          ? err.message
          : String(err);

      var stack =
        (
          err &&
          err.stack
        )
          ? String(err.stack)
              .slice(0, 3000)
          : "";

      enqueue(
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

      flush();

    } catch (e) {}
  }

  function trackApiFailure(
    kind,
    method,
    url,
    status,
    statusText
  ) {

    try {

      enqueue(
        Object.assign(
          baseFields(),
          {
            type: "ERROR",

            message:
              kind +
              " " +
              status +
              ": " +
              method +
              " " +
              url,

            stack:
              method +
              " " +
              url +
              " -> " +
              status +
              " " +
              statusText,

            context:
              kind.toLowerCase()
          }
        )
      );

      flush();

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

  var currentPath =
    getPage();

  trackPageView();

  function handleUrlChange() {

    var newPath =
      getPage();

    if (
      newPath !==
      currentPath
    ) {

      trackNavigation(
        currentPath,
        newPath
      );

      currentPath =
        newPath;

      trackPageView();
    }
  }

  try {

    var origPushState =
      history.pushState;

    history.pushState =
      function () {

        origPushState.apply(
          history,
          arguments
        );

        handleUrlChange();
      };

    var origReplaceState =
      history.replaceState;

    history.replaceState =
      function () {

        origReplaceState.apply(
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

  window.addEventListener(
    "error",
    function (event) {

      try {

        var target =
          event.target;

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
                String(
                  reason ||
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
            typeof input === "string"
              ? input
              : (
                  input &&
                  input.url
                ) || "";

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

                  trackApiFailure(
                    "Fetch",
                    init.method ||
                      "GET",
                    url,
                    response.status,
                    response.statusText
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
                      (
                        init.method ||
                        "GET"
                      ) +
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
                xhr.status >= 400 ||
                xhr.status === 0
              ) {

                trackApiFailure(
                  "XHR",
                  method,
                  url,
                  xhr.status,
                  xhr.statusText
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
          (
            endMs -
            startMs
          ) / 1000
        );

      var payload =
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
        );

      if (
        queue.length > 0
      ) {

        var remaining =
          queue.splice(
            0,
            queue.length
          );

        send(
          {
            type: "BATCH",
            events: remaining
          },
          true
        );
      }

      send(
        payload,
        true
      );

    } catch (e) {}
  }

  window.addEventListener(
    "beforeunload",
    sendSessionEnd
  );

  document.addEventListener(
    "visibilitychange",
    function () {

      if (
        document.visibilityState ===
        "hidden"
      ) {

        enqueue(
          Object.assign(
            baseFields(),
            {
              type: "ACTIVITY",
              event: "tab_hidden"
            }
          )
        );

        flush();

      } else {

        enqueue(
          Object.assign(
            baseFields(),
            {
              type: "ACTIVITY",
              event: "tab_visible"
            }
          )
        );
      }

    }
  );

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

export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, x-api-key"
    };

    // ─────────────────────────────────
    // CORS
    // ─────────────────────────────────

    if (
      request.method ===
      "OPTIONS"
    ) {

      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders
        }
      );
    }

    // ─────────────────────────────────
    // SERVE reportli.js
    // ─────────────────────────────────

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

            ...corsHeaders
          }
        }
      );
    }

    // ─────────────────────────────────
    // Health check
    // ─────────────────────────────────

    if (
      request.method === "GET"
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
            ...corsHeaders
          }
        }
      );
    }

    // ─────────────────────────────────
    // POST EVENT
    // ─────────────────────────────────

    if (
      request.method !== "POST"
    ) {

      return new Response(
        JSON.stringify({
          success: false,
          error:
            "POST required"
        }),
        {
          status: 405,

          headers: {
            "Content-Type":
              "application/json",
            ...corsHeaders
          }
        }
      );
    }

    try {

      // Read the exact JSON
      // sent by reportli.js

      const body =
        await request.json();

      console.log(
        "REPORTLI RECEIVED:",
        JSON.stringify(body)
      );

      // ─────────────────────────────
      // API KEY
      // ─────────────────────────────

      const apiKey =
        request.headers.get(
          "x-api-key"
        ) ||
        body.api_key ||
        body.apiKey;

      if (!apiKey) {

        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Missing API key"
          }),
          {
            status: 401,

            headers: {
              "Content-Type":
                "application/json",
              ...corsHeaders
            }
          }
        );
      }

      // ─────────────────────────────
      // SUPABASE INSERT
      // ─────────────────────────────

      const supabaseResponse =
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
                "return=representation"
            },

            body:
              JSON.stringify({

                user_id:
                  body.user_id ||
                  "anonymous",

                session_id:
                  body.session_id ||
                  null,

                time:
                  body.time ||
                  new Date().toISOString(),

                // COMPLETE ORIGINAL
                // MESSAGE
                event:
                  body
              })
          }
        );

      const supabaseText =
        await supabaseResponse.text();

      console.log(
        "SUPABASE STATUS:",
        supabaseResponse.status
      );

      console.log(
        "SUPABASE RESPONSE:",
        supabaseText
      );

      // ─────────────────────────────
      // SUPABASE ERROR
      // ─────────────────────────────

      if (
        !supabaseResponse.ok
      ) {

        return new Response(
          JSON.stringify({

            success: false,

            stage:
              "supabase",

            status:
              supabaseResponse.status,

            error:
              supabaseText

          }),
          {
            status: 500,

            headers: {
              "Content-Type":
                "application/json",

              ...corsHeaders
            }
          }
        );
      }

      // ─────────────────────────────
      // SUCCESS
      // ─────────────────────────────

      return new Response(
        JSON.stringify({

          success: true,

          message:
            "Event saved to Supabase",

          received:
            body,

          supabase:
            supabaseText

        }),
        {
          status: 200,

          headers: {
            "Content-Type":
              "application/json",

            ...corsHeaders
          }
        }
      );

    } catch (error) {

      console.error(
        "REPORTLI WORKER ERROR:",
        error
      );

      return new Response(
        JSON.stringify({

          success: false,

          stage:
            "worker",

          error:
            error.message

        }),
        {
          status: 500,

          headers: {
            "Content-Type":
              "application/json",

            ...corsHeaders
          }
        }
      );
    }
  }
};
