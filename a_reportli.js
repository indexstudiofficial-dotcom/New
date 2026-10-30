/*
|--------------------------------------------------------------------------
| REPORTLI AI - CLOUDFLARE WORKER
|--------------------------------------------------------------------------
|
| ROUTES:
|
| GET  /                 -> Health check
| GET  /reportli.js      -> Browser SDK
| GET  /a_reportli.js    -> Browser SDK
| POST /                 -> Event ingestion
| OPTIONS               -> CORS
|
|--------------------------------------------------------------------------
| FEATURES
|--------------------------------------------------------------------------
|
| 1. Session tracking
| 2. Page view tracking
| 3. Click tracking
| 4. SPA navigation tracking
| 5. Manual error activity (Error occurred only)
| 6. Subscription verification
| 7. Supabase activity storage
|
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| CONFIGURATION
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
  | CONFIGURATION
  |--------------------------------------------------------------------------
  */

  var WORKER_URL =
    "${WORKER_URL}";


  /*
  |--------------------------------------------------------------------------
  | API KEY
  |--------------------------------------------------------------------------
  */

  function getApiKey() {

    try {

      if (window.REPORTLI_AI_KEY) {

        return String(
          window.REPORTLI_AI_KEY
        ).trim();

      }

    } catch (e) {}


    try {

      var currentScript =
        document.currentScript;

      if (currentScript) {

        var currentKey =
          currentScript.getAttribute(
            "data-key"
          );

        if (currentKey) {

          return String(
            currentKey
          ).trim();

        }

      }

    } catch (e) {}


    try {

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
          src.indexOf("reportli.js") !== -1 ||
          src.indexOf("a_reportli.js") !== -1
        ) {

          var key =
            script.getAttribute(
              "data-key"
            );

          if (key) {

            return String(
              key
            ).trim();

          }

        }

      }

    } catch (e) {}


    return null;

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
            window.reportliUser.email ||
            null,

          user_id:
            window.reportliUser.userId ||
            null

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

      return new Date()
        .toLocaleTimeString(
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
  | DOMAIN
  |--------------------------------------------------------------------------
  */

  function getDomain() {

    try {

      return (
        window.location.hostname ||
        ""
      )
        .trim()
        .toLowerCase()
        .replace(/\.$/, "");

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
        getDomain(),

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

  function send(payload, useBeacon) {

    if (!API_KEY) {
      return;
    }

    try {

      var body =
        JSON.stringify(payload);


      /*
      |--------------------------------------------------------------------------
      | SEND BEACON
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
                type: "application/json"
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
          Reportli must never
          break the customer's app.
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

  function track(eventName, data) {

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

          type: "ACTIVITY",

          api_key: API_KEY,

          session_id: SESSION_ID,

          event: eventPayload

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

  function getElementInfo(element) {

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


      var className = null;

      try {

        if (
          typeof element.className === "string"
        ) {

          className =
            element.className;

        }

      } catch (e) {}


      var href = null;

      try {

        href =
          element.href || null;

      } catch (e) {}


      var name = null;

      try {

        name =
          element.getAttribute("name");

      } catch (e) {}


      var ariaLabel = null;

      try {

        ariaLabel =
          element.getAttribute("aria-label");

      } catch (e) {}


      return {

        tag: tag,

        text: text,

        id: id,

        class_name: className,

        href: href,

        name: name,

        aria_label: ariaLabel

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


        var clickable = null;

        try {

          clickable =
            target.closest(
              "button,a,input,select,textarea,[role='button'],[onclick]"
            );

        } catch (e) {}


        clickable =
          clickable || target;


        var info =
          getElementInfo(clickable);


        track(
          "click",
          {

            element: info,

            label:
              (
                info.text ||
                info.aria_label ||
                ""
              ).trim() ||
              "(no label)",

            x: event.clientX,

            y: event.clientY

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


  /*
  |--------------------------------------------------------------------------
  | NAVIGATION HANDLER
  |--------------------------------------------------------------------------
  */

  function handleNavigation() {

    try {

      var previousPath =
        CURRENT_PATH;

      var newPath =
        window.location.pathname;


      if (newPath !== previousPath) {

        track(
          "navigation",
          {

            from: previousPath,

            to: newPath

          }
        );


        CURRENT_PATH =
          newPath;

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

    var originalPushState =
      history.pushState;


    history.pushState =
      function () {

        var result =
          originalPushState.apply(
            history,
            arguments
          );


        setTimeout(
          handleNavigation,
          0
        );


        return result;

      };

  } catch (e) {}


  /*
  |--------------------------------------------------------------------------
  | HISTORY REPLACE STATE
  |--------------------------------------------------------------------------
  */

  try {

    var originalReplaceState =
      history.replaceState;


    history.replaceState =
      function () {

        var result =
          originalReplaceState.apply(
            history,
            arguments
          );


        setTimeout(
          handleNavigation,
          0
        );


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
  | PUBLIC API
  |--------------------------------------------------------------------------
  */

  window.Reportli = {

    /*
    |--------------------------------------------------------------------------
    | CUSTOM ACTIVITY
    |--------------------------------------------------------------------------
    */

    track: function (eventName, properties) {

      track(
        eventName,
        properties || {}
      );

    },


    /*
    |--------------------------------------------------------------------------
    | IDENTIFY USER
    |--------------------------------------------------------------------------
    */

    identify: function (email, userId) {

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


    /*
    |--------------------------------------------------------------------------
    | SESSION ID
    |--------------------------------------------------------------------------
    */

    getSessionId: function () {

      return SESSION_ID;

    },


    /*
    |--------------------------------------------------------------------------
    | USER
    |--------------------------------------------------------------------------
    */

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

              event_name: "SESSION_END",

              duration_ms: duration

            }
          )

        },
        true
      );

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
*/

function normalizeDomain(domain) {

  if (typeof domain !== "string") {
    return "";
  }

  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/\.$/, "");

}


/*
|--------------------------------------------------------------------------
| SUPABASE REQUEST
|--------------------------------------------------------------------------
*/

async function supabaseRequest(env, path, options) {

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


  const base =
    env.SUPABASE_URL.replace(/\/+$/, "");


  return fetch(
    base + path,
    {

      ...(options || {}),

      headers: {

        ...(options && options.headers
          ? options.headers
          : {}),

        "apikey":
          env.SUPABASE_SERVICE_ROLE_KEY,

        "Authorization":
          "Bearer " +
          env.SUPABASE_SERVICE_ROLE_KEY

      }

    }
  );

}


/*
|--------------------------------------------------------------------------
| SUPABASE INSERT
|--------------------------------------------------------------------------
*/

async function insertSupabase(env, table, data) {

  const response =
    await supabaseRequest(
      env,
      "/rest/v1/" + table,
      {

        method: "POST",

        headers: {

          "Content-Type":
            "application/json",

          "Prefer":
            "return=minimal"

        },

        body:
          JSON.stringify(data)

      }
    );


  const responseText =
    await response.text();


  if (!response.ok) {

    console.error(
      "SUPABASE INSERT FAILED",
      {

        table: table,

        status: response.status,

        response: responseText

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
| GET APPLICATION
|--------------------------------------------------------------------------
|
| API KEY AND DOMAIN MUST BOTH MATCH.
|
|--------------------------------------------------------------------------
*/

async function getApplicationForEvent(env, event, request) {

  const apiKey =
    typeof event.api_key === "string"
      ? event.api_key.trim()
      : "";


  if (!apiKey) {

    throw new Error(
      "API key is required"
    );

  }


  /*
  |--------------------------------------------------------------------------
  | GET DOMAIN
  |--------------------------------------------------------------------------
  |
  | SDK sends domain inside event.event.domain.
  | Also support older event formats.
  |
  |--------------------------------------------------------------------------
  */

  let domain =
    normalizeDomain(
      event.domain ||
      (
        event.event &&
        event.event.domain
      ) ||
      ""
    );


  if (!domain) {

    const origin =
      request &&
      request.headers
        ? request.headers.get("Origin")
        : null;


    if (origin) {

      domain =
        normalizeDomain(origin);

    }

  }


  if (!domain) {

    throw new Error(
      "Domain is required"
    );

  }


  /*
  |--------------------------------------------------------------------------
  | APPLICATION LOOKUP
  |--------------------------------------------------------------------------
  */

  const params =
    new URLSearchParams({

      select:
        "id,name,api_key,user_id,domain",

      api_key:
        "eq." + apiKey,

      domain:
        "eq." + domain,

      limit:
        "1"

    });


  const response =
    await supabaseRequest(
      env,
      "/rest/v1/applications?" +
        params.toString(),
      {

        method: "GET"

      }
    );


  const responseText =
    await response.text();


  if (!response.ok) {

    console.error(
      "APPLICATION LOOKUP FAILED",
      {

        status: response.status,

        response: responseText

      }
    );


    throw new Error(
      "Application lookup failed"
    );

  }


  let rows = [];

  try {

    rows =
      JSON.parse(responseText);

  } catch (e) {

    throw new Error(
      "Invalid application lookup response"
    );

  }


  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {

    throw new Error(
      "Invalid API key or domain"
    );

  }


  const application =
    rows[0];


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
| ACTIVE:
| Allow tracking.
|
| NULL:
| Change subscription_status to Active.
| Allow tracking only after successful update.
|
| OTHER STATUS:
| Reject tracking.
|
| NO SUBSCRIPTION:
| Reject tracking.
|
|--------------------------------------------------------------------------
*/

async function checkUserSubscription(env, userId) {

  if (!userId) {
    return false;
  }


  const params =
    new URLSearchParams({

      select:
        "id,user_id,subscription_status",

      user_id:
        "eq." + userId,

      limit:
        "1"

    });


  const response =
    await supabaseRequest(
      env,
      "/rest/v1/user_subscriptions?" +
        params.toString(),
      {

        method: "GET"

      }
    );


  const responseText =
    await response.text();


  if (!response.ok) {

    console.error(
      "SUBSCRIPTION LOOKUP FAILED",
      responseText
    );


    throw new Error(
      "Subscription lookup failed"
    );

  }


  let rows = [];

  try {

    rows =
      JSON.parse(responseText);

  } catch (e) {

    throw new Error(
      "Invalid subscription response"
    );

  }


  /*
  |--------------------------------------------------------------------------
  | NO SUBSCRIPTION
  |--------------------------------------------------------------------------
  */

  if (
    !Array.isArray(rows) ||
    rows.length === 0
  ) {

    console.log(
      "No subscription found for user:",
      userId
    );

    return false;

  }


  const subscription =
    rows[0];


  /*
  |--------------------------------------------------------------------------
  | NULL -> ACTIVE
  |--------------------------------------------------------------------------
  */

  if (
    subscription.subscription_status === null
  ) {

    const updateResponse =
      await supabaseRequest(
        env,
        "/rest/v1/user_subscriptions?id=eq." +
          subscription.id,
        {

          method: "PATCH",

          headers: {

            "Content-Type":
              "application/json",

            "Prefer":
              "return=minimal"

          },

          body:
            JSON.stringify({

              subscription_status: "Active",

              updated_at:
                new Date().toISOString()

            })

        }
      );


    const updateText =
      await updateResponse.text();


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


  /*
  |--------------------------------------------------------------------------
  | ONLY ACTIVE SUBSCRIPTIONS
  |--------------------------------------------------------------------------
  */

  const status =
    String(
      subscription.subscription_status
    )
      .trim()
      .toLowerCase();


  if (status === "active") {

    return true;

  }


  console.log(
    "Subscription inactive:",
    {

      user_id: userId,

      status: subscription.subscription_status

    }
  );


  return false;

}


/*
|--------------------------------------------------------------------------
| BUILD ACTIVITY MESSAGE
|--------------------------------------------------------------------------
*/

function buildActivityString(eventWrapper) {

  const inner =
    eventWrapper &&
    eventWrapper.event
      ? eventWrapper.event
      : {};


  const localTime =
    inner.local_time_display || "";


  const eventName =
    inner.event_name || "";


  let activityText = "";


  /*
  |--------------------------------------------------------------------------
  | SESSION START
  |--------------------------------------------------------------------------
  */

  if (eventName === "SESSION_STARTED") {

    activityText =
      "Session started";

  }


  /*
  |--------------------------------------------------------------------------
  | SESSION END
  |--------------------------------------------------------------------------
  */

  else if (eventName === "SESSION_END") {

    activityText =
      "Session ended";

  }


  /*
  |--------------------------------------------------------------------------
  | PAGE VIEW
  |--------------------------------------------------------------------------
  */

  else if (eventName === "page_view") {

    let path =
      inner.page ||
      inner.url ||
      "";


    try {

      if (
        path &&
        path.indexOf("http") === 0
      ) {

        path =
          new URL(path).pathname;

      }

    } catch (e) {}


    activityText =
      "Viewed " +
      (path || "unknown page");

  }


  /*
  |--------------------------------------------------------------------------
  | CLICK
  |--------------------------------------------------------------------------
  */

  else if (eventName === "click") {

    const label =
      inner.label || "(no label)";


    const element =
      inner.element &&
      inner.element.tag
        ? inner.element.tag
        : "element";


    if (
      label &&
      label !== "(no label)"
    ) {

      activityText =
        'Clicked "' + label + '"';

    } else {

      activityText =
        "Clicked " + element;

    }

  }


  /*
  |--------------------------------------------------------------------------
  | NAVIGATION
  |--------------------------------------------------------------------------
  */

  else if (eventName === "navigation") {

    const from =
      inner.from || "unknown";


    const to =
      inner.to || "unknown";


    activityText =
      "Navigated " +
      from +
      " → " +
      to;

  }


  /*
  |--------------------------------------------------------------------------
  | IDENTIFY
  |--------------------------------------------------------------------------
  */

  else if (eventName === "identify") {

    activityText =
      "Identified as " +
      (
        inner.email ||
        inner.user_id ||
        "unknown user"
      );

  }


  /*
  |--------------------------------------------------------------------------
  | SIMPLE ERROR ACTIVITY
  |--------------------------------------------------------------------------
  |
  | No error message.
  | No stack trace.
  | No technical details.
  |
  |--------------------------------------------------------------------------
  */

  else if (eventName === "error_occurred") {

    activityText =
      "Error occurred";

  }


  /*
  |--------------------------------------------------------------------------
  | OTHER ACTIVITY
  |--------------------------------------------------------------------------
  */

  else {

    activityText =
      eventName || "Activity";

  }


  /*
  |--------------------------------------------------------------------------
  | ADD LOCAL TIME
  |--------------------------------------------------------------------------
  */

  if (localTime) {

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

async function saveActivity(env, event, application) {

  const activityString =
    buildActivityString(event);


  const inner =
    event.event || {};


  /*
  |--------------------------------------------------------------------------
  | JSONB ACTIVITY DATA
  |--------------------------------------------------------------------------
  */

  const activity = {

    id:
      "act_" + crypto.randomUUID(),

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

      message:
        activityString,

      event_name:
        inner.event_name || "unknown"

    },

    status:
      "Active"

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
|
| 1. Validate API key.
| 2. Validate domain.
| 3. Find application.
| 4. Check subscription.
| 5. Save activity.
|
|--------------------------------------------------------------------------
*/

async function processEvent(env, event, request) {

  if (!event) {

    throw new Error(
      "Empty event"
    );

  }


  /*
  |--------------------------------------------------------------------------
  | API KEY FALLBACK
  |--------------------------------------------------------------------------
  */

  if (
    !event.api_key &&
    request &&
    request.headers
  ) {

    const headerKey =
      request.headers.get("x-api-key");


    if (headerKey) {

      event.api_key =
        headerKey.trim();

    }

  }


  /*
  |--------------------------------------------------------------------------
  | APPLICATION VALIDATION
  |--------------------------------------------------------------------------
  */

  const application =
    await getApplicationForEvent(
      env,
      event,
      request
    );


  /*
  |--------------------------------------------------------------------------
  | SUBSCRIPTION VALIDATION
  |--------------------------------------------------------------------------
  */

  const subscriptionActive =
    await checkUserSubscription(
      env,
      application.user_id
    );


  if (!subscriptionActive) {

    return {

      success: false,

      processed: false,

      reason:
        "Active subscription required"

    };

  }


  /*
  |--------------------------------------------------------------------------
  | ERROR EVENT
  |--------------------------------------------------------------------------
  |
  | Legacy ERROR requests are supported.
  | Only "Error occurred" is saved.
  |
  |--------------------------------------------------------------------------
  */

  if (event.type === "ERROR") {

    const simpleErrorEvent = {

      api_key:
        event.api_key,

      session_id:
        event.session_id || null,

      timestamp:
        event.timestamp ||
        new Date().toISOString(),

      event: {

        event_name:
          "error_occurred",

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


  /*
  |--------------------------------------------------------------------------
  | NORMAL ACTIVITY
  |--------------------------------------------------------------------------
  */

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

        "Content-Type":
          "application/json",

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

    /*
    |--------------------------------------------------------------------------
    | OPTIONS
    |--------------------------------------------------------------------------
    */

    if (request.method === "OPTIONS") {

      return new Response(
        null,
        {

          status: 204,

          headers:
            corsHeaders()

        }
      );

    }


    /*
    |--------------------------------------------------------------------------
    | URL
    |--------------------------------------------------------------------------
    */

    const url =
      new URL(request.url);


    /*
    |--------------------------------------------------------------------------
    | SERVE BROWSER SDK
    |--------------------------------------------------------------------------
    */

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


    /*
    |--------------------------------------------------------------------------
    | HEALTH CHECK
    |--------------------------------------------------------------------------
    */

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


    /*
    |--------------------------------------------------------------------------
    | ENVIRONMENT VALIDATION
    |--------------------------------------------------------------------------
    */

    if (!env.SUPABASE_URL) {

      return jsonResponse(
        {

          success: false,

          error:
            "SUPABASE_URL is not configured"

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


    /*
    |--------------------------------------------------------------------------
    | POST EVENT
    |--------------------------------------------------------------------------
    */

    if (request.method === "POST") {

      try {

        const body =
          await request.json();


        /*
        |--------------------------------------------------------------------------
        | BATCH EVENTS
        |--------------------------------------------------------------------------
        */

        if (
          body &&
          body.type === "BATCH" &&
          Array.isArray(body.events)
        ) {

          const results = [];


          for (const event of body.events) {

            try {

              const result =
                await processEvent(
                  env,
                  event,
                  request
                );


              results.push(result);

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


          const failed =
            results.filter(
              function (result) {

                return !result.success;

              }
            ).length;


          return jsonResponse(
            {

              success:
                failed === 0,

              processed:
                results.length,

              failed:
                failed,

              results:
                results

            },
            failed === 0 ? 200 : 207
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
            body,
            request
          );


        return jsonResponse(
          result,
          200
        );

      } catch (error) {

        console.error(
          "Reportli Worker error:",
          error.message
        );


        /*
        |--------------------------------------------------------------------------
        | AUTHORIZATION ERRORS
        |--------------------------------------------------------------------------
        */

        if (
          error.message === "API key is required" ||
          error.message === "Domain is required" ||
          error.message === "Invalid API key or domain" ||
          error.message === "Application is not linked to a Reportli user"
        ) {

          return jsonResponse(
            {

              success: false,

              error: error.message

            },
            401
          );

        }


        /*
        |--------------------------------------------------------------------------
        | SERVER ERRORS
        |--------------------------------------------------------------------------
        */

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


    /*
    |--------------------------------------------------------------------------
    | NOT FOUND
    |--------------------------------------------------------------------------
    */

    return jsonResponse(
      {

        success: false,

        error: "Not found"

      },
      404
    );

  }

};
