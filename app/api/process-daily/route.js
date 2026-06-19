import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Helper to interact with your chosen LLM (e.g., OpenAI or Gemini API)
async function getInsightFromAI(storeName, metrics) {
  // In reality, you'd use the official SDK here. For the MVP, this is a simulated call.
  // The system prompt we discussed earlier goes here.
  const prompt = `Store: ${storeName}. Sales: ${metrics.sales}. AOV: ${metrics.aov}. Membership additions: ${metrics.membership_addition}. Provide a 1-sentence analytical insight on what metric needs attention today. Keep it under 100 characters.`;

  // Example AI response:
  return 'Membership additions were low compared to overall footfall yesterday.';
}

// Helper to push the message to WATI
async function sendWatiMessage(phoneNumber, storeName, aiInsight) {
  const WATI_URL = process.env.WATI_API_URL; // e.g., https://live-server-xxxx.wati.io
  const WATI_TOKEN = process.env.WATI_BEARER_TOKEN;

  const payload = {
    template_name: 'yesterday_performance_update', // Ensure this template is approved in WATI
    broadcast_name: `Daily Update - ${storeName}`,
    receivers: [
      {
        whatsappNumber: phoneNumber,
        customParams: [
          { name: 'store_name', value: storeName },
          { name: 'ai_insight', value: aiInsight },
        ],
      },
    ],
  };

  const response = await fetch(`${WATI_URL}/api/v1/sendTemplateMessages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WATI_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return response.json();
}

export async function POST(req) {
  try {
    // 1. Get the target date from the request (e.g., '2026-06-18')
    const { targetDate } = await req.json();

    // 2. Fetch all daily metrics for that date, joined with the store contact info
    const { data: records, error } = await supabase
      .from('daily_metrics')
      .select(
        `
        *,
        stores ( store_name, whatsapp_number, store_type )
      `
      )
      .eq('date', targetDate);

    if (error) throw error;
    if (!records || records.length === 0) {
      return NextResponse.json(
        { message: 'No records found for that date.' },
        { status: 404 }
      );
    }

    const processedLogs = [];

    // 3. Process each record through the AI and send via WATI
    for (const record of records) {
      const storeName = record.stores.store_name;
      const phoneNumber = record.stores.whatsapp_number;

      // Generate the insight using our metrics
      const insight = await getInsightFromAI(storeName, record);

      // Trigger the WhatsApp message
      // Note: We await this to ensure we don't hit rate limits on the WATI API
      const watiResponse = await sendWatiMessage(
        phoneNumber,
        storeName,
        insight
      );

      processedLogs.push({ storeName, insight, status: watiResponse });
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${records.length} stores.`,
      logs: processedLogs,
    });
  } catch (error) {
    console.error('Processing Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
