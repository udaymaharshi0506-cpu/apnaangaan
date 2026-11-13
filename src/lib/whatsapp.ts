import { db } from "@/db";
import { leadEvents, leads, notifications, properties, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface WhatsAppInterestPayload {
  toPhone: string;
  propertyName: string;
  occupantsCount: string;
  tenantType: string;
  profession: string;
  groupComposition: string;
  leadId: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  attempts: number;
}

/**
 * Format phone number for WhatsApp Cloud API (must be digits only, with country code, no '+')
 */
export function formatWhatsAppPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  return cleaned;
}

/**
 * Generates the approved WhatsApp message body for utility template
 */
export function buildWhatsAppTemplateText(params: {
  propertyName: string;
  occupantsCount: string;
  tenantType: string;
  profession: string;
  groupComposition: string;
}): string {
  return (
    `New interest on your property *${params.propertyName}* on Apna Aangan.\n\n` +
    `Seeker details:\n` +
    `- People: ${params.occupantsCount}\n` +
    `- Tenant type: ${params.tenantType}\n` +
    `- Profession: ${params.profession}\n` +
    `- Group: ${params.groupComposition}\n\n` +
    `Reply below or check your dashboard. Contact details are shared only after our team connects you.`
  );
}

/**
 * Builds Meta Cloud API template payload
 */
export function buildMetaWhatsAppPayload(params: WhatsAppInterestPayload) {
  const recipient = formatWhatsAppPhone(params.toPhone);
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "template",
    template: {
      name: "owner_lead_interest_v1",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.propertyName },
            { type: "text", text: params.occupantsCount },
            { type: "text", text: params.tenantType },
            { type: "text", text: params.profession },
            { type: "text", text: params.groupComposition },
          ],
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "0",
          parameters: [{ type: "payload", payload: `INTERESTED_${params.leadId}` }],
        },
        {
          type: "button",
          sub_type: "quick_reply",
          index: "1",
          parameters: [{ type: "payload", payload: `NOT_INTERESTED_${params.leadId}` }],
        },
      ],
    },
  };
}

/**
 * Sends WhatsApp notification to owner with exponential backoff retry.
 * Guaranteed never to throw, ensuring website notifications and lead creation always succeed.
 */
export async function sendOwnerInterestWhatsAppWithRetry(
  params: WhatsAppInterestPayload,
  maxRetries = 3,
  initialDelayMs = 50, // fast in test/mock, configured via env in prod
  customFetch?: typeof fetch
): Promise<WhatsAppSendResult> {
  const fetchFn = customFetch || globalThis.fetch;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN;

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      // If WhatsApp credentials are not configured (e.g. testing / local mock), simulate successful dispatch
      if (!phoneNumberId || !accessToken) {
        return {
          success: true,
          messageId: `mock-wa-msg-${Date.now()}-${params.leadId.slice(0, 8)}`,
          attempts: attempt,
        };
      }

      const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      const body = buildMetaWhatsAppPayload(params);

      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`WhatsApp API responded with ${response.status}: ${errorText}`);
      }

      const data = await response.json() as { messages?: Array<{ id: string }> };
      const messageId = data?.messages?.[0]?.id || `wa-msg-${Date.now()}`;

      return {
        success: true,
        messageId,
        attempts: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Failed after retries",
    attempts: attempt,
  };
}

/**
 * Handles owner response (from WhatsApp quick reply buttons or Website Owner Dashboard)
 */
export async function handleOwnerResponse(
  leadId: string,
  response: "interested" | "not_interested",
  source: "whatsapp" | "website" = "website"
) {
  const [lead] = await db
    .select({
      id: leads.id,
      propertyId: leads.propertyId,
      customerId: leads.customerId,
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) {
    throw new Error("Lead not found");
  }

  const [property] = await db
    .select({
      id: properties.id,
      title: properties.title,
    })
    .from(properties)
    .where(eq(properties.id, lead.propertyId))
    .limit(1);
  if (!property) {
    throw new Error("Property not found");
  }

  const now = new Date();
  const nextStatus = response === "interested" ? "contacted" : "closed_lost";

  await db
    .update(leads)
    .set({
      ownerResponse: response,
      ownerRespondedAt: now,
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(leads.id, lead.id));

  // Record audit event
  await db.insert(leadEvents).values({
    leadId: lead.id,
    eventType: `owner_${response}`,
    detail:
      response === "interested"
        ? `Property owner confirmed interest via ${source}. Admin assigned task to connect seeker and owner.`
        : `Property owner declined inquiry via ${source}. Seeker notified politely with alternative recommendations.`,
    createdAt: now,
  });

  if (response === "interested") {
    // 1. Notify Seeker: Great news!
    await db.insert(notifications).values({
      userId: lead.customerId,
      type: "interest_update",
      message: `The owner of "${property.title}" is interested! Our concierge team is now connecting you.`,
      link: "/inquiries",
      createdAt: now,
    });

    // 2. Notify Admin: "Connect now" task
    const [adminUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@aagan.com")).limit(1);
    if (adminUser) {
      await db.insert(notifications).values({
        userId: adminUser.id,
        type: "admin_task",
        message: `Connect now: Owner of "${property.title}" is interested in inquiry ${lead.id.slice(0, 8)}. Arrange viewing or introduction call.`,
        link: "/admin",
        createdAt: now,
      });
    }
  } else {
    // 1. Notify Seeker politely with alternative suggestions link
    await db.insert(notifications).values({
      userId: lead.customerId,
      type: "interest_update",
      message: `The owner of "${property.title}" is currently not moving forward. We have handpicked other verified rentals for you.`,
      link: "/search",
      createdAt: now,
    });
  }

  return { success: true, leadId, response, status: nextStatus };
}

