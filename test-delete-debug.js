// Debug script for message deletion issue
// Run this in browser console to test delete functionality

(function debugDelete() {
  console.log("🔍 Starting delete functionality debug...");

  // Check if delete buttons exist
  const deleteButtons = document.querySelectorAll(
    'button[aria-label="Delete message"]',
  );
  console.log(`✅ Found ${deleteButtons.length} delete buttons`);

  if (deleteButtons.length === 0) {
    console.error(
      "❌ No delete buttons found! Check if messages have _id field",
    );

    // Check message structure in React DevTools
    console.log("💡 Checking for message data attributes...");
    const messageElements = document.querySelectorAll(
      '[data-role="user"], [data-role="assistant"]',
    );
    console.log(`📧 Found ${messageElements.length} message elements`);

    // Check what's being rendered
    messageElements.forEach((el, idx) => {
      const role = el.getAttribute("data-role");
      const hasDeleteButton = el.querySelector(
        'button[aria-label="Delete message"]',
      );
      console.log(
        `Message ${idx + 1} (${role}): Delete button = ${hasDeleteButton ? "YES" : "NO"}`,
      );
    });
  }

  // Try to find React fiber to inspect props
  if (window.React && window.React.version) {
    console.log("⚛️ React version:", window.React.version);
  }

  // Check if Convex is loaded
  if (window.__convex) {
    console.log("🔥 Convex client detected");
  }

  // Monitor network for delete requests
  console.log("📡 Monitoring network for delete mutations...");
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const [url, options] = args;
    if (options && options.body && options.body.includes("deleteMessage")) {
      console.log("🚀 Delete mutation detected!", {
        url,
        body: options.body,
      });
    }
    return originalFetch.apply(this, args);
  };

  // Add click listener to all delete buttons
  deleteButtons.forEach((btn, idx) => {
    btn.addEventListener(
      "click",
      (e) => {
        console.log(`🗑️ Delete button ${idx + 1} clicked!`);
        console.log("Event:", e);
        console.log("Target:", e.target);
        console.log("Current target:", e.currentTarget);
      },
      true,
    );
  });

  console.log("✅ Debug setup complete. Try clicking a delete button now.");
  console.log(
    "💡 If no delete buttons show, messages might not have _id field.",
  );
  console.log(
    "💡 Check React DevTools for MessageItem props to see message structure.",
  );
})();
