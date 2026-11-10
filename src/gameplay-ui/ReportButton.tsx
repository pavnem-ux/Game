import { useState } from 'react';
import { campaignStore } from './campaign-state';
import { RU } from './strings-ru';

/** Task 08.5 §3.3 «Сообщить о проблеме» (pause, results and crash screens). */
export function ReportButton() {
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="report-action">
      <button
        className="text-button report-button"
        onClick={() => {
          const file = campaignStore.downloadReport();
          setStatus(file ? RU.report.done(file) : RU.report.failed);
        }}
      >
        {RU.report.button}
      </button>
      {status && (
        <p className="report-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
