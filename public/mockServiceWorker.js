/* eslint-disable */
/* tslint:disable */

/**
 * Mock Service Worker (0.51.0).
 * @see https://github.com/mswjs/msw
 * - Please do NOT modify this file.
 * - Please do NOT serve this file on production.
 */

const INTEGRITY_CHECKSUM = "3d6b9f06410d179a7f7404e4ad2f9bcd";
const activeClientIds = new Set();

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", async function (event) {
  const clientId = event.source.id;

  if (!clientId || !self.clients) {
    return;
  }

  const client = await self.clients.get(clientId);

  if (!client) {
    return;
  }

  const allClients = await self.clients.matchAll({
    type: "window",
  });

  switch (event.data) {
    case "KEEPALIVE_REQUEST": {
      sendToClient(client, {
        type: "KEEPALIVE_RESPONSE",
      });
      break;
    }

    case "INTEGRITY_CHECK_REQUEST": {
      sendToClient(client, {
        type: "INTEGRITY_CHECK_RESPONSE",
        payload: INTEGRITY_CHECKSUM,
      });
      break;
    }

    case "MOCK_ACTIVATE": {
      activeClientIds.add(clientId);

      sendToClient(client, {
        type: "MOCKING_ENABLED",
        payload: true,
      });
      break;
    }

    case "MOCK_DEACTIVATE": {
      activeClientIds.delete(clientId);

      sendToClient(client, {
        type: "MOCKING_DISABLED",
        payload: true,
      });
      break;
    }

    case "CLIENT_CLOSED": {
      activeClientIds.delete(clientId);

      const remainingClients = allClients.filter((client) => {
        return client.id !== clientId;
      });

      // Unregister itself when there are no more clients
      if (remainingClients.length === 0) {
        self.registration.unregister();
      }

      break;
    }
  }
});

self.addEventListener("fetch", function (event) {
  const { request } = event;
  const accept = request.headers.get("accept") || "";

  // Bypass server-sent events.
  if (accept.includes("text/event-stream")) {
    return;
  }

  // Bypass navigation requests.
  if (request.mode === "navigate") {
    return;
  }

  // Opening the DevTools triggers the "only-if-cached" request
  // so that's why we need to check for that, too.
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return;
  }

  // Bypass all requests when there are no active clients.
  // Prevents the self-unregistered worked from handling requests
  // after the client is closed.
  if (activeClientIds.size === 0) {
    return;
  }

  // Generate unique request ID.
  const requestId = Math.random().toString(36).substr(2, 9);

  event.respondWith(
    handleRequest(event, requestId).catch((error) => {
      if (error.name === "NetworkError") {
        console.warn(
          '[MSW] Successfully emulated a network error for the "%s %s" request.',
          request.method,
          request.url,
        );
      }

      // Using a `respondWith` handler and throwing an error
      // is not the same as calling `event.respondWith()` with a Response.
      // The latter will error the unhandled promise rejection.
      return;
    }),
  );
});

async function handleRequest(event, requestId) {
  const { request } = event;
  const { method, url, headers, body } = request;

  // Create a new URL to avoid modifying the original request URL.
  const urlObj = new URL(url);

  // Create a new Request instance to avoid modifying the original request.
  const requestClone = new Request(url, {
    method,
    headers,
    body,
  });

  // Set up a timeout for the request.
  const timeoutId = setTimeout(() => {
    console.warn(
      '[MSW] Request handler for "%s %s" is taking longer than expected. Consider using "requestIdleCallback" or "setTimeout" for more complex operations.',
      method,
      url,
    );
  }, 5000);

  try {
    // Send the request to the client-side MSW.
    const clientMessage = await sendToClient(
      {
        type: "REQUEST",
        payload: {
          id: requestId,
          url: urlObj.href,
          method,
          headers: Object.fromEntries(headers.entries()),
          cache: request.cache,
          mode: request.mode,
          credentials: request.credentials,
          destination: request.destination,
          integrity: request.integrity,
          redirect: request.redirect,
          referrer: request.referrer,
          referrerPolicy: request.referrerPolicy,
          body: await request.text(),
          keepalive: request.keepalive,
        },
      },
      [event.source],
    );

    clearTimeout(timeoutId);

    switch (clientMessage.type) {
      case "MOCK_SUCCESS": {
        return delayPromise(
          createResponse(clientMessage.payload),
          clientMessage.payload.delay,
        );
      }

      case "MOCK_NOT_FOUND": {
        return getOriginalResponse();
      }

      case "NETWORK_ERROR": {
        const { name, message } = clientMessage.payload;
        const networkError = new Error(message);
        networkError.name = name;

        // Rejecting a `respondWith` promise emulates a network error.
        throw networkError;
      }

      case "INTERNAL_ERROR": {
        console.error(
          `\
[MSW] Uncaught exception in the request handler for "%s %s":

${clientMessage.payload.error}

This exception has been gracefully handled as a 500 response, however, it's strongly recommended to resolve this error, as it indicates a mistake in your code. If you wish to mock an error response, please see this guide: https://mswjs.io/docs/recipes/mocking-error-responses\
`,
          method,
          url,
        );

        return createResponse(
          {
            status: 500,
            statusText: "Internal Server Error",
            body: clientMessage.payload.error,
          },
          {
            headers: {
              "Content-Type": "text/plain",
            },
          },
        );
      }
    }
  } catch (error) {
    clearTimeout(timeoutId);

    // Not using the `error` variable is a best practice.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    console.error(
      '[MSW] Failed to mock a "%s" request to "%s": %s',
      method,
      url,
      error,
    );

    return getOriginalResponse();
  }
}

function sendToClient(client, message) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      if (event.data && event.data.error) {
        return reject(event.data.error);
      }

      resolve(event.data);
    };

    client.postMessage(JSON.stringify(message), [channel.port2]);
  });
}

function delayPromise(callback, delay) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(callback()), delay);
  });
}

function createResponse(response, init) {
  return new Response(response.body, {
    ...init,
    status: response.status || 200,
    statusText: response.statusText || "OK",
    headers: response.headers || {},
  });
}

async function getOriginalResponse() {
  // Bypass mocking when the request is not handled by MSW.
  // This allows the request to pass through as-is.
  return fetch(request);
}
