import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// 1. Helper to talk to the AI (Plug in OpenAI/Gemini here)
async function generateAIResponse(storeProfile, userMessage) {
  // In production, you will call the OpenAI or Gemini SDK here.
  // We pass the store profile so the AI knows if it's talking to a COCO or FOFO.

  const systemPrompt = `
    You are an Operations Assistant for SuperK. 
    You are talking to the leader of ${storeProfile.store_name}.
    Store Type: ${storeProfile.store_type} (${
    storeProfile.store_type === 'COCO' ? 'Employee' : 'Franchise Owner'
  }).
    Rule 1: Keep it under 2 sentences.
    Rule 2: Acknowledge their issue. 
    Rule 3: Politely end the conversation. Do not give business advice.
  `;

  // MOCK LLM RESPONSE FOR MVP (Replace with actual LLM call):
  console.log(
    `[AI Prompting Context] System: ${systemPrompt} | User: ${userMessage}`
  );

  return `Noted regarding the issue at ${storeProfile.store_name}. I will log this for the operations team so they can review it today. Have a great day ahead!`;
}

// 2. Helper to send the free-form message back via WATI
async function sendWatiSessionMessage(waId, text) {
  const WATI_URL = process.env.WATI_API_URL;
  const WATI_TOKEN = process.env.WATI_BEARER_TOKEN;

  const response = await fetch(
    `${WATI_URL}/api/v1/sendSessionMessage/${waId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WATI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messageText: text,
      }),
    }
  );

  return response.json();
}

// 3. The Main Webhook Receiver
export async function POST(req) {
  try {
    const body = await req.json();

    // WATI sends different event types. We only care about incoming messages.
    if (body.eventType !== 'messageReceived') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const userMessage = body.text;
    const waId = body.waId; // This is the partner's phone number
    const senderName = body.senderName;

    console.log(
      `📩 Received message from ${senderName} (${waId}): "${userMessage}"`
    );

    // Step A: Look up the store based on the phone number
    const { data: storeProfile, error } = await supabase
      .from('stores')
      .select('*')
      .eq('whatsapp_number', waId)
      .single();

    if (error || !storeProfile) {
      console.log(`⚠️ Unrecognized number: ${waId}. Ignoring.`);
      // Always return 200 to WATI so it doesn't retry the webhook
      return NextResponse.json(
        { status: 'unrecognized_user' },
        { status: 200 }
      );
    }

    // Step B: Ask the AI what to reply
    const aiReplyText = await generateAIResponse(storeProfile, userMessage);

    // Step C: Send the AI's reply back to the partner via WATI
    await sendWatiSessionMessage(waId, aiReplyText);

    // Step D: (Optional) Log this conversation back into Supabase for your dashboard
    // await supabase.from('chat_logs').insert({ store_id: storeProfile.store_id, message: userMessage, ai_response: aiReplyText });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook Error:', error);
    // WATI will retry if you send a 500, but we'll send a 200 so it doesn't spam your server on a crash
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}
