// Export CSV button behaviour, with the browser pieces injected so it can be
// tested without a DOM.

/**
 * @param {object} deps
 * @param {{disabled: boolean, addEventListener: Function}} deps.button
 * @param {() => number} deps.count Exportable sessions right now.
 * @param {() => string} deps.csv
 * @param {() => string} deps.filename
 * @param {(message: string) => void} deps.announce
 * @param {Document} deps.document
 * @param {{createObjectURL: Function, revokeObjectURL: Function}} deps.url
 * @param {typeof Blob} deps.Blob
 * @param {Function} [deps.setTimeout]
 */
export function createExporter({ button, count, csv, filename, announce, document, url, Blob, setTimeout: later = setTimeout }) {
  function sync() {
    button.disabled = count() === 0;
  }

  function run() {
    const sessions = count();
    if (sessions === 0) {
      sync();
      announce('No completed sessions to export.');
      return false;
    }
    const href = url.createObjectURL(new Blob([csv()], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = filename();
    link.hidden = true;
    document.body.append(link);
    try {
      link.click();
    } finally {
      link.remove();
      // Give the browser a moment to start the download before releasing it.
      later(() => url.revokeObjectURL(href), 1000);
    }
    announce(`Exported ${sessions} ${sessions === 1 ? 'session' : 'sessions'}.`);
    return true;
  }

  button.addEventListener('click', run);
  sync();
  return { sync, run };
}
