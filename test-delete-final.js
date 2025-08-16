// Final comprehensive delete debug script
// Run this in browser console to diagnose delete issues

(function debugDeleteFinal() {
  console.log("🔍 DELETE DEBUG v2 - After ID validation fix");
  console.log("=".repeat(50));

  // 1. Check for delete buttons
  const deleteButtons = document.querySelectorAll(
    'button[aria-label="Delete message"]',
  );
  console.log(`\n✅ Delete buttons found: ${deleteButtons.length}`);

  // 2. Check message elements and their structure
  const messageElements = document.querySelectorAll(
    '[data-role="user"], [data-role="assistant"]',
  );
  console.log(`📧 Message elements found: ${messageElements.length}`);

  // 3. Analyze each message for delete button presence
  let messagesWithButtons = 0;
  let messagesWithoutButtons = 0;

  messageElements.forEach((el, idx) => {
    const hasDeleteBtn = el.querySelector(
      'button[aria-label="Delete message"]',
    );
    if (hasDeleteBtn) {
      messagesWithButtons++;
    } else {
      messagesWithoutButtons++;
      // Log why this message doesn't have a delete button
      console.warn(
        `Message ${idx + 1} missing delete button (${el.getAttribute("data-role")} role)`,
      );
    }
  });

  console.log(`\n📊 Delete Button Stats:`);
  console.log(`  - Messages WITH delete buttons: ${messagesWithButtons}`);
  console.log(`  - Messages WITHOUT delete buttons: ${messagesWithoutButtons}`);

  // 4. Test ID validation
  console.log("\n🆔 Testing ID Validation:");

  // Test some sample IDs
  const testIds = [
    "jh7abc123|456def789", // Valid Convex format
    "msg_1234567890", // Local message format
    "local_chat_123", // Local chat format
    "abcd1234efgh5678ijkl9012mnop3456", // 32-char alphanum (old wrong format)
    "123456789", // Invalid format
  ];

  testIds.forEach((id) => {
    const hasPipe = id.includes("|");
    console.log(
      `  "${id}" -> ${hasPipe ? "✅ Valid Convex ID" : "❌ Not a Convex ID"}`,
    );
  });

  // 5. Intercept delete attempts
  console.log("\n🎯 Setting up delete click interceptor...");

  deleteButtons.forEach((btn, idx) => {
    // Remove old listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    // Add new listener
    newBtn.addEventListener("click", function (e) {
      console.log(`\n🗑️ DELETE BUTTON ${idx + 1} CLICKED!`);

      // Try to find the message ID from React props
      let reactFiber =
        newBtn._reactInternalFiber ||
        newBtn._reactInternalInstance ||
        Object.keys(newBtn).find((k) =>
          k.startsWith("__reactInternalInstance"),
        );

      if (reactFiber) {
        console.log("Found React fiber:", reactFiber);
      }

      // Log the click event details
      console.log("Click event:", {
        target: e.target,
        currentTarget: e.currentTarget,
        defaultPrevented: e.defaultPrevented,
      });

      // Check if confirm dialog appears
      const originalConfirm = window.confirm;
      window.confirm = function (msg) {
        console.log("✅ Confirm dialog triggered:", msg);
        const result = originalConfirm.call(window, msg);
        console.log("User response:", result ? "YES" : "NO");
        return result;
      };
    });
  });

  // 6. Monitor network for delete mutations
  console.log("\n📡 Setting up network monitor...");

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const [url, options] = args;

    if (options && options.body) {
      try {
        const body = JSON.parse(options.body);
        if (body.path && body.path.includes("deleteMessage")) {
          console.log("🚀 DELETE MUTATION DETECTED!");
          console.log("Mutation details:", {
            url,
            path: body.path,
            args: body.args,
          });

          // Check the message ID being sent
          if (body.args && body.args.messageId) {
            const msgId = body.args.messageId;
            console.log(`Message ID sent: "${msgId}"`);
            console.log(
              `ID has pipe: ${msgId.includes("|") ? "YES ✅" : "NO ❌"}`,
            );
          }
        }
      } catch (e) {
        // Not JSON or parse error
      }
    }

    // Call original fetch and log response
    return originalFetch.apply(this, args).then((response) => {
      if (options && options.body && options.body.includes("deleteMessage")) {
        response
          .clone()
          .json()
          .then((data) => {
            if (data.error) {
              console.error("❌ Delete mutation error:", data.error);
            } else {
              console.log("✅ Delete mutation success:", data);
            }
          })
          .catch(() => {});
      }
      return response;
    });
  };

  console.log("\n✅ Debug setup complete!");
  console.log("Instructions:");
  console.log("1. Click any delete button to see detailed logs");
  console.log("2. Check for confirm dialog appearance");
  console.log("3. Watch for network mutations");
  console.log("4. Look for error messages above");

  // 7. Check authentication
  if (window.localStorage) {
    const authToken = localStorage.getItem("convex-auth-token");
    console.log(
      `\n🔐 Auth status: ${authToken ? "Authenticated" : "Not authenticated"}`,
    );
  }

  return {
    deleteButtons: deleteButtons.length,
    messages: messageElements.length,
    messagesWithButtons,
    messagesWithoutButtons,
  };
})();
