import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY as string });

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (body.eventType !== 'message') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const userMessage = body.text;
    const waId = body.waId; 
    
    // 1. Look up the store
    const { data: storeProfile, error: lookupError } = await supabase
      .from('stores')
      .select('*')
      .eq('whatsapp_number', waId)
      .single();

    if (lookupError || !storeProfile) {
      return NextResponse.json({ status: 'unrecognized_user' }, { status: 200 });
    }

    // 2. Fetch today's chat history to give the AI agent memory
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: chatHistory } = await supabase
      .from('store_responses')
      .select('partner_message, ai_reply')
      .eq('store_id', storeProfile.store_id)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true });

    let memoryContext = "No prior messages today.";
    if (chatHistory && chatHistory.length > 0) {
      memoryContext = chatHistory.map((msg: any) => `Manager: ${msg.partner_message}\nAI: ${msg.ai_reply}`).join('\n');
    }

    // 3. The New Investigative Prompt
    const systemPrompt = `
      You are an investigative Operations Agent for the SuperK central team.
      You are talking to the manager of ${storeProfile.store_name}.
      
      Your goal is to be a curious data collector. Find the exact root cause of their operational issues today.

      Conversation History Today:
      ${memoryContext}

      Rule 1: Keep replies strictly to 1 or 2 short sentences.
      Rule 2: Ask a specific follow-up question based on their last message to dig deeper.
      Rule 3: If you have successfully identified the root cause, do not ask more questions. Say "Thank you, I have logged this summary for the central dashboard."
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: 0.6,
    });

    const aiReplyText = completion.choices[0].message.content;

    // 4. Send via WATI with error catching
    if (aiReplyText) {
      const WATI_URL = process.env.WATI_API_URL as string;
      const WATI_TOKEN = process.env.WATI_BEARER_TOKEN as string;
      
      const watiResponse = await fetch(`${WATI_URL}/api/v1/sendSessionMessage/${waId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WATI_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messageText: aiReplyText })
      });

      const watiResult = await watiResponse.json();
      console.log(`[DEBUG] WATI Delivery Status:`, watiResult);
    }

    // 5. Save the interaction
    await supabase.from('store_responses').insert({
      store_id: storeProfile.store_id,
      partner_message: userMessage,
      ai_reply: aiReplyText,
    });

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}