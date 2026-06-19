'use client';

import { useState, ChangeEvent } from 'react';
// @ts-ignore
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';

export default function DailyMetricsUpload() {
  // Added TypeScript generics: <File | null>, <boolean>, <string>, <string | null>
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string | null>(null);

  // Added React.ChangeEvent<HTMLInputElement> to define 'e'
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setTargetDate(null); 
      setMessage('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a CSV file first.');
      return;
    }

    setUploading(true);
    setMessage('Parsing CSV...');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => { // Added 'any' type here
        const data = results.data;
        
        const extractedDate = data[0].Date;
        
        setMessage(`Uploading ${data.length} store records for ${extractedDate}...`);

        const formattedData = data.map((row: any) => ({ // Added 'any' type here
          date: row.Date,
          store_id: row.Store_ID,
          sales: parseFloat(row.Sales),
          bill_cuts: parseInt(row.Bill_Cuts),
          aov: parseFloat(row.AOV),
          membership_addition: parseInt(row.Membership_Addition),
          non_members_walking_percent: parseFloat(row.Non_Members_Walking_Percent),
          total_membership_count: parseInt(row.Total_Membership_Count),
          membership_sales: parseFloat(row.Membership_Sales),
          membership_aov: parseFloat(row.Membership_AOV),
          membership_bill_cuts: parseInt(row.Membership_Bill_Cuts)
        }));

        const { error } = await supabase
          .from('daily_metrics')
          .insert(formattedData);

        if (error) {
          setMessage(`Upload failed: ${error.message}`);
        } else {
          setMessage(`✅ Success! Data for ${extractedDate} uploaded to Supabase.`);
          setTargetDate(extractedDate); 
          setFile(null); 
        }
        setUploading(false);
      },
      error: (error: any) => { // Added 'any' type here
        setMessage(`Error reading file: ${error.message}`);
        setUploading(false);
      }
    });
  };

  const handleSendUpdates = async () => {
    setSending(true);
    setMessage(`Generating AI insights and sending to WATI for ${targetDate}...`);

    try {
      const response = await fetch('/api/process-daily', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetDate }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage(`✅ Broadcast Complete! Sent ${result.logs.length} WhatsApp messages.`);
      } else {
        setMessage(`❌ Broadcast Failed: ${result.error}`);
      }
    } catch (error: any) { // Added 'any' type here
      setMessage(`❌ Server Error: ${error.message}`);
    }

    setSending(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">SuperK Daily Operations</h1>
        <p className="text-gray-500 mb-8">Upload CSV metrics to generate insights and notify store partners.</p>

        {/* Step 1: Upload Section */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Step 1: Upload Data</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:bg-gray-50 transition-colors">
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className={`mt-4 w-full py-3 px-4 rounded-lg text-white font-medium transition-colors ${
              uploading || !file ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {uploading ? 'Processing Data...' : 'Upload & Process Metrics'}
          </button>
        </div>

        {/* Step 2: Trigger Section */}
        {targetDate && (
          <div className="pt-8 border-t border-gray-200">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Step 2: Trigger AI Broadcast</h2>
            <p className="text-sm text-gray-600 mb-4">
              Database updated for <strong>{targetDate}</strong>. Click below to analyze metrics and send WhatsApp updates.
            </p>
            <button
              onClick={handleSendUpdates}
              disabled={sending}
              className={`w-full py-3 px-4 rounded-lg text-white font-medium transition-colors ${
                sending ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-md'
              }`}
            >
              {sending ? 'Sending WhatsApp Updates...' : `Send Updates via WATI`}
            </button>
          </div>
        )}

        {/* Status Message */}
        {message && (
          <div className={`mt-6 p-4 rounded-lg text-sm ${
            message.includes('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 
            message.includes('❌') ? 'bg-red-50 text-red-800 border border-red-200' : 
            'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}