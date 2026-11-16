import { useState } from 'react';
import { campaignStore } from './campaign-state';
import { EN } from './strings-en';

/** Task 08.5 §3.3 «Report a problem» (pause, results and crash screens). */
export function ReportButton() {
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="report-action">
      <button
        className="text-button report-button"
        onClick={() => {
          const file = campaignStore.downloadReport();
          setStatus(file ? EN.report.done(file) : EN.report.failed);
        }}
      >
        {EN.report.button}
      </button>
      {status && (
        <p className="report-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
