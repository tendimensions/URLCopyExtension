# Clean URL Copy

A lightweight browser extension (Manifest V3) that copies the current page URL to your clipboard **without** the query string or fragment — everything up to (but not including) the `?`.

## Example

| Full URL | Copied URL |
|---|---|
| `https://example.com/results?q=foo&page=2` | `https://example.com/results` |
| `https://shop.com/item/42?ref=email#reviews` | `https://shop.com/item/42` |
| `https://example.com/about` | `https://example.com/about` |

## Features

- One-click copy via the toolbar popup
- Previews the clean URL before you copy
- Visual confirmation ("Copied!") after copying
- No background service worker — zero idle resource use
- No data leaves your browser

## Installation (Chrome / Edge / Brave)

1. Clone or download this repository.
2. Generate the icons (first time only):
   ```bash
   node generate-icons.js
   ```
3. Open your browser and navigate to `chrome://extensions` (or `edge://extensions`).
4. Enable **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the root folder of this repository.
6. The extension icon appears in your toolbar. Click it to copy the clean URL.

## Installation (Firefox)

1. Navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `manifest.json` from this folder.

> **Note:** Firefox temporary add-ons are removed on browser restart. For a permanent install, sign the extension via [addons.mozilla.org](https://addons.mozilla.org/developers/).

## Project Structure

```
URLCopyExtension/
├── manifest.json        # Extension manifest (MV3)
├── popup.html           # Toolbar popup UI
├── popup.css            # Popup styles
├── popup.js             # Popup logic — reads URL, strips query, copies
├── generate-icons.js    # Node script to regenerate placeholder icons
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## How It Works

`popup.js` uses `chrome.tabs.query` to get the active tab URL, then passes it through the browser-native `URL` constructor:

```js
function getCleanUrl(fullUrl) {
  const url = new URL(fullUrl);
  return url.origin + url.pathname;
}
```

`url.origin` gives `https://example.com` and `url.pathname` gives `/results`, so the query string (`?…`) and fragment (`#…`) are naturally excluded.

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read the URL of the currently active tab when the popup is opened |
| `clipboardWrite` | Write the clean URL to the system clipboard |

## Customization

- **Icons:** Replace the files in `icons/` with your own 16×16, 48×48, and 128×128 PNG artwork.
- **Keep the fragment (`#…`) too?** Change `getCleanUrl` to `return url.origin + url.pathname + url.hash;`.
- **Include the query string selectively?** Manipulate `url.searchParams` in `popup.js` before building the output string.

## License

MIT
