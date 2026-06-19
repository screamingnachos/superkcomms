'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ResponsesDashboard() {
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResponses();
  }, []);

  async function fetchResponses() {
    // Fetch logs and join with the stores table to get the store name
    const { data, error } = await supabase
      .from('store_responses')
      .select(`
        *,
        stores ( store_name, store_type )
      `)
      .order('created_at', { ascending: false }); // Newest first

    if (!error && data) {
      setResponses(data);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Partner Responses</h1>
            <p className="text-gray-500">Live feed of WhatsApp replies from store leaders.</p>
          </div>
          <button onClick={fetchResponses} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shadow-sm">
            Refresh Data
          </button>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading responses...</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Store</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Partner's Reply</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AI's Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {responses.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{log.stores?.store_name}</div>
                      <div className="text-xs text-gray-500">{log.stores?.store_type}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 w-1/3">
                      {log.partner_message}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 w-1/3">
                      {log.ai_reply}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {responses.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No responses logged yet. Start a broadcast!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}