import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

// 1. Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY as string,
});

// 2. The Real AI Insight Generator
async function getInsightFromAI(storeName: string, metrics: any) {
  const systemPrompt = `
    You are a SuperK Retail Operations AI. 
    Analyze the provided daily store metrics and write a single, punchy 1-sentence insight (under 120 characters).
    Highlight the most critical metric that dropped or needs attention today. 
    Speak directly to the store manager. Be professional and objective.
  `;

  const userPrompt = `
    Store: ${storeName}
    Sales: ₹${metrics.sales}
    AOV: ₹${metrics.aov}
    Bill Cuts: ${metrics.bill_cuts}
    New Members Added: ${metrics.membership_addition}
    Non-Member Walk-in Rate: ${metrics.non_members_walking_percent}%
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.4, // Lower temperature keeps it highly analytical and factual
    });

    return completion.choices[0].message.content || "Please review your daily performance metrics.";
  } catch (error) {
    console.error("OpenAI Error:", error);
    return "Please review your daily performance metrics."; // Fallback if AI fails
  }
}

// 3. Helper to push the message to WATI
async function sendWatiMessage(phoneNumber: string, storeName: string, aiInsight: string) {
  const WATI_URL = process.env.WATI_API_URL as string;
  const WATI_TOKEN = process.env.WATI_BEARER_TOKEN as string;
  
  const payload = {
    template_name: "yesterday_performance_update", // Ensure this template exists in WATI
    broadcast_name: `Daily Update - ${storeName}`,
    receivers: [
      {
        whatsappNumber: phoneNumber,
        customParams: [
          { name: "store_name", value: storeName },
          { name: "ai_insight", value: aiInsight }
        ]
      }
    ]
  };

  const response = await fetch(`${WATI_URL}/api/v1/sendTemplateMessages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WATI_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return response.json();
}

// 4. The Main API Route Handler
export async function POST(req: Request) {
  try {
    const { targetDate } = await req.json();

    // Fetch metrics from Supabase
    const { data: records, error } = await supabase
      .from('daily_metrics')
      .select(`
        *,
        stores ( store_name, whatsapp_number, store_type )
      `)
      .eq('date', targetDate);

    if (error) throw error;
    if (!records || records.length === 0) {
      return NextResponse.json({ message: 'No records found for that date.' }, { status: 404 });
    }

    const processedLogs = [];

    // Process each record sequentially (or use Promise.all for speed if you have many stores)
    for (const record of records) {
      // Supabase joins return the relation as an object or array. We handle single objects here.
      const storeName = record.stores?.store_name || "SuperK Store";
      const phoneNumber = record.stores?.whatsapp_number;
      
      if (!phoneNumber) continue; // Skip if no number is found

      // Generate the insight using OpenAI
      const insight = await getInsightFromAI(storeName, record);
      
      // Trigger the WhatsApp message
      const watiResponse = await sendWatiMessage(phoneNumber, storeName, insight);
      
      processedLogs.push({ storeName, insight, status: watiResponse });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully processed ${records.length} stores.`,
      logs: processedLogs 
    });

  } catch (error: any) {
    console.error("Processing Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}