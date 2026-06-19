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

    if (body.eventType !== 'messageReceived') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const userMessage = body.text;
    const waId = body.waId; 
    const senderName = body.senderName;

    console.log(`📩 Received message from ${senderName} (${waId}): "${userMessage}"`);

    // Step A: Look up the store
    const { data: storeProfile, error } = await supabase
      .from('stores')
      .select('*')
      .eq('whatsapp_number', waId)
      .single();

    if (error || !storeProfile) {
      console.log(`⚠️ Unrecognized number: ${waId}. Ignoring.`);
      return NextResponse.json({ status: 'unrecognized_user' }, { status: 200 });
    }

    // Step B: Ask OpenAI what to reply
    const aiReplyText = await generateAIResponse(storeProfile, userMessage);

    // Step C: Send the reply via WATI
    if (aiReplyText) {
       await sendWatiSessionMessage(waId, aiReplyText);
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}