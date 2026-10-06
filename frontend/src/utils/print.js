/**
 * Utility function to print HTML content reliably across Electron desktop app and web browsers.
 * Uses a hidden iframe so it does not trigger window popup blockers, about:blank OS popups,
 * or unwanted child windows in Electron.
 */
export function printHtml(html) {
  // Strip any inline auto-print scripts to prevent double printing
  const cleanHtml = (html || '').replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*window\.print[^<]*<\/script>/gi,
    ''
  );

  const iframe = document.createElement('iframe');
  iframe.setAttribute(
    'style',
    'position:fixed;top:0;left:0;width:100%;height:100%;border:none;opacity:0;pointer-events:none;z-index:-9999;'
  );

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
    } catch {}
  };

  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) {
      throw new Error('Unable to access iframe document');
    }

    doc.open();
    doc.write(cleanHtml);
    doc.close();

    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }

    win.onafterprint = cleanup;

    // Small timeout to ensure styles and DOM nodes are fully rendered before printing
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error('Print execution failed:', err);
      } finally {
        // Fallback cleanup in case onafterprint doesn't fire in certain environments
        setTimeout(cleanup, 3000);
      }
    }, 250);
  } catch (err) {
    console.error('printHtml setup failed:', err);
    cleanup();

    // Fallback if iframe fails: try window.open
    try {
      const fallbackWin = window.open('', '_blank');
      if (fallbackWin) {
        fallbackWin.document.open();
        fallbackWin.document.write(cleanHtml);
        fallbackWin.document.close();
        fallbackWin.focus();
        fallbackWin.print();
      }
    } catch (fallbackErr) {
      console.error('Fallback print also failed:', fallbackErr);
    }
  }
}

