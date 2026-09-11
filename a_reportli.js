// ============================================================
// REPORTLI AI - CLOUDFLARE WORKER
// ============================================================
//
// Routes:
//
// GET  /                 -> health check
// GET  /reportli.js      -> browser SDK
// GET  /a_reportli.js    -> browser SDK
// POST /                 -> receive events
// OPTIONS               -> CORS
//
// Required Worker secrets:
//
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
// SARVAM_API_KEY
//
// Supabase tables:
//
// public.users
// public.applications
// public.user_activity
// public.errors
//
// ============================================================


// ============================================================
// CONFIG
// ============================================================

const WORKER_URL =
  "https://reportliai-sbs.reportliaihq.workers.dev";

const SARVAM_URL =
  "https://api.sarvam.ai/v1/chat/completions";


// ============================================================
// CORS
// ============================================================

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key",
    "Access-Control-Max-Age": "86400"
  };
}


function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    }
  );
}


// ============================================================
// GENERAL HELPERS
// ============================================================

function safeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}


function createId(prefix = "id") {
  return (
    prefix +
    "_" +
    crypto.randomUUID().replace(/-/g, "")
  );
}


function normalizeDomain(domain) {
  if (
    typeof domain !== "string" ||
    !domain.trim()
  ) {
    return "";
  }

  let value = domain.trim().toLowerCase();

  // Remove protocol if somebody accidentally sends it.
  value = value.replace(/^https?:\/\//, "");

  // Remove path.
  value = value.split("/")[0];

  // Remove port.
  value = value.split(":")[0];

  // Remove trailing dot.
  value = value.replace(/\.$/, "");

  return value;
}


function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString(
      "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }
    );
  } catch {
    return "";
  }
}


// ============================================================
// SUPABASE
// ============================================================

function getSupabaseConfig(env) {
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is missing");
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing"
    );
  }

  return {
    url: env.SUPABASE_URL.replace(/\/$/, ""),
    key: env.SUPABASE_SERVICE_ROLE_KEY
  };
}


async function supabaseRequest(
  env,
  path,
  options = {}
) {
  const config = getSupabaseConfig(env);

  const headers = {
    "apikey": config.key,
    "Authorization": `Bearer ${config.key}`,
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
    ...(options.headers || {})
  };

  return fetch(
    `${config.url}${path}`,
    {
      ...options,
      headers
    }
  );
}


