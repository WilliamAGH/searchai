"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { getErrorMessage } from "./lib/errors";

// Helper function to send emails via MailPit
async function sendEmailToMailPit(args: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const mailpitHost = process.env.MAILPIT_HOST;
  const apiAuth = process.env.MP_SEND_API_AUTH;

  if (!mailpitHost || !apiAuth) {
    throw new Error("MailPit configuration missing");
  }

  try {
    // Build payload per Mailpit Send API schema: TitleCase keys, structured objects
    // https://mailpit.axllent.org/docs/api-v1/#send-message
    const defaultFromEmail = "team@search-ai.io";
    const defaultFromName = "SearchAI";

    const rawFrom = args.from || `${defaultFromName} <${defaultFromEmail}>`;

    // Parse "Name <email>" or plain email
    let fromEmail = defaultFromEmail;
    let fromName: string | undefined = defaultFromName;
    const angleMatch = rawFrom.match(/^(.*)<\s*([^>]+)\s*>\s*$/);
    if (angleMatch) {
      fromName = angleMatch[1].trim() || undefined;
      fromEmail = angleMatch[2].trim();
    } else {
      // If it's just an email address, keep name undefined
      const emailLike = rawFrom.trim();
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLike)) {
        fromEmail = emailLike;
        fromName = undefined;
      }
    }

    const mailpitBody: Record<string, unknown> = {
      From: {
        Email: fromEmail,
        ...(fromName ? { Name: fromName } : {}),
      },
      To: [
        {
          Email: args.to,
        },
      ],
      Subject: args.subject,
      HTML: args.html,
    };

    const response = await fetch(`${mailpitHost}/api/v1/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(apiAuth)}`,
      },
      body: JSON.stringify(mailpitBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MailPit API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return { success: true, messageId: result.ID };
  } catch (error) {
    console.error("Failed to send email:", error);
    throw new Error(`Failed to send email: ${getErrorMessage(error)}`);
  }
}

// Public action for sending emails (exposed to API)
export const sendEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    from: v.optional(v.string()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{ success: boolean; messageId?: string }> => {
    return await sendEmailToMailPit(args);
  },
});

export const sendWelcomeEmail = action({
  args: {
    userEmail: v.string(),
    userName: v.optional(v.string()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{ success: boolean; messageId?: string; message?: string }> => {
    const welcomeHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to SearchAI</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to SearchAI!</h1>
            <p style="color: #e6fffa; margin: 10px 0 0 0; font-size: 16px;">AI-powered web search at your fingertips</p>
          </div>
          
          <div style="padding: 0 20px;">
            <h2 style="color: #1f2937;">Hi ${args.userName || "there"}!</h2>
            
            <p>Thank you for joining SearchAI! You now have access to:</p>
            
            <ul style="background: #f9fafb; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981;">
              <li><strong>Unlimited AI-powered searches</strong> - Ask anything and get real-time web results</li>
              <li><strong>Source citations</strong> - Every answer comes with verifiable sources</li>
              <li><strong>Chat history</strong> - Your conversations are saved and searchable</li>
              <li><strong>Share conversations</strong> - Share interesting findings with others</li>
            </ul>
            
            <p>Ready to get started? <a href="https://search-ai.io" style="color: #10b981; text-decoration: none; font-weight: bold;">Start searching now →</a></p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #6b7280; font-size: 14px;">
              Questions? Just reply to this email - we're here to help!<br>
              <br>
              Best regards,<br>
              The SearchAI Team
            </p>
          </div>
        </body>
      </html>
    `;

    // Use helper function to avoid circular dependency
    return await sendEmailToMailPit({
      to: args.userEmail,
      subject: "Welcome to SearchAI - Start searching with AI!",
      html: welcomeHtml,
    });
  },
});
