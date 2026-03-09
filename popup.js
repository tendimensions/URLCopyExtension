function getCleanUrl(fullUrl) {
  // Strip query string (everything from ? onward) and fragments (# onward)
  const url = new URL(fullUrl);
  return url.origin + url.pathname;
}

async function init() {
  const urlDisplay = document.getElementById("url-display");
  const copyBtn = document.getElementById("copy-btn");
  const status = document.getElementById("status");

  // Get the active tab's URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    urlDisplay.textContent = "No URL available";
    copyBtn.disabled = true;
    return;
  }

  let cleanUrl;
  try {
    cleanUrl = getCleanUrl(tab.url);
  } catch {
    urlDisplay.textContent = tab.url;
    cleanUrl = tab.url;
  }

  urlDisplay.textContent = cleanUrl;

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(cleanUrl);
      status.textContent = "Copied!";
      status.className = "";
      setTimeout(() => { status.textContent = ""; }, 2000);
    } catch {
      status.textContent = "Failed to copy.";
      status.className = "error";
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