async function insertSupabase(
  env,
  table,
  row
) {
  const response = await supabaseRequest(
    env,
    `/rest/v1/${table}`,
    {
      method: "POST",
      body: JSON.stringify(row)
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase insert failed for ${table}: HTTP ${response.status} - ${text}`
    );
  }

  return true;
}


// ============================================================
// APPLICATION VALIDATION
// ============================================================
//
// IMPORTANT:
//
// Browser sends:
//
// api_key
// domain
//
// Worker searches:
//
// applications.api_key
// applications.domain
//
// Worker NEVER trusts a browser-supplied user_id.
//
// ============================================================

async function getApplicationForEvent(
  env,
  event
) {
  try {
    if (
      !event ||
      typeof event !== "object" ||
      Array.isArray(event)
    ) {
      throw new Error(
        "Invalid event object"
      );
    }

    const apiKey =
      typeof event.api_key === "string"
        ? event.api_key.trim()
        : "";

    const domain =
      normalizeDomain(event.domain);

    console.log(
      "REPORTLI EVENT VALIDATION",
      {
        event_type: event.type || null,

        api_key_present: !!apiKey,

        api_key_preview:
          apiKey
            ? apiKey.substring(0, 12) + "..."
            : null,

        received_domain:
          event.domain || null,

        normalized_domain:
          domain || null,

        session_id:
          event.session_id || null
      }
    );


    // --------------------------------------------------------
    // API KEY REQUIRED
    // --------------------------------------------------------

    if (!apiKey) {
      throw new Error(
        "API key is required"
      );
    }


    // --------------------------------------------------------
    // DOMAIN REQUIRED
    // --------------------------------------------------------

    if (!domain) {
      throw new Error(
        "Domain is required"
      );
    }


    // --------------------------------------------------------
    // QUERY APPLICATION
    // --------------------------------------------------------

    const params =
      new URLSearchParams();

    params.set(
      "select",
      "id,name,api_key,user_id,domain,status"
    );

    params.set(
      "api_key",
      `eq.${apiKey}`
    );

    params.set(
      "domain",
      `eq.${domain}`
    );

    params.set(
      "limit",
      "1"
    );


    const response =
      await supabaseRequest(
        env,
        `/rest/v1/applications?${params.toString()}`,
        {
          method: "GET"
        }
      );


    const responseText =
      await response.text();


    // --------------------------------------------------------
    // SUPABASE LOOKUP ERROR
    // --------------------------------------------------------

    if (!response.ok) {
      console.error(
        "REPORTLI APPLICATION LOOKUP FAILED",
        {
          status: response.status,
          response: responseText,
          domain
        }
      );

      throw new Error(
        `Application lookup failed: Supabase HTTP ${response.status}`
      );
    }


    // --------------------------------------------------------
    // PARSE RESULT
    // --------------------------------------------------------

    let rows;

    try {
      rows =
        JSON.parse(responseText);
    } catch {
      throw new Error(
        "Invalid application lookup response from Supabase"
      );
    }


    // --------------------------------------------------------
    // APPLICATION NOT FOUND
    // --------------------------------------------------------

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {
      console.error(
        "REPORTLI APPLICATION NOT FOUND",
        {
          domain,
          api_key_present: true
        }
      );

      throw new Error(
        "Invalid API key or domain"
      );
    }


    const application =
      rows[0];


    console.log(
      "REPORTLI APPLICATION FOUND",
      {
        application_id:
          application.id,

        application_name:
          application.name,

        application_domain:
          application.domain,

        application_status:
          application.status,

        has_user_id:
          !!application.user_id
      }
    );


    // --------------------------------------------------------
    // APPLICATION MUST HAVE REPORTLI USER
    // --------------------------------------------------------

    if (!application.user_id) {
      console.error(
        "REPORTLI APPLICATION HAS NO USER",
        {
          application_id:
            application.id,

          application_name:
            application.name,

          domain:
            application.domain
        }
      );

      throw new Error(
        "Application is not linked to a Reportli user"
      );
    }


    return application;

  } catch (error) {

    console.error(
      "REPORTLI getApplicationForEvent FAILED",
      {
        message:
          error?.message ||
          String(error),

        stack:
          error?.stack || null,

        event_type:
          event?.type || null,

        event_domain:
          event?.domain || null
      }
    );

    throw error;
  }
}


// ============================================================
// HUMAN READABLE ACTIVITY
// ============================================================

function buildActivityString(event) {

  const eventObject =
    event?.event || {};

  const eventName =
    safeString(
      eventObject.event_name ||
      eventObject.name ||
      event.event_name ||
      event.name
    ).toLowerCase();


  let message = "Activity";


  // ----------------------------------------------------------
  // SESSION
  // ----------------------------------------------------------

  if (
    eventName === "session_started"
  ) {
    message =
      "Session started";
  }


  else if (
    eventName === "session_end" ||
    eventName === "session_ended"
  ) {
    message =
      "Session ended";
  }


  // ----------------------------------------------------------
  // PAGE VIEW
  // ----------------------------------------------------------

  else if (
    eventName === "page_view"
  ) {

    const page =
      eventObject.path ||
      eventObject.page ||
      event.page ||
      "/";

    let path = page;

    try {
      path =
        new URL(page).pathname;
    } catch {
      path =
        safeString(page);
    }

    message =
      `Viewed ${path}`;
  }


  // ----------------------------------------------------------
  // CLICK
  // ----------------------------------------------------------

  else if (
    eventName === "click"
  ) {

    const label =
      eventObject.label ||
      eventObject.text ||
      eventObject.element ||
      "element";

    message =
      `Clicked "${safeString(label)}"`;
  }


  // ----------------------------------------------------------
  // NAVIGATION
  // ----------------------------------------------------------

  else if (
    eventName === "navigation"
  ) {

    const from =
      eventObject.from ||
      "/";

    const to =
      eventObject.to ||
      "/";

    message =
      `Navigated ${from} → ${to}`;
  }


  // ----------------------------------------------------------
  // IDENTIFY
  // ----------------------------------------------------------

  else if (
    eventName === "identify"
  ) {

    const email =
      eventObject.email ||
      eventObject.user_email;

    const userId =
      eventObject.user_id ||
      eventObject.userId;

    if (email) {
      message =
        `Identified as ${email}`;
    }

    else if (userId) {
      message =
        `Identified as ${userId}`;
    }

    else {
      message =
        "User identified";
    }
  }


  // ----------------------------------------------------------
  // ERROR ACTIVITY
  // ----------------------------------------------------------

  else if (
    eventName === "error_occurred"
  ) {
    message =
      "Error occurred";
  }


  // ----------------------------------------------------------
  // UNKNOWN EVENT
  // ----------------------------------------------------------

  else if (eventName) {

    message =
      eventName
        .replace(/_/g, " ")
        .replace(/\b\w/g, c =>
          c.toUpperCase()
        );
  }


  // ----------------------------------------------------------
  // TIME
  // ----------------------------------------------------------

  const localTime =
    event.local_time_display ||
    eventObject.local_time_display ||
    formatTime(
      event.timestamp ||
      eventObject.time ||
      new Date().toISOString()
    );


  if (localTime) {
    return `${localTime}   ${message}`;
  }

  return message;
}


// ============================================================
// SAVE NORMAL ACTIVITY
// ============================================================

async function saveActivity(
  env,
  event,
  application
) {

  const activityString =
    buildActivityString(event);


  const activity = {

    // REAL REPORTLI ACCOUNT USER
    user_id:
      application.user_id,

    // CUSTOMER SESSION
    session_id:
      event.session_id ||
      null,

    // EVENT TIME
    time:
      event.event?.time ||
      event.timestamp ||
      new Date().toISOString(),

    // HUMAN READABLE JSONB STRING
    event:
      activityString,

    // API KEY
    api_key:
      event.api_key ||
      null
  };


  await insertSupabase(
    env,
    "user_activity",
    activity
  );
}


// ============================================================
// SAVE ERROR ACTIVITY
// ============================================================
//
// Adds:
//
// 09:17 AM   Error occurred
//
// to user_activity.
//
// ============================================================

async function saveErrorActivity(
  env,
  event,
  application
) {

  const timestamp =
    event.timestamp ||
    new Date().toISOString();


  const localTime =
    event.local_time_display ||
    formatTime(timestamp);


  const activity = {

    user_id:
      application.user_id,

    session_id:
      event.session_id ||
      null,

    time:
      timestamp,

    event:
      `${localTime}   Error occurred`,

    api_key:
      event.api_key ||
      null
  };


  await insertSupabase(
    env,
    "user_activity",
    activity
  );
}


// ============================================================
// SARVAM AI
// ============================================================

async function generateAiAnalysis(
  env,
  event
) {

  if (!env.SARVAM_API_KEY) {
    throw new Error(
      "SARVAM_API_KEY is missing"
    );
  }


  const errorMessage =
    safeString(
      event.error_message,
      "Unknown error"
    );


  const fileName =
    safeString(
      event.file_name,
      "Unknown file"
    );


  const lineNumber =
    event.line_number ??
    "Unknown";


  const columnNumber =
    event.column_number ??
    "Unknown";


  const stackTrace =
    safeString(
      event.stack_trace,
      "No stack trace available"
    );


  const context =
    safeString(
      event.context,
      "Unknown"
    );


  const page =
    safeString(
      event.page,
      "Unknown"
    );


  // ----------------------------------------------------------
  // IMPORTANT:
  // Ask AI for explanation only.
  //
  // Exact location + stack trace are appended by Worker.
  // This prevents AI from changing technical information.
  // ----------------------------------------------------------

  const prompt = `
You are an AI employee helping a SaaS founder understand a production error.

Explain this error in very simple plain English.

Return exactly these sections:

Explanation:
1-2 short sentences.

Cause:
1-2 short sentences explaining the likely cause.

Recommended:
1-2 short sentences explaining what the developer should check or change.

Do not invent file names, line numbers, stack traces, URLs, users, or technical facts.

Error message:
${errorMessage}

Context:
${context}

Page:
${page}
`;


  const response =
    await fetch(
      SARVAM_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "api-subscription-key":
            env.SARVAM_API_KEY
        },

        body:
          JSON.stringify({
            model:
              "sarvam-105b",

            messages: [
              {
                role: "user",
                content: prompt
              }
            ],

            max_tokens: 1000,

            temperature: 0.2,

            reasoning_effort:
              null
          })
        }
      }
    );


  const responseText =
    await response.text();


  let data = null;


  try {
    data =
      JSON.parse(responseText);
  } catch {
    // handled below
  }


  if (!response.ok) {

    throw new Error(
      `Sarvam API ${response.status}: ${responseText}`
    );
  }


  const content =
    data?.choices?.[0]?.message?.content;


  if (
    !content ||
    typeof content !== "string"
  ) {
    throw new Error(
      "Sarvam returned no analysis"
    );
  }


  // ----------------------------------------------------------
  // EXACT TECHNICAL DATA IS ADDED BY SERVER
  // ----------------------------------------------------------

  return `${content.trim()}

Location:
${fileName}:${lineNumber}:${columnNumber}

Stack trace:
${stackTrace}`;
}


// ============================================================
// SAVE ERROR RECORD
// ============================================================
//
// This saves the actual error into:
//
// public.errors.error_message
//
// If AI fails, ai_analysis gets a fallback message.
// The original error is STILL saved.
//
// ============================================================

async function saveError(
  env,
  event,
  application
) {

  const errorId =
    createId("err");


  const timestamp =
    event.timestamp ||
    new Date().toISOString();


  const errorMessage =
    safeString(
      event.error_message,
      "Unknown error"
    );


  let aiAnalysis = "";


  // ----------------------------------------------------------
  // TRY AI
  // ----------------------------------------------------------

  try {

    aiAnalysis =
      await generateAiAnalysis(
        env,
        event
      );

  } catch (aiError) {

    console.error(
      "REPORTLI AI ANALYSIS FAILED",
      {
        message:
          aiError?.message ||
          String(aiError),

        stack:
          aiError?.stack ||
          null
      }
    );


    // IMPORTANT:
    // Do not lose the original error
    // just because AI failed.

    aiAnalysis =
      `AI analysis failed.

Reason:
${aiError?.message || String(aiError)}

Location:
${safeString(event.file_name, "Unknown file")}:${event.line_number ?? "Unknown"}:${event.column_number ?? "Unknown"}

Stack trace:
${safeString(event.stack_trace, "No stack trace available")}`;
  }


  const errorRow = {

    id:
      errorId,

    api_key:
      event.api_key ||
      null,

    error_message:
      errorMessage,

    timestamp,

    ai_analysis:
      aiAnalysis,

    user_id:
      application.user_id
  };


  await insertSupabase(
    env,
    "errors",
    errorRow
  );


  return {
    id: errorId,
    ai_analysis: aiAnalysis
  };
}


// ============================================================
// SAVE INTERNAL WORKER ERROR
// ============================================================
//
// If something goes wrong AFTER the application has already
// been validated, save that Worker error to the same
// public.errors table.
//
// This allows you to find pipeline errors later.
//
// Example:
//
// error_message:
//
// [REPORTLI_WORKER_ERROR]
// Failed to save activity: Supabase HTTP 500
//
// ============================================================

async function saveWorkerProcessingError(
  env,
  event,
  application,
  processingError
) {

  try {

    const message =
      processingError?.message ||
      String(processingError);


    const errorRow = {

      id:
        createId("worker_err"),

      api_key:
        event?.api_key ||
        null,

      error_message:
        `[REPORTLI_WORKER_ERROR] ${message}`,

      timestamp:
        event?.timestamp ||
        new Date().toISOString(),

      ai_analysis:
        `Reportli Worker processing failure.

Event type:
${safeString(event?.type, "Unknown")}

Domain:
${safeString(event?.domain, "Unknown")}

Stack:
${processingError?.stack || "No stack available"}`,

      user_id:
        application?.user_id ||
        null
    };


    await insertSupabase(
      env,
      "errors",
      errorRow
    );


    console.log(
      "REPORTLI WORKER ERROR SAVED",
      {
        error_id:
          errorRow.id
      }
    );


  } catch (saveError) {

    // --------------------------------------------------------
    // VERY IMPORTANT:
    // If Supabase itself is broken, we cannot save the error
    // into Supabase.
    //
    // Therefore Cloudflare logs remain the final fallback.
    // --------------------------------------------------------

    console.error(
      "REPORTLI FAILED TO SAVE WORKER ERROR",
      {
        original_error:
          processingError?.message ||
          String(processingError),

        save_error:
          saveError?.message ||
          String(saveError),

        original_stack:
          processingError?.stack ||
          null,

        save_stack:
          saveError?.stack ||
          null
      }
    );
  }
}


// ============================================================
// PROCESS ONE EVENT
// ============================================================

async function processEvent(
  env,
  event
) {

  // ----------------------------------------------------------
  // 1. VALIDATE APPLICATION FIRST
  // ----------------------------------------------------------
  //
  // NOTHING ELSE happens before this.
  //
  // No activity save.
  // No error save.
  // No Sarvam.
  //
  // ----------------------------------------------------------

  const application =
    await getApplicationForEvent(
      env,
      event
    );


  // ----------------------------------------------------------
  // 2. ERROR EVENT
  // ----------------------------------------------------------

  if (
    event.type === "ERROR"
  ) {

    // --------------------------------------------------------
    // SAVE ERROR RECORD
    // --------------------------------------------------------

    const errorResult =
      await saveError(
        env,
        event,
        application
      );


    // --------------------------------------------------------
    // SAVE HUMAN-READABLE ACTIVITY
    // --------------------------------------------------------

    try {

      await saveErrorActivity(
        env,
        event,
        application
      );

    } catch (activityError) {

      await saveWorkerProcessingError(
        env,
        event,
        application,
        activityError
      );

      // Do not destroy the already-saved error
      // because activity failed.
    }


    return {
      success: true,
      type: "ERROR",
      error_id:
        errorResult.id
    };
  }


  // ----------------------------------------------------------
  // 3. NORMAL ACTIVITY EVENT
  // ----------------------------------------------------------

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


// ============================================================
// PROCESS BATCH
// ============================================================

async function processBatch(
  env,
  events
) {

  if (!Array.isArray(events)) {

    throw new Error(
      "Batch must be an array"
    );
  }


  if (events.length === 0) {

    return [];
  }


  // Prevent accidental huge requests.
  if (events.length > 100) {

    throw new Error(
      "Maximum 100 events per request"
    );
  }


  const results = [];


  for (
    let i = 0;
    i < events.length;
    i++
  ) {

    const event =
      events[i];


    try {

      const result =
        await processEvent(
          env,
          event
        );


      results.push({
        index: i,
        success: true,
        ...result
      });


    } catch (error) {

      // ------------------------------------------------------
      // IMPORTANT:
      //
      // If validation failed, application may not exist.
      //
      // In that case we CANNOT save a Worker error using
      // user_id because we don't know the owner.
      //
      // Cloudflare logs the complete error.
      // ------------------------------------------------------

      console.error(
        "REPORTLI EVENT FAILED",
        {
          index: i,

          message:
            error?.message ||
            String(error),

          stack:
            error?.stack ||
            null,

          event_type:
            event?.type ||
            null,

          domain:
            event?.domain ||
            null
        }
      );


      results.push({

        index: i,

        success: false,

        error:
          error?.message ||
          String(error)
      });
    }
  }


  return results;
}


// ============================================================
// BROWSER SDK
// ============================================================

const REPORTLI_SDK = String.raw`
(function () {

  "use strict";


  // ==========================================================
  // PREVENT DOUBLE INITIALIZATION
  // ==========================================================

  if (window.__REPORTLI_LOADED__) {
    return;
  }

  window.__REPORTLI_LOADED__ = true;


  // ==========================================================
  // CONFIG
  // ==========================================================

  var WORKER_URL =
    "${WORKER_URL}";


  // ==========================================================
  // FIND API KEY
  // ==========================================================

  function getApiKey() {

    // --------------------------------------------------------
    // First support:
    //
    // window.REPORTLI_AI_KEY
    // --------------------------------------------------------

    if (
      window.REPORTLI_AI_KEY
    ) {

      return String(
        window.REPORTLI_AI_KEY
      ).trim();
    }


    // --------------------------------------------------------
    // Find current script
    // --------------------------------------------------------

    var currentScript =
      document.currentScript;


    if (
      currentScript &&
      currentScript.dataset &&
      currentScript.dataset.key
    ) {

      return String(
        currentScript.dataset.key
      ).trim();
    }


    // --------------------------------------------------------
    // Search Reportli scripts
    // --------------------------------------------------------

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
        src.indexOf("/reportli.js") !== -1 ||
        src.indexOf("/a_reportli.js") !== -1
      ) {

        if (
          script.dataset &&
          script.dataset.key
        ) {

          return String(
            script.dataset.key
          ).trim();
        }
      }
    }


    return "";
  }


  var API_KEY =
    getApiKey();


  // ==========================================================
  // SESSION
  // ==========================================================

  var SESSION_ID =
    "sess_" +
    Math.random()
      .toString(36)
      .substring(2) +
    Date.now().toString(36);


  var STARTED_AT =
    new Date().toISOString();


  // ==========================================================
  // USER
  // ==========================================================

  function detectUser() {

    try {

      if (
        window.reportliUser &&
        typeof window.reportliUser === "object"
      ) {

        return {

          email:
            window.reportliUser.email ||
            null,

          userId:
            window.reportliUser.userId ||
            window.reportliUser.user_id ||
            null
        };
      }

    } catch (e) {}

    return {
      email: null,
      userId: null
    };
  }


  // ==========================================================
  // LOCAL TIME
  // ==========================================================

  function getLocalTime() {

    try {

      return new Date()
        .toLocaleTimeString(
          "en-US",
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


  // ==========================================================
  // DOMAIN
  // ==========================================================

  function getDomain() {

    try {
      return window.location.hostname;
    } catch (e) {
      return "";
    }
  }


  // ==========================================================
  // SEND EVENT
  // ==========================================================

  function send(payload) {

    if (!API_KEY) {
      return;
    }


    // --------------------------------------------------------
    // Never track Reportli Worker itself.
    // --------------------------------------------------------

    try {

      if (
        payload &&
        payload.url &&
        payload.url.indexOf(
          WORKER_URL
        ) === 0
      ) {

        return;
      }

    } catch (e) {}


    payload.api_key =
      API_KEY;

    payload.domain =
      getDomain();

    payload.session_id =
      payload.session_id ||
      SESSION_ID;


    payload.timestamp =
      payload.timestamp ||
      new Date().toISOString();


    payload.local_time_display =
      payload.local_time_display ||
      getLocalTime();


    try {

      fetch(
        WORKER_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "X-API-Key":
              API_KEY
          },

          body:
            JSON.stringify(payload),

          keepalive: true
        }
      )
      .catch(function () {});

    } catch (e) {}
  }


  // ==========================================================
  // DEDUPLICATE ERRORS
  // ==========================================================

  var lastErrorKey =
    "";

  var lastErrorTime =
    0;


  function shouldSendError(
    message,
    stack
  ) {

    var key =
      String(message || "") +
      "|" +
      String(stack || "");


    var now =
      Date.now();


    if (
      key === lastErrorKey &&
      now - lastErrorTime < 2000
    ) {

      return false;
    }


    lastErrorKey =
      key;

    lastErrorTime =
      now;


    return true;
  }


  // ==========================================================
  // PAGE PATH
  // ==========================================================

  function getPath() {

    try {

      return (
        window.location.pathname +
        window.location.search
      );

    } catch (e) {

      return "/";
    }
  }


  // ==========================================================
  // SESSION START
  // ==========================================================

  send({

    type: "ACTIVITY",

    event: {

      event_name:
        "SESSION_STARTED",

      time:
        STARTED_AT
    }

  });


  // ==========================================================
  // INITIAL PAGE VIEW
  // ==========================================================

  send({

    type: "ACTIVITY",

    event: {

      event_name:
        "page_view",

      path:
        getPath(),

      time:
        new Date().toISOString()
    }

  });


  // ==========================================================
  // CLICK TRACKING
  // ==========================================================

  document.addEventListener(
    "click",
    function (event) {

      try {

        var target =
          event.target;


        if (!target) {
          return;
        }


        var label =
          target.innerText ||
          target.getAttribute("aria-label") ||
          target.getAttribute("title") ||
          target.tagName ||
          "element";


        label =
          String(label)
            .trim()
            .replace(/\s+/g, " ")
            .substring(0, 200);


        send({

          type: "ACTIVITY",

          event: {

            event_name:
              "click",

            label:
              label,

            page:
              getPath(),

            time:
              new Date().toISOString()
          }

        });

      } catch (e) {}

    },
    true
  );


  // ==========================================================
  // SPA NAVIGATION
  // ==========================================================

  var lastPath =
    getPath();


  function checkNavigation() {

    var current =
      getPath();


    if (
      current !== lastPath
    ) {

      var previous =
        lastPath;


      lastPath =
        current;


      send({

        type: "ACTIVITY",

        event: {

          event_name:
            "navigation",

          from:
            previous,

          to:
            current,

          time:
            new Date().toISOString()
        }

      });


      send({

        type: "ACTIVITY",

        event: {

          event_name:
            "page_view",

          path:
            current,

          time:
            new Date().toISOString()
        }

      });
    }
  }


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
        checkNavigation,
        0
      );

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

      setTimeout(
        checkNavigation,
        0
      );

      return result;
    };


  window.addEventListener(
    "popstate",
    function () {

      setTimeout(
        checkNavigation,
        0
      );

    }
  );


  // ==========================================================
  // ERROR HANDLER
  // ==========================================================

  function captureError(
    message,
    fileName,
    lineNumber,
    columnNumber,
    stack,
    context,
    extra
  ) {

    if (
      !shouldSendError(
        message,
        stack
      )
    ) {

      return;
    }


    send({

      type: "ERROR",

      error_message:
        String(
          message ||
          "Unknown error"
        ),

      file_name:
        fileName ||
        "",

      line_number:
        lineNumber ||
        null,

      column_number:
        columnNumber ||
        null,

      stack_trace:
        stack ||
        "",

      context:
        context ||
        "unknown",

      page:
        window.location.href,

      browser:
        navigator.userAgent,

      extra:
        extra ||
        null,

      timestamp:
        new Date().toISOString(),

      local_time_display:
        getLocalTime()
    });
  }


  // ==========================================================
  // WINDOW ONERROR
  // ==========================================================

  window.onerror =
    function (
      message,
      source,
      lineno,
      colno,
      error
    ) {

      captureError(

        message,

        source,

        lineno,

        colno,

        error &&
        error.stack
          ? error.stack
          : "",

        "window.onerror"
      );

      return false;
    };


  // ==========================================================
  // ERROR EVENT
  // ==========================================================

  window.addEventListener(
    "error",
    function (event) {

      try {

        if (
          event &&
          event.error
        ) {

          captureError(

            event.error.message,

            event.filename,

            event.lineno,

            event.colno,

            event.error.stack,

            "error_event"
          );

          return;
        }


        // Resource loading error

        captureError(

          "Resource failed to load",

          event.filename ||
            "",

          event.lineno ||
            null,

          event.colno ||
            null,

          "",

          "resource_error",

          {
            element:
              event.target &&
              event.target.tagName
                ? event.target.tagName
                : null
          }
        );

      } catch (e) {}
    },
    true
  );


  // ==========================================================
  // UNHANDLED PROMISE
  // ==========================================================

  window.addEventListener(
    "unhandledrejection",
    function (event) {

      try {

        var reason =
          event.reason;


        var message =
          reason &&
          reason.message
            ? reason.message
            : String(
                reason ||
                "Unhandled promise rejection"
              );


        var stack =
          reason &&
          reason.stack
            ? reason.stack
            : "";


        captureError(

          message,

          "",

          null,

          null,

          stack,

          "unhandledrejection"
        );

      } catch (e) {}
    }
  );


  // ==========================================================
  // FETCH MONITORING
  // ==========================================================

  if (
    window.fetch
  ) {

    var originalFetch =
      window.fetch;


    window.fetch =
      function () {

        var args =
          arguments;


        return originalFetch
          .apply(
            this,
            args
          )
          .then(
            function (response) {

              try {

                var requestUrl =
                  args[0] &&
                  args[0].url
                    ? args[0].url
                    : String(
                        args[0] || ""
                      );


                if (
                  requestUrl.indexOf(
                    WORKER_URL
                  ) !== 0 &&
                  (
                    response.status >= 400
                  )
                ) {

                  captureError(

                    "Fetch request failed: HTTP " +
                    response.status,

                    requestUrl,

                    null,
                    null,
                    "",
                    "fetch_http_error",

                    {
                      status:
                        response.status,

                      statusText:
                        response.statusText,

                      url:
                        requestUrl
                    }
                  );
                }

              } catch (e) {}


              return response;
            }
          )
          .catch(
            function (error) {

              var requestUrl =
                args[0] &&
                args[0].url
                  ? args[0].url
                  : String(
                      args[0] || ""
                    );


              if (
                requestUrl.indexOf(
                  WORKER_URL
                ) !== 0
              ) {

                captureError(

                  error &&
                  error.message
                    ? error.message
                    : "Fetch request failed",

                  requestUrl,

                  null,
                  null,

                  error &&
                  error.stack
                    ? error.stack
                    : "",

                  "fetch_network_error"
                );
              }


              throw error;
            }
          );
      };
  }


  // ==========================================================
  // XHR MONITORING
  // ==========================================================

  if (
    window.XMLHttpRequest
  ) {

    var OriginalXHR =
      window.XMLHttpRequest;


    function ReportliXHR() {

      var xhr =
        new OriginalXHR();


      var requestUrl =
        "";


      var originalOpen =
        xhr.open;


      xhr.open =
        function (
          method,
          url
        ) {

          requestUrl =
            String(url || "");


          return originalOpen.apply(
            xhr,
            arguments
          );
        };


      xhr.addEventListener(
        "load",
        function () {

          try {

            if (
              requestUrl.indexOf(
                WORKER_URL
              ) === 0
            ) {

              return;
            }


            if (
              xhr.status >= 400
            ) {

              captureError(

                "XHR request failed: HTTP " +
                xhr.status,

                requestUrl,

                null,
                null,
                "",
                "xhr_http_error",

                {
                  status:
                    xhr.status,

                  statusText:
                    xhr.statusText,

                  url:
                    requestUrl
                }
              );
            }

          } catch (e) {}
        }
      );


      xhr.addEventListener(
        "error",
        function () {

          if (
            requestUrl.indexOf(
              WORKER_URL
            ) !== 0
          ) {

            captureError(

              "XHR network error",

              requestUrl,

              null,
              null,
              "",
              "xhr_network_error"
            );
          }
        }
      );


      return xhr;
    }


    ReportliXHR.prototype =
      OriginalXHR.prototype;


    window.XMLHttpRequest =
      ReportliXHR;
  }


  // ==========================================================
  // REPORTLI PUBLIC API
  // ==========================================================

  window.Reportli = {

    // --------------------------------------------------------
    // identify()
    // --------------------------------------------------------

    identify:
      function (user) {

        user =
          user || {};


        window.reportliUser = {

          email:
            user.email ||
            null,

          userId:
            user.userId ||
            user.user_id ||
            null
        };


        send({

          type: "ACTIVITY",

          event: {

            event_name:
              "identify",

            email:
              user.email ||
              null,

            user_id:
              user.userId ||
              user.user_id ||
              null,

            time:
              new Date().toISOString()
          }

        });
      },


    // --------------------------------------------------------
    // capture()
    // --------------------------------------------------------

    capture:
      function (error, extra) {

        if (
          error instanceof Error
        ) {

          captureError(

            error.message,

            "",

            null,
            null,

            error.stack,

            "manual_capture",

            extra
          );

          return;
        }


        captureError(

          String(
            error ||
            "Unknown error"
          ),

          "",
          null,
          null,
          "",
          "manual_capture",

          extra
        );
      },


    // --------------------------------------------------------
    // track()
    // --------------------------------------------------------

    track:
      function (
        eventName,
        data
      ) {

        send({

          type: "ACTIVITY",

          event: {

            event_name:
              eventName,

            data:
              data ||
              {},

            time:
              new Date().toISOString()
          }

        });
      }

  };


  // ==========================================================
  // SESSION END
  // ==========================================================

  window.addEventListener(
    "beforeunload",
    function () {

      try {

        send({

          type: "ACTIVITY",

          event: {

            event_name:
              "SESSION_END",

            time:
              new Date().toISOString()
          }

        });

      } catch (e) {}
    }
  );


})();
`;


// ============================================================
// WORKER ENTRY POINT
// ============================================================

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    // --------------------------------------------------------
    // OPTIONS
    // --------------------------------------------------------

    if (
      request.method === "OPTIONS"
    ) {

      return new Response(
        null,
        {
          status: 204,
          headers: corsHeaders()
        }
      );
    }


    const url =
      new URL(request.url);


    // --------------------------------------------------------
    // SDK
    // --------------------------------------------------------

    if (
      request.method === "GET" &&
      (
        url.pathname === "/reportli.js" ||
        url.pathname === "/a_reportli.js"
      )
    ) {

      return new Response(
        REPORTLI_SDK,
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


    // --------------------------------------------------------
    // HEALTH CHECK
    // --------------------------------------------------------

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {

      return jsonResponse({
        success: true,
        service: "Reportli AI",
        status: "online",
        timestamp:
          new Date().toISOString()
      });
    }


    // --------------------------------------------------------
    // ONLY POST IS ALLOWED FOR EVENTS
    // --------------------------------------------------------

    if (
      request.method !== "POST"
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "Method not allowed"
        },
        405
      );
    }


    // --------------------------------------------------------
    // READ BODY
    // --------------------------------------------------------

    let body;

    try {

      body =
        await request.json();

    } catch (error) {

      console.error(
        "REPORTLI INVALID JSON",
        {
          message:
            error?.message ||
            String(error),

          stack:
            error?.stack ||
            null
        }
      );


      return jsonResponse(
        {
          success: false,
          error:
            "Invalid JSON body"
        },
        400
      );
    }


    // --------------------------------------------------------
    // HEADER API KEY FALLBACK
    // --------------------------------------------------------

    const headerApiKey =
      request.headers.get(
        "X-API-Key"
      );


    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      headerApiKey &&
      !body.api_key
    ) {

      body.api_key =
        headerApiKey;
    }


    // --------------------------------------------------------
    // BATCH REQUEST
    // --------------------------------------------------------

    if (
      Array.isArray(body)
    ) {

      const results =
        await processBatch(
          env,
          body
        );


      return jsonResponse({
        success: true,
        results
      });
    }


    // --------------------------------------------------------
    // SINGLE EVENT
    // --------------------------------------------------------

    try {

      const result =
        await processEvent(
          env,
          body
        );


      return jsonResponse({
        success: true,
        ...result
      });


    } catch (error) {

      console.error(
        "REPORTLI WORKER ERROR",
        {
          message:
            error?.message ||
            String(error),

          stack:
            error?.stack ||
            null,

          event_type:
            body?.type ||
            null,

          domain:
            body?.domain ||
            null
        }
      );


      // ------------------------------------------------------
      // IMPORTANT:
      //
      // If the application can be resolved, try to save the
      // Worker error into public.errors.
      //
      // If validation itself failed, there is no trusted
      // user_id, so only Cloudflare logs are used.
      // ------------------------------------------------------

      try {

        const application =
          await getApplicationForEvent(
            env,
            body
          );


        await saveWorkerProcessingError(
          env,
          body,
          application,
          error
        );

      } catch (loggingError) {

        console.error(
          "REPORTLI FINAL ERROR LOGGING FAILED",
          {
            original_error:
              error?.message ||
              String(error),

            logging_error:
              loggingError?.message ||
              String(loggingError),

            original_stack:
              error?.stack ||
              null,

            logging_stack:
              loggingError?.stack ||
              null
          }
        );
      }


      return jsonResponse(
        {
          success: false,

          error:
            error?.message ||
            String(error)
        },
        500
      );
    }
  }
};
