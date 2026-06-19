'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default function ResponsesDashboard() {
  const [groupedResponses, setGroupedResponses] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResponses();
  }, []);

  async function fetchResponses() {
    setLoading(true);
    // Fetch logs from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('store_responses')
      .select(`
        *,
        stores ( store_name, store_type )
      `)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true }); // Chronological order for reading

    if (!error && data) {
      // Group the flat array into a structured object by Store Name
      const grouped = data.reduce((acc: any, log: any) => {
        const storeName = log.stores?.store_name || 'Unknown Store';
        if (!acc[storeName]) {
          acc[storeName] = { 
            type: log.stores?.store_type, 
            logs: [] 
          };
        }
        acc[storeName].logs.push(log);
        return acc;
      }, {});
      
      setGroupedResponses(grouped);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Today&apos;s Store Summaries</h1>
            <p className="text-gray-500">Live agentic investigations grouped by store.</p>
          </div>
          <button 
            onClick={fetchResponses} 
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shadow-sm transition-colors"
          >
            Refresh Feed
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500 animate-pulse">Syncing conversations...</p>
        ) : Object.keys(groupedResponses).length === 0 ? (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center text-gray-500">
            No active conversations today.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.keys(groupedResponses).map((storeName) => (
              <div key={storeName} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Card Header */}
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <h2 className="font-bold text-gray-800 text-lg">{storeName}</h2>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                    {groupedResponses[storeName].type}
                  </span>
                </div>
                
                {/* Conversation Thread */}
                <div className="p-6 space-y-4">
                  {groupedResponses[storeName].logs.map((log: any, index: number) => (
                    <div key={log.id} className="text-sm">
                      <div className="bg-gray-100 p-3 rounded-lg rounded-tl-none inline-block max-w-[80%] text-gray-800 mb-2">
                        <span className="font-bold text-xs text-gray-500 block mb-1">Partner Reply:</span>
                        {log.partner_message}
                      </div>
                      <div className="flex justify-end">
                        <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg rounded-tr-none inline-block max-w-[80%] text-blue-900">
                          <span className="font-bold text-xs text-blue-400 block mb-1">AI Agent:</span>
                          {log.ai_reply}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}