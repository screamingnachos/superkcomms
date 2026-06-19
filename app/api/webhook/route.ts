import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

// Initialize the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY as string,
});

// 1. The Real AI Function
async function generateAIResponse(storeProfile: any, userMessage: string) {
  const systemPrompt = `
    You are an Operations Assistant for the SuperK central team. 
    You are talking to the leader of ${storeProfile.store_name}.
    Store Type: ${storeProfile.store_type} (${storeProfile.store_type === 'COCO' ? 'Employee' : 'Franchise Owner'}).
    
    Rule 1: Keep it under 2 sentences.
    Rule 2: Acknowledge their specific issue. 
    Rule 3: Politely end the conversation. 
    Rule 4: Do NOT give business advice, promise inventory, or invent SuperK policies.
  `;

  // Call the actual OpenAI API
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.7, // Keeps the response professional and predictable
  });

  return completion.choices[0].message.content;
}

// 2. Helper to send the free-form message back via WATI
async function sendWatiSessionMessage(waId: string, text: string) {
  const WATI_URL = process.env.WATI_API_URL as string;
  const WATI_TOKEN = process.env.WATI_BEARER_TOKEN as string;
  
  const response = await fetch(`${WATI_URL}/api/v1/sendSessionMessage/${waId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WATI_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messageText: text
    })
  });

  return response.json();
}

// 3. The Main Webhook Receiver
export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log(`[DEBUG RAW BODY]:`, JSON.stringify(body, null, 2));
    if (body.eventType !== 'messageReceived') {
      console.log(`[DEBUG] Ignored event because type was: ${body.eventType}`);
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const userMessage = body.text;
    const waId = body.waId; 
    const senderName = body.senderName;

    // DIAGNOSTIC LOG 1: Confirm payload extraction
    console.log(`[DEBUG] Ingested Webhook. waId: "${waId}", message: "${userMessage}"`);

    const { data: storeProfile, error: lookupError } = await supabase
      .from('stores')
      .select('*')
      .eq('whatsapp_number', waId)
      .single();

    // DIAGNOSTIC LOG 2: Check if database lookup failed
    if (lookupError) {
      console.error(`[DEBUG] Supabase Lookup Error for number ${waId}:`, lookupError.message);
      return NextResponse.json({ status: 'lookup_error', error: lookupError.message }, { status: 200 });
    }

    if (!storeProfile) {
      console.log(`[DEBUG] Lookup succeeded but returned 0 rows for number: ${waId}`);
      return NextResponse.json({ status: 'unrecognized_user' }, { status: 200 });
    }

    console.log(`[DEBUG] Found matching store: ${storeProfile.store_name} (ID: ${storeProfile.store_id})`);

    const aiReplyText = await generateAIResponse(storeProfile, userMessage);

    if (aiReplyText) {
       await sendWatiSessionMessage(waId, aiReplyText);
    }

    // DIAGNOSTIC LOG 3: Catch exact insert failures
    const { error: insertError } = await supabase.from('store_responses').insert({
      store_id: storeProfile.store_id,
      partner_message: userMessage,
      ai_reply: aiReplyText,
    });

    if (insertError) {
      console.error(`[DEBUG] Supabase Insert Error into store_responses:`, insertError.message);
      return NextResponse.json({ status: 'insert_error', error: insertError.message }, { status: 200 });
    }

    console.log(`[DEBUG] Successfully saved log to database for ${storeProfile.store_name}`);
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error("[DEBUG] Global Try/Catch Caught Fatal Crash:", error);
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}